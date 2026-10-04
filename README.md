# abc11ty

The Auntie Boo Crafts website, built with 11ty, plus a local admin page for
editing it. Edits made in the admin page show up on a preview of the site
right away, and go live when someone presses **Publish site**, which
commits them to GitHub (see [Publishing](#publishing)); Netlify then
deploys the site.

## Quick start

### With Docker

```shell
docker compose up
# site:  http://localhost:9080
# admin: http://localhost:9321
```

This is the server setup. The site's content (products and photos) lives in
`./content`, outside the git checkout; on first start the admin fills it
from GitHub. The admin page's **Preview site** link uses `SITE_URL` in
`docker-compose.yml` — change it to the address the site is reachable at
from your browser.

To update the code later: `git pull`, then `docker compose restart`.

### Without Docker

Needs Node 24 (see `.nvmrc`).

```shell
npm install                                      # also installs web/ and admin/
npm run serve                                    # site:  http://localhost:8080
SITE_URL=http://localhost:8080 npm run admin     # admin: http://localhost:4321 (in a second terminal)
```

To edit code with nothing installed locally, open the repo in VS Code
("Reopen in Container") or a GitHub Codespace — `.devcontainer/` sets up
Node and both projects.

## Updating listings from Etsy

The admin page's Etsy section has a **Check Etsy for changes** button. It
adds new listings (at the top of their group), removes ones no longer on
Etsy, and picks up changed titles and photos, then shows what changed. The
changes appear on the preview site right away; press **Publish site** to
put them on the public site. Only new or changed photos are downloaded, so
a routine check takes a few seconds. Hand-added content is never touched.

It needs the shop's Etsy API key: the **keystring** and **shared secret**
from [Your Apps](https://www.etsy.com/developers/your-apps). Put them in
`web/.env` (gitignored, so they're never committed):

```shell
ETSY_KEYSTRING=your-keystring
ETSY_SHARED_SECRET=your-shared-secret
```

The same check can be run from the command line (e.g. on a schedule), from
`web/`:

```shell
cd web
node gen.js                       # check Etsy for changes and apply them
node gen.js --item <listing-url>  # just one listing, re-downloading its photos (adds it if new)
node gen.js --skip-fetch          # don't contact Etsy, just re-tidy boo.json
```

If Etsy can't be reached or rejects the key, nothing is changed.

## Publishing

**Publish site** in the admin page commits the content to the `main`
branch on GitHub, which Netlify deploys a few minutes later. The admin's
header shows whether there are changes that aren't published yet.

It needs a GitHub token in `web/.env`: create a
[fine-grained token](https://github.com/settings/personal-access-tokens/new)
for just this repository with **Contents: read and write**, and add it:

```shell
GITHUB_TOKEN=github_pat_...
```

Publishing only ever changes `web/content/` on GitHub, so code changes
pushed with git don't get in its way. If the content was also changed on
GitHub since the last publish (e.g. someone edited `boo.json` there), the
admin brings those changes in, or - if the same file was changed in both
places - asks before replacing GitHub's version.

## Repo layout

- **`web/`** — the 11ty site: `index.html`, `gen.js`, `lib/`, `css/`,
  `js/`, and its content in `web/content/` (`boo.json` and `img-product/`).
  This is what Netlify builds and deploys (`netlify.toml` sets
  `base = "web"`).
- **`admin/`** — the local-only admin page for editing and publishing the
  content.
- **`scripts/`** — maintenance scripts, run from the repo root.

Each of `web/` and `admin/` has its own `package.json` and `node_modules`;
the root `package.json` just delegates (`npm run build`/`serve`/`clean` to
`web/`, `npm run admin` to `admin/`). See `CLAUDE.md` for how the pieces
work in detail.

## Other tasks

```shell
# build the site once, into web/_site/
npm run build

# these two work on ./content if it exists (the server), else web/content

# delete photos that boo.json no longer uses (needs jq)
./scripts/cleanup-unused-images.sh [--dry-run]

# strip EXIF/ICC/C2PA metadata from every photo
# (needs exiftool; admin uploads are stripped automatically)
./scripts/strip-image-metadata.sh

# update the vendored Bootstrap files (after updating the bootstrap package)
cd web
cp ./node_modules/bootstrap/dist/css/bootstrap.min.css ./css/
cp ./node_modules/bootstrap/dist/js/bootstrap.min.js ./js/
cp ./node_modules/bootstrap-icons/font/fonts/* ./css/fonts/
```
