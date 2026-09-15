# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Auntie Boo Crafts (abc11ty) — a static 11ty site that mirrors an Etsy shop's
listings, plus a local-only admin tool for layering hand-added content on top
of the scraped data. Two independent Node projects live side by side, each
with its own `package.json`/`node_modules`:

- **`web/`** — the 11ty site (`index.html`, `gen.js`, `_data/boo.json`,
  `img-product/`, `css/`, `js/`). This is what Netlify builds and deploys
  (`netlify.toml` sets `base = "web"`, `command = "npm run build"`,
  `publish = "_site"`).
- **`admin/`** — a local-only Express + vanilla-JS admin page for editing
  `web/_data/boo.json` without hand-editing JSON. Not deployed anywhere.

The root `package.json` is a thin wrapper: `build`/`serve`/`clean` delegate
into `web/`, and `admin` delegates into `admin/`.

## Commands

```shell
# install deps (each project has its own node_modules)
cd web && npm install && cd ..
cd admin && npm install && cd ..

# build / serve the site (from repo root, delegates into web/)
npm run build
npm run serve      # eleventy --serve, with live reload

# run the admin tool (from repo root, delegates into admin/)
npm run admin      # or: cd admin && npm start
# open http://localhost:4321

# re-scrape Etsy and regenerate web/_data/boo.json (run from web/ — not
# wrapped at the root)
cd web && node gen.js
# or, to reuse the Etsy-sourced sections already in boo.json without hitting
# Etsy (re-sort pinned sections, normalize the file, dry run):
cd web && node gen.js --skip-fetch

# run site + admin together, sharing the same web/ dir (admin edits show up
# live in the site's dev server)
docker compose up

# scripts/ below all assume they're run from the repo root

# sweep web/img-product/ for orphaned files (not referenced in boo.json or
# boo-old.json) — requires jq
./scripts/cleanup-unused-images.sh [--dry-run]

# strip EXIF/ICC/C2PA metadata from every image in web/img-product/ in place
# — requires exiftool; admin uploads are stripped automatically via sharp
./scripts/strip-image-metadata.sh

# commit + push web/_data/boo.json and web/img-product/ if either changed
# — run on a schedule via cron, see "Auto-sync" below
./scripts/git-sync.sh

# update vendored bootstrap assets (run from web/)
cd web
cp ./node_modules/bootstrap/dist/css/bootstrap.min.css ./css/
cp ./node_modules/bootstrap/dist/js/bootstrap.min.js ./js/
cp ./node_modules/bootstrap-icons/font/fonts/* ./css/fonts/
```

There is no test suite, linter, or type checker in this repo.

## Architecture

### Data model: `web/_data/boo.json`

Everything the site renders flows from this single 11ty global-data file: an
array of *sections*, each with `sectionId`, `sectionTitle`, `items[]`, and
optionally `subcategories[]` (each `{ name, show, items[] }`). 11ty loads it
as the `boo` data object consumed by `index.html`.

The file is **both** generated and hand-edited: `gen.js` scrapes Etsy and
overwrites the Etsy-sourced parts, but anything tagged `"manual": true` is
preserved across regeneration. There are two forms of manual content:

- **A whole manual section** — `sectionId` doesn't match any real Etsy
  section, section itself tagged `"manual": true`. Carried forward
  completely untouched by `gen.js`, so its internal shape (including
  `subcategories`) is entirely author-defined.
- **Manual items on a real Etsy section** — same `sectionId` as an Etsy
  section, but only the *item* is tagged `"manual": true` (the section
  itself stays untagged). `gen.js` re-appends these onto the freshly
  scraped section on every run, matched purely by the per-item tag.

A few fields on an Etsy-backed section (`pinned`, `sectionDescription`,
`show`) are never set by a raw scrape, so their presence always means a
human set them — `gen.js` and `admin/server.js` both carry these forward via
a shared allowlist (`OVERLAY_FIELDS` in `admin/server.js`, mirrored inline in
`preserveManualContent()` in `gen.js` — **keep these two in sync by hand**,
there's no shared module).

`gen.js` always writes a backup to `_data/boo-old.json` before overwriting
`boo.json`; `admin/server.js`'s `writeBoo()` does the same on every save.

### `web/gen.js` (the scraper)

Run manually, not part of the eleventy build. Two phases:

1. Fetch the shop home page, parse its section nav (`button.wt-menu__item`)
   for `sectionId`/`sectionTitle`, skipping sections in `ignoreSections` and
   the catch-all section `"0"`. For each section, fetch its listing page and
   scrape every product card (title, Etsy URL, image), downloading/resizing
   each image to `img-product/<listingId>.png` via `@11ty/eleventy-img`.
2. `preserveManualContent()` merges the fresh scrape with the previous
   `boo.json`, per the manual-content rules above, then pinned sections are
   sorted to the front (stable otherwise).

Etsy fetches use a browser-like header set (`trickyHeaders`) and a 3s delay
between section requests to avoid being blocked; responses are cached for
1 day via `@11ty/eleventy-fetch`. `--skip-fetch` skips both network calls
entirely and treats the *existing* Etsy-sourced sections in `boo.json` as the
scrape baseline.

### `web/index.html` and rendering

Single-page 11ty template (Nunjucks/Liquid-style tags). Renders a nav button
per visible section (`section.show != false`) plus one content block per
section, each showing that section's flat `items` (filtered to `show: true`)
and each visible `subcategories` group under its own sub-heading. Per-item
markup is factored into `_includes/item-card.html`, used for both flat items
and subcategory items — it renders a Bootstrap card whose click target is
either an image-viewer modal (manual items — carousel if multiple `images`)
or a direct link to `item.etsyPage` (Etsy items, open in a new tab).

All section switching happens client-side in `web/js/app.js`: every section's
content block is rendered into the page at build time, and a `nav`
button/`data-role="item"` div pairing toggles which one is visible
(`abc-items-active` vs `abc-items-hidden`) — there's no per-section route or
rebuild. `app.js` also blocks right-click/drag on product images
(`.abc-product-img`, a soft deterrent only) and keeps a carousel's thumbnail
strip in sync with the active slide.

The Cloudflare Web Analytics beacon script in `<head>` is gated behind
`env.isProduction` (`web/_data/env.js`, true only when Netlify's `CONTEXT`
build env var is `production`), so it never fires on local `npm run
build`/`serve` or deploy previews.

### `admin/server.js` (local editing tool)

Plain Express server + static vanilla-JS/Bootstrap frontend (`admin/public/`,
no build step). Resolves all paths (`_data/`, `img-product/`, `css/`)
relative to `../web` from wherever it's run, so it always edits the real
site data. REST-ish JSON API over `boo.json`, structured around the section →
(items | subcategories → items) hierarchy, with authorization baked into
each route rather than a shared middleware:

- Full sections can only be created/deleted/renamed if `manual: true`; the
  three overlay fields (`sectionDescription`/`pinned`/`show`) are editable on
  *any* section since `gen.js` preserves them regardless.
- Items can only be edited/deleted through the API if `item.manual === true`
  (Etsy-sourced items are read-only here — editing them would just be
  clobbered by the next `gen.js` run).
- Subcategories exist only on manual sections.
- Reordering endpoints (`PUT .../order`) reorder only the manual items
  within a section (Etsy items keep the scrape order gen.js re-establishes
  every run) or the full list within a subcategory/section-of-subcategories.

Image uploads (`POST /api/images`, multer memory storage, 10MB cap, allowed
extensions `.png/.jpg/.jpeg/.webp/.gif`) are re-encoded through `sharp`
before being written to `img-product/` as `upload-<8-hex-id>.<ext>` — this
strips EXIF/GPS/camera metadata as a side effect of not calling
`.withMetadata()`. The returned path is added to an item's `images[]` only
once the client hits Save.

`SITE_URL` env var (set in `docker-compose.yml`) powers the admin header's
"Preview site" link; unset when running `server.js` directly, so the link
stays hidden.

Saving in the admin tool only updates the local `boo.json` (and, for image
uploads, `img-product/`) — actually deploying it still requires a commit +
push, which is handled by `scripts/git-sync.sh` on a cron schedule (see
below), not by `server.js` itself.

### Auto-sync (`scripts/git-sync.sh` + cron)

`scripts/git-sync.sh` (assumes it's run from the repo root) commits and
pushes `web/_data/boo.json` and `web/img-product/` whenever either has
changed, and no-ops cleanly otherwise. It's meant to run unattended, not to be wired into
`admin/server.js` or `gen.js` directly, so that admin edits and scrapes
make it to git (and Netlify deploys) without anyone having to remember.
Scheduled via a user crontab entry (the `cd` matters, since the script
assumes the repo root as its cwd):

```
*/15 * * * * cd /home/knoone/Code/abc11ty && ./scripts/git-sync.sh >> .git-sync.log 2>&1
```

Only works where this is actually set up (the machine running
`npm run admin` locally) — the `docker compose up` `admin` container has no
`.git` directory mounted and no `git` binary in its `node:20-alpine` image,
so auto-sync doesn't apply there. The repo's remote (`git@github.com:...`)
is SSH-based, so this also depends on the cron user's SSH key working with
no passphrase prompt (cron has no SSH agent available).

### Docker compose

`web` and `admin` run as separate `node:20-alpine` containers sharing the
same bind-mounted `./web` directory (so admin writes are immediately visible
to the site's dev server), each with its own named `node_modules` volume.
Both containers `chown` the node_modules volume to the unprivileged `node`
user before installing/running, since Docker creates it root-owned on first
mount. `web` uses `CHOKIDAR_USEPOLLING=true` since bind-mount file events
don't propagate reliably on macOS/Windows Docker.
