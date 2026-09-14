# abc11ty

Auntie Boo Crafts built by 11ty.

## Repo layout

Two independent Node projects live side by side, each with its own
`package.json`/`node_modules`:

- **`web/`** — the 11ty site itself: `index.html`, `gen.js`, `_data/boo.json`,
  `img-product/`, `css/`, `js/`, etc. This is what Netlify builds and deploys
  (see `netlify.toml`, which sets `base = "web"`).
- **`admin/`** — a local-only admin tool for editing `web/_data/boo.json`
  without hand-editing JSON.

The root `package.json` is just a thin wrapper: `npm run build`/`serve`/`clean`
delegate to `web/`, and `npm run admin` delegates to `admin/`.

See `CLAUDE.md` for how the pieces actually work (data model, `gen.js`,
`admin/server.js`, etc).

## Running it

```shell
# install deps (each project has its own node_modules)
cd web && npm install && cd ..
cd admin && npm install && cd ..

# build / serve the site
npm run build
npm run serve

# run the admin tool — open http://localhost:4321
npm run admin

# or run site + admin together, sharing the same web/ dir
docker compose up

# re-scrape Etsy and regenerate web/_data/boo.json (run from web/)
cd web && node gen.js
cd web && node gen.js --skip-fetch   # reuse existing data, skip hitting Etsy

# update vendored bootstrap assets (run from web/)
cd web
cp ./node_modules/bootstrap/dist/css/bootstrap.min.css ./css/
cp ./node_modules/bootstrap/dist/js/bootstrap.min.js ./js/
cp ./node_modules/bootstrap-icons/font/fonts/* ./css/fonts/
```

## Scripts

All scripts below live in `scripts/` and assume they're run from the repo
root.

```shell
# commit + push web/_data/boo.json and web/img-product/ if either changed
./scripts/git-sync.sh
```

Meant to run unattended on a schedule rather than be triggered by hand, so
admin edits and scrapes always make it to git without anyone remembering to
commit/push. Set up on the server where the admin tool runs by adding this
line to the crontab (adjust the repo path first — the `cd` matters, since
the script assumes it's already running from the repo root):

```
*/15 * * * * cd /path/to/abc11ty && ./scripts/git-sync.sh >> .git-sync.log 2>&1
```

To add it without opening an editor, run this from the repo root (appends
the line to the current user's crontab, creating one if none exists yet):

```shell
(crontab -l 2>/dev/null; echo "*/15 * * * * cd $(pwd) && ./scripts/git-sync.sh >> .git-sync.log 2>&1") | crontab -
```

`crontab -l` afterward should show the new line. Two things worth checking
once before trusting the schedule:

- The remote is SSH (`git@github.com:...`) and cron has no SSH agent —
  confirm `env -i HOME="$HOME" PATH="/usr/bin:/bin" ssh -T git@github.com`
  authenticates without prompting.
- It doesn't apply to the `admin` container under `docker compose up`,
  which has no `.git` directory mounted and no `git` binary.

```shell
# sweep web/img-product/ for orphaned files (not referenced in boo.json or
# boo-old.json) — requires jq
./scripts/cleanup-unused-images.sh [--dry-run]

# strip EXIF/ICC/C2PA metadata from every image in web/img-product/ in place
# — requires exiftool; admin uploads are stripped automatically via sharp
./scripts/strip-image-metadata.sh
```
