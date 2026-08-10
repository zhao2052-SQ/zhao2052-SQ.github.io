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
    const raw = await fs.readFile(safePath(name), 'utf8');
    const entry = { name, label: LABELS[name] || name, raw, kind: path.extname(name).slice(1) };
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
      const { name, data, raw } = JSON.parse(await readBody(req));
      const file = safePath(name);
      let text;
      if (typeof raw === 'string') {
        text = raw;
      } else {
        text = TOML.stringify(data);
        TOML.parse(text); // validate round-trip before writing
        if (!text.endsWith('\n')) text += '\n';
      }
      await fs.copyFile(file, file + '.bak').catch(() => {});
      await fs.writeFile(file, text, 'utf8');
      return json(res, 200, { ok: true, name, bytes: Buffer.byteLength(text) });
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
