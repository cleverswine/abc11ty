# abc11ty

The Auntie Boo Crafts website, built with 11ty, plus a local admin page for
editing it. Edits made in the admin page show up on a preview of the site
right away, are committed to the `dev` branch automatically (see
[Auto-sync](#auto-sync-and-publishing)), and go live when someone presses
**Publish site** in the admin page.

## Quick start

### With Docker

```shell
docker compose up
# site:  http://localhost:9080
# admin: http://localhost:9321
```

The admin page's **Preview site** link uses `SITE_URL` in
`docker-compose.yml` — change it to the address the site is reachable at
from your browser.

### Without Docker

Needs Node 24 (see `.nvmrc`).

```shell
npm install                                      # also installs web/ and admin/
npm run serve                                    # site:  http://localhost:8080
SITE_URL=http://localhost:8080 npm run admin     # admin: http://localhost:4321 (in a second terminal)
```

To edit code with nothing installed locally, open the repo in VS Code
("Reopen in Container") or a GitHub Codespace — `.devcontainer/` sets up
Node, both projects and Chromium.

## Updating listings from Etsy (gen.js)

`web/gen.js` copies the Etsy shop's categories, listings and photos into
`web/_data/boo.json` and `web/img-product/`. It runs on the host, not in
Docker, because Etsy sometimes shows a captcha that has to be solved by
hand in a real browser window.

```shell
# first time only: install the browser gen.js drives
cd web && npx playwright install chromium

cd web
node gen.js                       # scrape the whole shop
node gen.js --item <listing-url>  # just one listing, e.g. after changing its photos (adds it if new)
node gen.js --skip-fetch          # don't contact Etsy, just re-tidy boo.json
node gen.js --headless            # no browser window, for unattended runs
```

A browser window opens while it runs. If Etsy shows a captcha, solve it in
that window, then press Enter in the terminal. With `--headless`, blocked
pages are skipped instead. Either way, anything Etsy blocks keeps its
existing data — a blocked run never wipes anything out.

Hand-added content from the admin page is never touched by `gen.js`.

## Auto-sync and publishing

`scripts/git-sync.sh` commits and pushes `web/_data/boo.json` and
`web/img-product/` to `dev` whenever they've changed. If **Publish site**
was pressed in the admin page, it also pushes `dev` to `main`, which
Netlify deploys to the live site. It's meant to run every 15 minutes from
cron, on the machine where the admin page runs.

To set it up, run this once from the repo root (it adds a line to your
crontab):

```shell
(crontab -l 2>/dev/null; echo "*/15 * * * * cd $(pwd) && ./scripts/git-sync.sh >> .git-sync.log 2>&1") | crontab -
crontab -l   # check the line is there
```

Cron has no SSH agent, so check once that pushing to GitHub works without
a passphrase prompt:

```shell
env -i HOME="$HOME" PATH="/usr/bin:/bin" ssh -T git@github.com
```

Cron runs on the host, so this also covers the admin page under
`docker compose up` — the container has no git of its own, but the Publish
button only leaves a note (`web/.publish-requested`) for `git-sync.sh` to
act on. The push to `main` is never forced: if `main` ever gets commits
that `dev` doesn't have, the publish is refused and the admin page shows
the error.

## Repo layout

- **`web/`** — the 11ty site: `index.html`, `gen.js`, `_data/boo.json`,
  `img-product/`, `css/`, `js/`. This is what Netlify builds and deploys
  (`netlify.toml` sets `base = "web"`).
- **`admin/`** — the local-only admin page for editing `web/_data/boo.json`.
- **`scripts/`** — maintenance scripts, run from the repo root.

Each of `web/` and `admin/` has its own `package.json` and `node_modules`;
the root `package.json` just delegates (`npm run build`/`serve`/`clean` to
`web/`, `npm run admin` to `admin/`). See `CLAUDE.md` for how the pieces
work in detail.

## Other tasks

```shell
# build the site once, into web/_site/
npm run build

# delete files in web/img-product/ that boo.json no longer uses (needs jq)
./scripts/cleanup-unused-images.sh [--dry-run]

# strip EXIF/ICC/C2PA metadata from every image in web/img-product/
# (needs exiftool; admin uploads are stripped automatically)
./scripts/strip-image-metadata.sh

# update the vendored Bootstrap files (after updating the bootstrap package)
cd web
cp ./node_modules/bootstrap/dist/css/bootstrap.min.css ./css/
cp ./node_modules/bootstrap/dist/js/bootstrap.min.js ./js/
cp ./node_modules/bootstrap-icons/font/fonts/* ./css/fonts/
```
