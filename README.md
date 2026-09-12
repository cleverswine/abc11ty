# abc11ty

Auntie Boo Crafts built by 11ty

```shell
# update listings
node gen.js
npm run build

# update bootstrap
cp ./node_modules/bootstrap/dist/css/bootstrap.min.css ./css/
cp ./node_modules/bootstrap/dist/js/bootstrap.min.js ./js/
cp ./node_modules/bootstrap-icons/font/fonts/* ./css/fonts/

# run locally
npm run serve

# rebuild site
git add --all
git commit -m "updates"
git push
```

## How `gen.js` works

`gen.js` scrapes the Etsy shop and writes the result to `_data/boo.json`, which
11ty loads as the `boo` data object used by `index.html` to render sections
and product cards.

1. Fetches the shop's home page and reads its section nav to get each
   section's `sectionId`/`sectionTitle` (sections listed in `ignoreSections`,
   and the catch-all section with id `"0"`, are skipped).
2. For each section, fetches its listing page and scrapes every product
   (title, Etsy listing URL, image), downloading and resizing each product
   image to `img-product/<listingId>.png` via `@11ty/eleventy-img`.
3. Merges in any hand-added content from `_data/boo-manual.json` (see below).
4. Backs up the previous `_data/boo.json` to `_data/boo-old.json`, then
   writes the new merged result to `_data/boo.json`.

Run `node gen.js --skip-fetch` to skip hitting Etsy entirely and just
re-apply the `boo-manual.json` merge on top of the sections already in
`_data/boo.json`. Handy after editing `boo-manual.json` when you don't want
to wait on (or re-trigger) a live Etsy scrape.

## Manually-added sections and items

`_data/boo.json` is regenerated from Etsy on every `node gen.js` run, so
anything you want to survive a refresh belongs in `_data/boo-manual.json`
instead — `gen.js` merges it in after scraping and never overwrites it.

`_data/boo-manual.json` is an array of section objects, shaped like the
sections in `boo.json`:

```json
[
  {
    "sectionId": "live-events",
    "sectionTitle": "Live Events",
    "sectionDescription": "These are items that are available at live events.",
    "pinned": true,
    "items": [
      {
        "id": "live-events-1",
        "show": true,
        "order": 0,
        "title": "Composition Notebook",
        "description": "Composition Notebook",
        "image": "img-product/live-events-1.png",
        "images": ["img-product/live-events-1.png", "img-product/live-events-2.png"],
        "etsyPage": "https://www.etsy.com/shop/AuntieBooCrafts"
      }
    ]
  }
]
```

- **`sectionId` matches an existing Etsy section** — the entry's `items` are
  appended to that section's items on every merge.
- **`sectionId` doesn't match any Etsy section** — the whole entry becomes a
  new, fully hand-made section (this is how "Live Events" was added).
- **`sectionDescription`** — optional text shown under the section header on
  the page (see `section.sectionDescription` in `index.html`).
- **`pinned`** — optional; set `true` to float that section to the front of
  the nav/listing, ahead of unpinned sections. Order among pinned sections
  (and among unpinned ones) is otherwise preserved.
- **`images`** — optional array of image paths for an item. Items added via
  `boo-manual.json` are clickable and open an image-viewer modal instead of
  linking out to Etsy; if `images` has more than one entry the modal shows a
  Bootstrap carousel, otherwise it shows a single image (falling back to
  `image` if `images` is omitted). Etsy-sourced items are unaffected and
  still link straight to their Etsy listing.
- Product images for manual items should be placed in `img-product/` (resize
  to 340px wide to match the Etsy-scraped images — see how `gen.js` calls
  `@11ty/eleventy-img` for the exact settings).

Every section/item merged in from `boo-manual.json` is tagged with
`"manual": true` in the generated `boo.json`, which is how `index.html`
decides to render the modal/carousel behavior instead of an Etsy link.
