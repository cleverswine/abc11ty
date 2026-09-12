# abc11ty

Auntie Boo Crafts built by 11ty

## Repo layout

Two independent Node projects live side by side, each with its own
`package.json`/`node_modules`:

- **`web/`** — the 11ty site itself: `index.html`, `gen.js`, `_data/boo.json`,
  `img-product/`, `css/`, `js/`, etc. This is what Netlify builds and deploys
  (see `netlify.toml`, which sets `base = "web"`).
- **`admin/`** — the local-only admin tool for editing `web/_data/boo.json`
  (see [Admin tool](#admin-tool) below).

The root `package.json` is just a thin wrapper: `npm run build`/`serve`/`clean`
delegate to `web/`, and `npm run admin` delegates to `admin/`, so most
day-to-day commands work the same from the repo root.

```shell
# update listings (run from web/, since gen.js isn't wrapped at the root)
cd web
node gen.js
cd ..

# build/serve (from the repo root - delegates into web/)
npm run build
npm run serve

# update vendored bootstrap (run from web/, where its node_modules/css live)
cd web
cp ./node_modules/bootstrap/dist/css/bootstrap.min.css ./css/
cp ./node_modules/bootstrap/dist/js/bootstrap.min.js ./js/
cp ./node_modules/bootstrap-icons/font/fonts/* ./css/fonts/
cd ..

# rebuild site
git add --all
git commit -m "updates"
git push
```

## Admin tool

A small local-only admin page for editing the manual parts of
`web/_data/boo.json` without hand-editing JSON lives in `admin/`. It resolves
all its paths (`_data/`, `img-product/`, `css/`) relative to `web/`, so it
always edits the site's actual data regardless of where you run it from:

```shell
cd admin
npm install    # first time only
npm start      # or: npm run admin, from the repo root
```

Then open <http://localhost:4321>. Etsy-sourced sections/items render
read-only (grey background); anything tagged `"manual": true` is fully
editable — add/edit/delete/reorder items, subcategories, and whole manual
sections, plus toggle `pinned`/`show`/description on any section (including
Etsy ones, since those three fields are always hand-set anyway). Each item's
images can be picked from what's already in `img-product/`, or uploaded
directly from the "Upload" file picker, which saves the file into
`img-product/` under a generated name (`upload-<id>.<ext>`) and adds it to
that item's `images[]` once you hit Save. It's a plain Express server +
vanilla JS/Bootstrap frontend, no build step, and it writes straight to
`_data/boo.json` (backing up to `_data/boo-old.json`
first, same as `gen.js`). It's not meant to be deployed — it's a local
editing convenience only, so after saving you still need to `git add` /
commit / push (and run `npm run build`) to actually publish a change, since
Netlify only sees what's committed.

## How `gen.js` works

`gen.js` scrapes the Etsy shop and writes the result to `_data/boo.json`, which
11ty loads as the `boo` data object used by `index.html` to render sections
and product cards. Hand-added content lives directly in `_data/boo.json` too
(see below) — there's no separate file to maintain.

1. Fetches the shop's home page and reads its section nav to get each
   section's `sectionId`/`sectionTitle` (sections listed in `ignoreSections`,
   and the catch-all section with id `"0"`, are skipped).
2. For each section, fetches its listing page and scrapes every product
   (title, Etsy listing URL, image), downloading and resizing each product
   image to `img-product/<listingId>.png` via `@11ty/eleventy-img`.
3. Reads the *previous* `_data/boo.json` and carries forward anything tagged
   `"manual": true` — whole hand-made sections untouched, plus any manual
   items/`pinned`/`sectionDescription`/`show` that were layered onto a real
   Etsy section — onto the freshly-scraped sections (see below).
4. Backs up the previous `_data/boo.json` to `_data/boo-old.json`, then
   writes the combined result to `_data/boo.json`.

Run `node gen.js --skip-fetch` to skip hitting Etsy entirely — it reuses the
Etsy-sourced sections already in `_data/boo.json` as the baseline instead of
scraping, then re-applies the same manual-content preservation on top. Since
manual content and Etsy content now live in the same file, this is really
only useful for normalizing the file (e.g. re-sorting pinned sections) or a
dry run — most manual edits already take effect immediately, no `gen.js` run
needed.

## Hand-added sections, items, and subcategories

`_data/boo.json` is regenerated from Etsy on every `node gen.js` run, but
anything tagged `"manual": true` is preserved rather than overwritten — you
can edit those parts by hand directly in `_data/boo.json` at any time
(including with the site already built; changes show up on the next
`npm run build`/`npm run serve`, no `gen.js` run required). `gen.js` never
invents or removes a `"manual"` tag on its own, so it's always the same
sections/items you last touched by hand.

There are two ways to add manual content:

**A whole new hand-made section** (like "In Person Events" below) — give it a
`sectionId` that doesn't match any real Etsy section, and tag it
`"manual": true`. `gen.js` carries a manual section forward completely
untouched, so anything inside it — including `subcategories` — is entirely up
to you:

```json
{
  "sectionId": "live-events",
  "sectionTitle": "In Person Events",
  "sectionDescription": "These are items that are available at in person events.",
  "pinned": true,
  "show": true,
  "manual": true,
  "items": [
    {
      "id": "live-events-misc",
      "show": true,
      "title": "Something without a subcategory",
      "description": "Something without a subcategory",
      "images": ["img-product/live-events-misc.png"],
      "etsyPage": "https://www.etsy.com/shop/AuntieBooCrafts"
    }
  ],
  "subcategories": [
    {
      "name": "Composition Notebooks",
      "show": true,
      "items": [
        {
          "id": "live-events-1",
          "show": true,
          "title": "Composition Notebook",
          "description": "Composition Notebook",
          "images": ["img-product/live-events-1.png", "img-product/live-events-2.png"],
          "etsyPage": "https://www.etsy.com/shop/AuntieBooCrafts",
          "manual": true
        }
      ]
    }
  ]
}
```

**Manual items added onto a real Etsy section** — use the same `sectionId` as
an existing Etsy section and tag each added item `"manual": true` (the
section itself stays untagged, since it's still Etsy-sourced). `gen.js` finds
these by their per-item tag and re-appends them onto that section every time
it's freshly re-scraped. `pinned`/`sectionDescription`/`show` set directly on
an Etsy section are carried forward the same way — a raw scrape never sets
those fields, so their presence always means they were set by hand.

Field reference:

- **`sectionId` matches an existing Etsy section** — only its manual items
  (and `pinned`/`sectionDescription`/`show`, if set) are carried forward onto
  that section on every `gen.js` run.
- **`sectionId` doesn't match any Etsy section**, tagged `"manual": true` —
  the whole section is carried forward untouched (this is how "In Person
  Events" was added).
- **`sectionDescription`** — optional text shown under the section header on
  the page (see `section.sectionDescription` in `index.html`).
- **`pinned`** — optional; set `true` to float that section to the front of
  the nav/listing, ahead of unpinned sections. Order among pinned sections
  (and among unpinned ones) is otherwise preserved.
- **`show`** — optional, at both the section level and the subcategory-group
  level; set `false` to hide it entirely (nav button and content for a
  section, or the sub-heading and its items for a subcategory group) without
  deleting the data. Defaults to shown if omitted — same convention as the
  existing per-item `show`.
- **Item order** — items within a section (or within a subcategory group)
  render in the order they appear in the `items` array, top to bottom. To
  reorder items, reorder them in the JSON — there's no separate `order`
  field to keep in sync.
- **`images`** — every item's photos, always an array (even for a single
  photo — there's no singular `image` field). The card thumbnail is always
  `images[0]`. Manual items (`"manual": true`) are clickable and open an
  image-viewer modal; if `images` has more than one entry the modal shows a
  Bootstrap carousel, otherwise just that one image. Etsy-sourced items are
  unaffected either way and still link straight to their Etsy listing instead
  of opening the modal.
- **`subcategories`** — optional array of `{ "name": ..., "show": ..., "items": [...] }`
  groups, valid on manual-only sections. Each group's items render together
  under a `name` sub-heading within the section (e.g. "In Person Events"
  groups items under "Composition Notebooks", "Bookmarks", "Hair Clips",
  "Paperclips", "Sticky Notes"). A section can mix a flat top-level `items`
  list (no sub-heading) with `subcategories` (grouped) — use whichever reads
  more naturally; a section with no `subcategories` renders as a single flat
  grid, same as before.
- Product images for manual items should be placed in `img-product/` (resize
  to 340px wide to match the Etsy-scraped images — see how `gen.js` calls
  `@11ty/eleventy-img` for the exact settings).

`index.html` renders each item's card and image-viewer modal via the
`_includes/item-card.html` partial, used both for a section's flat `items`
and for each `subcategories` group's items.
