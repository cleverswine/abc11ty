# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Auntie Boo Crafts (abc11ty) — a static 11ty site that mirrors an Etsy shop's
listings, plus a local-only admin tool for layering hand-added content on top
of the data imported from Etsy. Two independent Node projects live side by side, each
with its own `package.json`/`node_modules`:

- **`web/`** — the 11ty site (`index.html`, `gen.js`, `lib/`, `css/`,
  `js/`) and its content, `web/content/` (`boo.json` + `img-product/`).
  This is what Netlify builds and deploys from `main` (`netlify.toml` sets
  `base = "web"`, `command = "npm run build"`, `publish = "_site"`).
- **`admin/`** — a local-only Express + vanilla-JS admin page for editing
  the content without hand-editing JSON, and publishing it to GitHub
  (`admin/publish.js`). Not deployed anywhere.

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

# refresh web/content/boo.json from the Etsy shop via Etsy's Open API - the
# same as the admin page's "Check Etsy for changes" button (run from web/ —
# not wrapped at the root). Needs ETSY_KEYSTRING and ETSY_SHARED_SECRET, in
# the environment or in web/.env (gitignored). Only new/changed photos are
# downloaded:
cd web && node gen.js
# or, to rebuild the etsy-shop section from the Etsy items already in
# boo.json without contacting Etsy (normalizes the file; a dry run of the merge):
cd web && node gen.js --skip-fetch
# or, to refresh just one listing, re-downloading its photos even if they
# look unchanged. A listing not in boo.json yet is added to the top of the
# etsy-shop subcategory named after its Etsy section (created if missing; if
# it's in no section, the top of the etsy-shop section itself, until a full
# run files it):
cd web && node gen.js --item https://www.etsy.com/listing/<id>/...

# run site + admin together (the server setup), sharing the same web/ dir and
# ./content (admin edits show up live in the site's dev server)
docker compose up

# scripts/ below all assume they're run from the repo root

# both work on ./content if it exists (the server's), else web/content
# sweep img-product/ for orphaned files (not referenced in boo.json)
# — requires jq
./scripts/cleanup-unused-images.sh [--dry-run]

# strip EXIF/ICC/C2PA metadata from every image in img-product/ in place
# — requires exiftool; admin uploads are stripped automatically via sharp
./scripts/strip-image-metadata.sh

# update vendored bootstrap assets (run from web/)
cd web
cp ./node_modules/bootstrap/dist/css/bootstrap.min.css ./css/
cp ./node_modules/bootstrap/dist/js/bootstrap.min.js ./js/
cp ./node_modules/bootstrap-icons/font/fonts/* ./css/fonts/
```

There is no test suite, linter, or type checker in this repo.

## Architecture

### Data model: `web/content/boo.json`

Everything the site renders flows from this one file, loaded as the `boo`
global data that `index.html` consumes (`addGlobalData` in
`eleventy.config.js`; its photos are passthrough-copied from
`content/img-product/` to `img-product/`, the paths `boo.json` uses). It's an
array of *sections*:

```
{ sectionId, sectionTitle, sectionDescription?, show,
  events?: [{ id, name, date, location, link, show }],
  items?: [item],
  subcategories?: [{ name, show, items: [item] }] }      // "groups" in the admin UI

item = { id, title, description, images: [path], etsyPage, show,
         source: "Etsy" | "Manual",
         etsyImageIds?: [number] }   // Etsy items: the Etsy photo ids `images` came from
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

`web/lib/boo.js` is the one place that knows where the content lives
(`CONTENT_DIR`, `BOO_PATH`, `IMAGE_DIR`, resolved from the module's own
location) and reads and writes the file, imported by `gen.js`,
`lib/etsy.js`, `eleventy.config.js` and `admin/server.js` (as
`../web/lib/boo.js`): `readBoo`, `writeBoo` (a tmp file + rename, so a
concurrent reader - the admin server, the eleventy dev server - never sees
half a file) and `isEtsyItem`. API keys come from `web/lib/env.js`
(`envValue()`: the environment, else the gitignored `web/.env`, re-read on
each use).

### The Etsy import (`web/lib/etsy.js`, `web/gen.js`)

`web/lib/etsy.js` does the work; it's used by the admin page's "Check Etsy
for changes" button (`admin/server.js`) and by `web/gen.js`, a thin
command-line wrapper (handy for a scheduled run). It uses Etsy's Open API v3
(`https://openapi.etsy.com/v3/application`) with only an API key - every
request sends `x-api-key: <keystring>:<shared_secret>`, from
`ETSY_KEYSTRING`/`ETSY_SHARED_SECRET` (the environment, or else `web/.env`,
re-read on each use by `etsyApiKey()`). No browser, no OAuth, no captcha.
All paths are resolved from the module's own location, so it works from
any working directory. The comment block at the top of the file describes
the steps and safety rules; in short, `refreshShop()`:

1. Looks up the shop id by name (`/shops?shop_name=`, the name taken from
   `_data/shop.json`'s URL), its sections (`/shops/{id}/sections`, in `rank`
   order, minus `IGNORE_SECTIONS`) and every active listing
   (`/shops/{id}/listings/active`, paginated), then fetches those listings
   again in batches of 100 from `/listings/batch?includes=Images` to get
   their photos. Listings in no section are left off the site.
2. For each listing (`LISTING_CONCURRENCY` at a time) whose photos' Etsy ids
   differ from the item's stored `etsyImageIds` (or whose files are
   missing), `downloadListingImages()` saves the first photo at Etsy's
   340x270 crop as `img-product/<listingId>.webp` (the card thumbnail) and
   every photo at 794px as `img-product/<listingId>-<n>.jpg`, via
   `@11ty/eleventy-img` (which also caches remote downloads in `.cache/`) -
   the sizes are picked by rewriting the `il_fullxfull` part of the photo
   URL (`sized()`). Unchanged listings keep their files, so a routine check
   downloads nothing. Items are built by `etsyItem()`: the title is the
   first comma-separated phrase of Etsy's keyword-list title (HTML entities
   decoded), which becomes its `description`; `etsyPage` is the listing URL
   without the API's `?utm_...`.
3. Re-reads `boo.json` and, with no `await` in between, merges into it and
   writes it - so admin edits made while photos downloaded survive.
   `buildBoo()` / `mergeSubcategories()` rebuild `etsy-shop`: each Etsy
   section becomes a subcategory (new ones appended, ones gone from Etsy
   dropped if nothing hand-added is left in them). The API has no "shop
   order" for listings, so `orderLikePrevious()` keeps existing items where
   they were and puts new ones at the top (newest first); hand-added items
   follow. Then `deleteUnusedEtsyPhotos()` deletes Etsy-named files
   (`<digits>[-n].webp/jpg/png`) nothing references any more; `upload-*`
   files are never touched.
4. Returns a summary (`added`, `removed`, `renamed`, `photosUpdated`,
   `photosFailed`, `deletedFiles`) - shown in the admin's popup, or printed
   by `summaryLines()` on the command line.

`refreshListing()` (`gen.js --item <url>`) fetches one listing
(`/listings/{id}`, checked to belong to the shop) and re-downloads its
photos even if they look unchanged; a listing not in `boo.json` yet goes to
the top of the subcategory named after its Etsy section (created if
missing), or the top of `etsy-shop`'s own `items` if it's in no section,
until a full refresh files it properly. `rebuildEtsySection()`
(`--skip-fetch`) re-runs the merge with the Etsy items already in
`boo.json`, without contacting Etsy.

A failed refresh never wipes data: any API error (rate limits and server
errors are retried a few times) ends it without writing `boo.json`, and a
listing whose photos can't be downloaded keeps its previous ones (and
previous `etsyImageIds`, so the next refresh tries again).

In the admin, `POST /api/etsy/refresh` starts `refreshShop()` in the
background (one at a time) and `GET /api/etsy` reports `{configured,
running, progress: {done, total}, last: {ok, time, summary | error}}`
(kept in memory, so it resets when the server restarts). The page polls it
every second while a check runs, then reloads and shows the summary; the
changes apply straight away, and Publish site is still the step that puts
them on the public site. Under `docker compose up`, the admin container
sees `web/.env` through the shared `./web` mount.

The site's footer carries the attribution Etsy's API terms ask for ("The
term 'Etsy' is a trademark of Etsy, Inc. ...").

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
(lazy-loaded, via the `cardImage` shortcode in `eleventy.config.js` - for
hand-added items it makes 240/480/720px WebP copies into `_site/img-card/`
at build time and renders a `srcset` with the photo's width/height; Etsy
thumbnails are used as they are) that opens a Bootstrap image-viewer modal for every item — a
carousel with a thumbnail strip if there's more than one photo, plus a
"Purchase this item on Etsy" button for Etsy items and the description for
manual ones. Every modal is rendered into the page at build time.

`web/js/app.js` is small: it blocks right-click/drag on product images
(`.abc-product-img`, a soft deterrent only), keeps each carousel's thumbnail
strip in sync with the active slide, and sizes the "More …" cards to the
photo beside them with a `ResizeObserver`.

The colour palette (`--ink`, `--paper`, `--sage*`, `--slate*`, ...) lives in
`web/css/tokens.css`, loaded before `css/app.css` by the site and before
`style.css` by the admin page (which serves `web/css` at `/assets/css`), so
the two can't drift apart; each stylesheet's own `:root` only adds extras.

The Cloudflare Web Analytics beacon script in `<head>` is gated behind
`env.isProduction` (`web/_data/env.js`, true only when Netlify's `CONTEXT`
build env var is `production`), so it never fires on local `npm run
build`/`serve` or deploy previews.

### `admin/server.js` (local editing tool)

Plain Express server + static vanilla-JS/Bootstrap frontend (`admin/public/`,
no build step). Gets the content's paths from `web/lib/boo.js` and serves
`web/css` at `/assets/css`, so it always edits the real site content. REST-ish JSON API over `boo.json`, structured around the section →
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
  order `gen.js` re-establishes every run.

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

Saving in the admin tool only updates the local content (the working copy).

### Publishing (`admin/publish.js`)

**Publish site** commits the content to `main` on GitHub through GitHub's
REST API - no git, SSH key or cron - and Netlify deploys `main` as before.
It needs `GITHUB_TOKEN` (`web/.env`): a fine-grained token for this repo with
"Contents: read and write" (`GITHUB_REPO` overrides the repo,
`cleverswine/abc11ty` by default). Code still reaches `main` through normal
git; a publish only ever touches `web/content/`, so code and content never
block each other.

How it stays in sync (details in the comment at the top of `publish.js`):

- **The base** (`content/.publish-base.json`, gitignored): the `main`
  commit the working copy was last in sync with, and the git blob id of
  each content file in it. A local file whose blob id (a SHA-1 of the
  contents, computed without git; cached by size+mtime) differs is an
  unpublished change - `unpublishedChanges()` needs no network, so the
  header can say "Changes not published yet" after every edit.
- **Publishing** (`publish()`): reads `main`'s commit and file list, uploads
  only the files that differ (POST `/git/blobs`), builds a tree on top of
  `main`'s (`base_tree`, only `web/content/...` entries, `sha: null` for
  deletions), creates a commit with `main` as parent and moves `main` to it
  with `force: false` - a 422 (someone pushed meanwhile) starts it over.
  Content changed only on GitHub since the base comes into the working copy;
  a file changed on both sides is a conflict (`ConflictError`), refused
  unless the page asks to replace GitHub's version (`{replace: true}`).
  Rate limits are waited out per GitHub's docs (retry-after / reset /
  backoff) - GitHub allows only 80 new files a minute and 500 an hour, so a
  publish of hundreds of photos takes a while (large one-offs are better
  committed with git).
- **At startup** (`syncFromGitHub()`): with no base, an empty content
  directory (a new server) is filled from `main`, and an existing one is
  taken to be `main`'s; otherwise changes made on GitHub since the base are
  brought in (conflicts are left for the next publish) and the base moves
  to `main`'s latest commit.

The server runs a publish in the background (`POST /api/publish`, one at a
time) and `GET /api/publish` reports `{configured, changes: {changed, added,
deleted}, sync, running, progress, last}`; the page polls it every second
while a publish runs, then says how it went (or shows the conflict dialog,
whose "Publish mine anyway" posts `{replace: true}`). Netlify doesn't report
deploy results back to GitHub for this site, so the page points at Netlify's
deploys page rather than showing deploy status.

### Docker compose

The server setup. `web` and `admin` run as separate `node:24-alpine`
containers sharing the same bind-mounted `./web` directory, each with its
own named `node_modules` volume. The content lives in `./content` at the
repo root (gitignored), outside the checkout, mounted over
`/app/web/content` in both containers - so admin writes are immediately
visible to the site's dev server, and the checkout's own `web/content` is
never edited, which keeps updating the code a plain `git pull`. On first
start the admin fills an empty `./content` from GitHub (`syncFromGitHub()`).
Both containers `chown` the node_modules volume to the unprivileged `node`
user before installing/running, since Docker creates it root-owned on first
mount (the admin also chowns `./content`, which Docker creates root-owned if
missing). `web` uses `CHOKIDAR_USEPOLLING=true` since bind-mount file events
don't propagate reliably on macOS/Windows Docker. Run without Docker, the
admin edits the checkout's `web/content` directly (fine on a dev machine).

### Dev container

`.devcontainer/devcontainer.json` (VS Code "Reopen in Container", or a
GitHub Codespace) uses `mcr.microsoft.com/devcontainers/javascript-node:24-bookworm`
and on creation runs the root `npm install` (installing `web/` and
`admin/`). Ports 8080 (site) and 4321
(admin) are forwarded, and `SITE_URL` points the admin's Preview site link
at `localhost:8080`.

### Node version and lockfiles

Node 24 everywhere: `.nvmrc`, the `node:24-alpine` images in
`docker-compose.yml`, `.devcontainer/devcontainer.json`
and `NODE_VERSION` in `netlify.toml` — keep these in sync by hand. `package-lock.json` is committed for the root, `web/` and
`admin/`, and the containers install with `npm ci`, so no install quietly
picks up newer versions. After changing a `package.json`, run `npm install`
in that directory and commit the updated lockfile.
