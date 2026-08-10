# PRISM Live Editor

A small browser-based editor for the `content/` files of this PRISM site.
Click fields to edit, hit **Save**, and the live site refreshes automatically.

## Run

Two processes are needed:

```bash
# 1. the PRISM site  ->  http://localhost:3000
npm run dev

# 2. the editor      ->  http://localhost:4000
node editor/server.mjs
```

Then open <http://localhost:4000>.

> If `npm install` fails with an `EACCES` cache error, use a local cache:
> `npm install --cache /tmp/npm-cache-stella`

## What it does

| Feature | Notes |
|---|---|
| Form editing for `.toml` | Fields are generated from the file structure — text, numbers, checkboxes, string lists |
| Add / delete / reorder | For repeated blocks such as News, Research, Awards, Services |
| Raw editing for `.md` / `.bib` | Bio, CV and BibTeX open as full-height text areas |
| Live preview | Right pane iframes the real site and reloads after each save |
| Backup on every save | Previous version is kept as `content/<file>.bak`; **Revert file** restores it |
| ⌘S / Ctrl+S | Saves the current file |

## Caveats

- Saving a `.toml` file through the **form** rewrites it, so **comments in that file are lost**.
  Files you never open in form mode are untouched.
- `smol-toml` validates the output before writing, so a malformed save is rejected rather than
  corrupting the file.
- The editor binds to localhost only. Do not expose port 4000 publicly — it writes to disk.

## Content map

| File | Controls |
|---|---|
| `config.toml` | Name, title, institution, social links, navigation menu, i18n |
| `bio.md` | The About paragraph on the homepage |
| `news.toml` | News list |
| `publications.bib` | Publications. `selected={true}` pins an entry to the homepage |
| `research.toml`, `awards.toml`, `services.toml` | Card pages |
| `cv.md` | CV page body |
| `about.toml` | Homepage section order and research-interest tags |

To add a page, create `content/<name>.toml` and add it to `[[navigation]]` in `config.toml`.

## Deploy

```bash
npm run build     # static export to out/
```

See `docs/deployment.md` for GitHub Pages / Cloudflare Pages instructions.
