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

## Admin app

`admin/` is a small, self-hosted admin app (no auth — intended to run locally
or on a trusted network) for managing product listings and site settings. It
writes directly to the JSON files 11ty reads as data, and stores uploaded
images in `img-product/` (per-product) and `img/site/` (site-wide, e.g. the
social share image), both of which are already passthrough-copied by
`eleventy.config.js`.

```shell
# one-time setup
npm run admin:install

# run the admin app (defaults to http://localhost:4321)
npm run admin
```

Data files written by the admin app, consumable from 11ty templates as
regular Eleventy global data:

- `_data/products.json` — array of products: `title`, `description` (HTML
  from the rich text editor), `images` (`{ id, filename, url }[]`),
  `mainImageId`, `featured`, `categories` (string array), `externalLink`
  (`{ label, url }`), and `order` (controls display order — drag to reorder
  in the admin UI).
- `_data/categories.json` — the list of known category names, managed from
  the product editor.
- `_data/settings.json` — site-wide settings: `title`, `description`, `seo`
  (`metaTitle`, `metaDescription`, `ogImage`), `contact` (repeatable
  `{ type, label, value }`), and `social` (repeatable `{ platform, url }`).
