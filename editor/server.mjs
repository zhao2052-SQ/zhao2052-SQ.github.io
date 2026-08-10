import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as TOML from 'smol-toml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT = path.join(ROOT, 'content');
const PORT = 4000;
const PREVIEW = 'http://localhost:3000';

const LABELS = {
  'config.toml': 'Site & Profile',
  'about.toml': 'Homepage Layout',
  'bio.md': 'Bio (About text)',
  'news.toml': 'News',
  'research.toml': 'Research',
  'awards.toml': 'Awards',
  'services.toml': 'Services',
  'cv.md': 'CV',
  'cv.toml': 'CV Page Config',
  'publications.bib': 'Publications (BibTeX)',
  'publications.toml': 'Publications Page Config',
};

const ORDER = [
  'config.toml', 'bio.md', 'news.toml', 'research.toml',
  'awards.toml', 'services.toml', 'cv.md', 'publications.bib',
  'about.toml', 'cv.toml', 'publications.toml',
];

function safePath(name) {
  const p = path.join(CONTENT, name);
  if (!p.startsWith(CONTENT + path.sep)) throw new Error('Invalid path');
  return p;
}

async function listFiles() {
  const names = (await fs.readdir(CONTENT)).filter((n) => /\.(toml|md|bib)$/.test(n));
  names.sort((a, b) => {
    const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const out = [];
  for (const name of names) {
    const p = safePath(name);
    const raw = await fs.readFile(p, 'utf8');
    const stat = await fs.stat(p);
    const entry = {
      name, label: LABELS[name] || name, raw,
      kind: path.extname(name).slice(1),
      mtime: stat.mtimeMs,
    };
    if (entry.kind === 'toml') {
      try { entry.data = TOML.parse(raw); } catch (e) { entry.parseError = String(e.message || e); }
    }
    out.push(entry);
  }
  return out;
}

function json(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 5e6) req.destroy(); });
    req.on('end', () => resolve(d));
    req.on('error', reject);
  });
}

// Fetch the rendered page and strip volatile markup so two snapshots of an
// unchanged page compare equal.
async function snapshot(target) {
  try {
    const r = await fetch(target + (target.includes('?') ? '&' : '?') + '_s=' + Date.now(), {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const html = await r.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/_s=\d+/g, '')
      .replace(/_r=\d+/g, '')
      .replace(/\?v=[\w-]+/g, '');
  } catch {
    return null;
  }
}

// Poll the dev server until the rendered output actually reflects the write.
async function waitForRebuild(target, before, budgetMs = 20000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < budgetMs) {
    await new Promise((r) => setTimeout(r, 350));
    const now = await snapshot(target);
    if (now === null) continue;      // dev server mid-recompile
    last = now;
    if (before === null || now !== before) {
      return { synced: true, waitedMs: Date.now() - t0 };
    }
  }
  return { synced: last !== null, waitedMs: Date.now() - t0, timedOut: true };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (req.method === 'GET' && url.pathname === '/') {
      const html = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html.replaceAll('__PREVIEW_URL__', PREVIEW));
    }

    if (req.method === 'GET' && url.pathname === '/api/files') {
      return json(res, 200, { files: await listFiles() });
    }

    if (req.method === 'POST' && url.pathname === '/api/save') {
      const { name, data, raw, previewPath, mtime } = JSON.parse(await readBody(req));
      const file = safePath(name);

      // Refuse to clobber edits made on disk after this file was loaded.
      if (typeof mtime === 'number') {
        const cur = await fs.stat(file).catch(() => null);
        if (cur && cur.mtimeMs - mtime > 1000) {
          return json(res, 409, {
            error: 'stale',
            message: `content/${name} changed on disk after you loaded it. Reload to get the newer version, or press Save again to overwrite.`,
            diskMtime: cur.mtimeMs,
          });
        }
      }

      let text;
      if (typeof raw === 'string') {
        text = raw;
      } else {
        text = TOML.stringify(data);
        TOML.parse(text); // validate round-trip before writing
        if (!text.endsWith('\n')) text += '\n';
      }

      const target = PREVIEW + (previewPath || '/');
      const before = await snapshot(target);

      await fs.copyFile(file, file + '.bak').catch(() => {});
      await fs.writeFile(file, text, 'utf8');

      const sync = await waitForRebuild(target, before);
      const st = await fs.stat(file).catch(() => null);
      return json(res, 200, { ok: true, name, bytes: Buffer.byteLength(text), mtime: st ? st.mtimeMs : 0, ...sync });
    }

    if (req.method === 'POST' && url.pathname === '/api/revert') {
      const { name } = JSON.parse(await readBody(req));
      const file = safePath(name);
      await fs.copyFile(file + '.bak', file);
      return json(res, 200, { ok: true });
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    json(res, 500, { error: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`Homepage live editor  ->  http://localhost:${PORT}`);
  console.log(`Editing content in ${CONTENT}`);
  console.log(`Preview target     ->  ${PREVIEW}`);
});
