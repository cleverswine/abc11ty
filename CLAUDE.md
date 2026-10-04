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
# install deps - the root install also installs web/ and admin/ (each has
# its own node_modules), via the root package.json's postinstall
npm install

# build / serve the site (from repo root, delegates into web/)
npm run build
npm run serve      # eleventy --serve, with live reload

# run the admin tool (from repo root, delegates into admin/)
npm run admin      # or: cd admin && npm start
# open http://localhost:4321

# re-scrape Etsy and regenerate web/_data/boo.json (run from web/ — not
# wrapped at the root)
cd web && node gen.js
# or, to rebuild the etsy-shop section from the Etsy items already in
# boo.json without hitting Etsy (normalizes the file; a dry run of the merge):
cd web && node gen.js --skip-fetch
# or, to re-download just one listing's images (thumbnail + photo
# gallery) without scraping the whole shop - e.g. after changing its photos
# on Etsy. A listing not in boo.json yet is added to the top of the
# etsy-shop subcategory named by the last entry of its page's breadcrumb
# (created if missing; if no breadcrumb is found, the top of the section
# itself, until a full run scrapes it into its real subcategory):
cd web && node gen.js --item https://www.etsy.com/listing/<id>/...
# gen.js runs a visible (headed) browser by default: if Etsy shows a
# DataDome captcha (gen.js logs full status/headers/body on any non-2xx
# response), solve it by hand in the browser window, then press Enter in the
# terminal to retry. The resulting session (web/.etsy-session.json,
# gitignored) is reused by later runs. For an unattended run with no display
# (cron, SSH), pass --headless: blocked pages are skipped instead of waited
# on, leaving their existing data untouched:
cd web && node gen.js --headless

# run site + admin together, sharing the same web/ dir (admin edits show up
# live in the site's dev server)
docker compose up

# scripts/ below all assume they're run from the repo root

# sweep web/img-product/ for orphaned files (not referenced in boo.json)
# — requires jq
./scripts/cleanup-unused-images.sh [--dry-run]

# strip EXIF/ICC/C2PA metadata from every image in web/img-product/ in place
# — requires exiftool; admin uploads are stripped automatically via sharp
./scripts/strip-image-metadata.sh

# commit + push web/_data/boo.json and web/img-product/ if either changed,
# and push dev to main if the admin page's Publish button was pressed
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

Everything the site renders flows from this single 11ty global-data file,
loaded as the `boo` data object that `index.html` consumes. It's an array of
*sections*:

```
{ sectionId, sectionTitle, sectionDescription?, show,
  events?: [{ id, name, date, location, link, show }],
  items?: [item],
  subcategories?: [{ name, show, items: [item] }] }      // "groups" in the admin UI

item = { id, title, description, images: [path], etsyPage, show,
         source: "Etsy" | "Manual" }
```

Today there are two sections: `live-events` (hand-made: events plus groups
of hand-added products) and `etsy-shop` (owned by `gen.js`: one subcategory
per Etsy shop section). Display order is array order.

The file is **both** generated and hand-edited, and `item.source` is the
only thing that tells the two apart:

- **`source: "Etsy"`** items are written by `gen.js` and replaced on every
  run, so they're read-only in the admin tool (`isEtsyItem()` in
  `web/lib/boo.js`, mirrored in `admin/public/app.js`).
- **Everything else** (`source: "Manual"`, set by the admin tool) is
  hand-made and never touched by `gen.js` — including hand-added items
  inside `etsy-shop`'s subcategories, which `gen.js` keeps after the fresh
  Etsy items.

`gen.js` only ever rewrites the `etsy-shop` section (`ETSY_SECTION_ID`);
every other section is passed through untouched. Within `etsy-shop` it keeps
the admin-edited `sectionTitle`, `sectionDescription` and `show`, each
subcategory's `show`, and the subcategory order. Renaming `etsy-shop`'s id
would make `gen.js` create a fresh one.

`images[0]` is the card image. For Etsy items it's a small thumbnail
(`<listingId>.webp`) followed by the full-size gallery, which starts with the
same picture, so the image-viewer modal skips `images[0]` for Etsy items
(`slide_offset` in `_includes/item-card.html`). For manual items every image
is a real photo.

`web/lib/boo.js` is the one place that reads and writes the file, imported
by both `gen.js` and `admin/server.js` (as `../web/lib/boo.js`): `readBoo`,
`writeBoo` (a tmp file + rename, so a concurrent reader - the admin server,
`git-sync.sh`, the eleventy dev server - never sees half a file) and
`isEtsyItem`.

### `web/gen.js` (the scraper)

Run by hand, not part of the eleventy build. The comment block at the top
of the file describes the phases and safety rules; in short:

1. `scrapeShop()` fetches the shop home page and reads its section nav
   (`button.wt-menu__item[data-section-id]`), skipping Etsy's catch-all
   section `"0"` and anything in `IGNORE_SECTIONS`. For each section,
   `scrapeSection()` reads every listing card (title, URL, thumbnail), saving
   the thumbnail as `img-product/<listingId>.webp` (340px wide) via
   `@11ty/eleventy-img`, then fetches each listing's own page and downloads
   every carousel photo full-size as `img-product/<listingId>-<n>.jpg`
   (a listing's photos download in parallel; they come from Etsy's image
   CDN, not the rate-limited pages). Items are built by `etsyItem()`.
   An item's title is the first comma-separated phrase of Etsy's
   keyword-list title, which becomes its `description`.
2. `buildBoo()` / `mergeSubcategories()` rebuild `etsy-shop`: each Etsy
   section becomes a subcategory (new ones appended, ones gone from Etsy
   dropped if nothing hand-added is left in them), fresh Etsy items first,
   then that subcategory's hand-added items.

`--item <url>` (`refreshItem()`) re-downloads one listing's images in place;
a listing not in `boo.json` yet goes to the top of the subcategory named by
the last entry of its page's breadcrumb (created if missing), or the top of
`etsy-shop`'s own `items` if there's no breadcrumb, until a full run files
it properly.

Pages are fetched through Playwright-driven Chromium (plain `fetch()` gets a
403), with a 3s delay (`REQUEST_DELAY_MS`) before every request, and the
browser session is saved to `.etsy-session.json` between runs. A blocked
page never wipes data: a blocked home page keeps all of `etsy-shop`, a
blocked section page keeps that subcategory, and a blocked listing page
keeps that item's previous gallery. `--skip-fetch` skips Etsy entirely and
re-runs the merge with the Etsy items already in `boo.json`.

### `web/index.html` and rendering

Single-page 11ty (Liquid) template. Every visible section (`show != false`)
gets a nav link (a plain `#sectionId` anchor) and a `<section>` with its
description (rendered by the `markdown` filter in `eleventy.config.js`),
visible events, visible flat `items`, a row of chips linking to each visible
subcategory that has visible items, and then those subcategories. A
hand-made subcategory whose name matches a visible `etsy-shop` subcategory
ends with a "More <group> in <etsy-shop's title>" card linking down to it.
The Etsy section (`etsy_id` in the template, which must match gen.js's
`ETSY_SECTION_ID`) gets the sage theme and a "Visit shop on Etsy" button,
every other section slate; a section with an `events` list gets a map-pin
icon, others a shopping bag (`_includes/section-icon.html`). The theme
class only sets `--accent-*` CSS variables, which everything themed inside
the section reads. The shop's URL lives in `_data/shop.json`, shared with
`gen.js`.

Per-item markup is `_includes/item-card.html`: a card showing `images[0]`
(lazy-loaded) that opens a Bootstrap image-viewer modal for every item — a
carousel with a thumbnail strip if there's more than one photo, plus a
"Purchase this item on Etsy" button for Etsy items and the description for
manual ones. Every modal is rendered into the page at build time.

`web/js/app.js` is small: it blocks right-click/drag on product images
(`.abc-product-img`, a soft deterrent only), keeps each carousel's thumbnail
strip in sync with the active slide, and sizes the "More …" cards to the
photo beside them with a `ResizeObserver`.

The Cloudflare Web Analytics beacon script in `<head>` is gated behind
`env.isProduction` (`web/_data/env.js`, true only when Netlify's `CONTEXT`
build env var is `production`), so it never fires on local `npm run
build`/`serve` or deploy previews.

### `admin/server.js` (local editing tool)

Plain Express server + static vanilla-JS/Bootstrap frontend (`admin/public/`,
no build step). Resolves all paths (`_data/`, `img-product/`, `css/`)
relative to `../web` from wherever it's run, so it always edits the real
site data. REST-ish JSON API over `boo.json`, structured around the section →
(events | items | subcategories → items) hierarchy. `app.param` handlers
resolve `:sectionId`, `:name`, `:eventId` and `:itemId` into `req.section`,
`req.group`, `req.event` and `req.item` (404 if missing) from a fresh read
of `boo.json` (`gen.js` writes it too); item routes are registered on both
the section and the subcategory path (`itemRoute()`), and all four reorder
endpoints share `reorder()`.

- Sections, subcategories and events are freely editable on any section,
  including `etsy-shop` (whose title/description/show `gen.js` keeps).
- Items are editable/deletable only if they aren't `source: "Etsy"`
  (`isLocked()`, 403 otherwise) — edits to Etsy items would be overwritten
  by the next `gen.js` run. New items are created with `source: "Manual"`.
- Reordering endpoints (`PUT .../order`) take the full list of ids/names;
  for items, only the non-Etsy ones are reordered and Etsy items keep the
  scrape order `gen.js` re-establishes every run.

The frontend (`admin/public/app.js`) re-fetches `GET /api/boo` and
re-renders the whole page after every change (`change()`). Rendered
controls carry generic `data-action`s (`edit`, `delete`, `toggle-show`,
`move-up`, ...); one click handler resolves the section/group/event/product
the control sits in (`pageContext()`, which also builds its API path) and
dispatches through the `actions` map. The add/edit dialogs share
`fillForm()` / `onSubmit()`, and any `[data-close-modal]` button closes its
dialog. Adding a product puts it in
the section/group chosen in the modal's dropdowns (defaulting to where
"Add product" was clicked); editing can't move an item, so the dropdowns
are locked then.

Image uploads (`POST /api/images`, multer memory storage, 10MB cap, allowed
extensions `.png/.jpg/.jpeg/.webp/.gif`) are re-encoded through `sharp`
before being written to `img-product/` as `upload-<8-hex-id>.webp` (GIFs
stay `.gif`, since they may be animated): EXIF-rotated upright, capped at
1200px on the longest side (the first photo is also the item's card image),
and stripped of EXIF/GPS/camera metadata as a side effect of not calling
`.withMetadata()`. The returned path is added to an item's `images[]` only
once the client hits Save.

`SITE_URL` env var (set in `docker-compose.yml`) powers the admin header's
"Preview site" link; unset when running `server.js` directly, so the link
stays hidden.

Saving in the admin tool only updates the local `boo.json` (and, for image
uploads, `img-product/`) — committing and pushing it to `dev` is handled by
`scripts/git-sync.sh` on a cron schedule (see below), not by `server.js`
itself. The header's **Publish site** button (`POST /api/publish`) likewise
only writes a flag file, `web/.publish-requested`; `git-sync.sh` does the
actual publish and writes the outcome to `web/.publish-status`, which
`GET /api/publish` reads back for the "Last published" line. While a publish
is pending, `DELETE /api/publish` cancels it by deleting the flag; since
`git-sync.sh` claims the flag by renaming it to `web/.publish-in-progress`
before pushing, the delete either wins or finds the flag gone, so the
"cancelled" / "too late" popup is always accurate. All three files are
gitignored.

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

The server's checkout stays on `dev`, so auto-synced edits don't go live on
their own. When `web/.publish-requested` exists, `git-sync.sh` (after the
usual sync) runs `git push origin dev:main` — Netlify's production deploy
follows `main` — writes the result to `web/.publish-status` (line 1 `ok` or
`error`, line 2 the time, then the commit or git's error output), and
deletes the flag. The push is never forced: if `main` has commits `dev`
doesn't, it's refused and the admin page shows the error.

Only works where this is actually set up (the machine running
`npm run admin` locally) — the `docker compose up` `admin` container has no
`.git` directory mounted and no `git` binary in its `node:24-alpine` image,
so auto-sync doesn't run there — but since the container shares `./web` with
the host, the Publish button still works as long as the host's cron runs
`git-sync.sh`. The repo's remote (`git@github.com:...`)
is SSH-based, so this also depends on the cron user's SSH key working with
no passphrase prompt (cron has no SSH agent available).

### Docker compose

`web` and `admin` run as separate `node:24-alpine` containers sharing the
same bind-mounted `./web` directory (so admin writes are immediately visible
to the site's dev server), each with its own named `node_modules` volume.
Both containers `chown` the node_modules volume to the unprivileged `node`
user before installing/running, since Docker creates it root-owned on first
mount. `web` uses `CHOKIDAR_USEPOLLING=true` since bind-mount file events
don't propagate reliably on macOS/Windows Docker.


### Dev container

`.devcontainer/devcontainer.json` (VS Code "Reopen in Container", or a
GitHub Codespace) uses `mcr.microsoft.com/devcontainers/javascript-node:24-bookworm`
and on creation runs the root `npm install` (installing `web/` and
`admin/`) plus `npx playwright install --with-deps chromium` (system
libraries via the image's passwordless sudo). Ports 8080 (site) and 4321
(admin) are forwarded, and `SITE_URL` points the admin's Preview site link
at `localhost:8080`.

### Node version and lockfiles

Node 24 everywhere: `.nvmrc`, the `node:24-alpine` images in
`docker-compose.yml`, `.devcontainer/devcontainer.json`
and `NODE_VERSION` in `netlify.toml` — keep these in sync by hand. `package-lock.json` is committed for the root, `web/` and
`admin/`, and the containers install with `npm ci`, so no install quietly
picks up newer versions. After changing a `package.json`, run `npm install`
in that directory and commit the updated lockfile.
