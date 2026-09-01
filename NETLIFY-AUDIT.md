# Netlify build setup audit

Findings from checking whether this repo is set up correctly for building
and deploying to Netlify on push to `main`.

## Current state

- **No `netlify.toml`.** Build config (build command, publish directory)
  lives only wherever it was configured in the Netlify dashboard UI, if at
  all. Nothing in the repo pins these down.
- `.eleventyignore` already excludes `admin/`, `sandbox/`, `README.md`, and
  `LICENCE`, so the self-hosted admin app is not processed as site content
  by Eleventy.
- No `.nvmrc` or `engines` field, so the Node version used for the build is
  whatever Netlify defaults to — unpinned.
- `package-lock.json` exists locally but is excluded via `.gitignore`, so
  Netlify can't see it and falls back to `npm install` instead of `npm ci`.
- `_site/` (the build output directory) is committed to git instead of
  gitignored.
- `_data/products.json`, `_data/categories.json`, and the new
  `img-product/<uuid>/` upload directory (written by the new admin app) are
  untracked. Currently harmless — `index.html` still loops over the old,
  tracked `_data/boo.json` — but once the site templates are switched over
  to the admin app's `products`/`categories` data, these files must be
  committed or the live Netlify build will have no product data.

## Proposed fixes (not yet applied)

1. Add `netlify.toml` with explicit `build.command` (`npx @11ty/eleventy`)
   and `build.publish` (`_site`), matching the values that are almost
   certainly already configured in the dashboard.
2. Remove `package-lock.json` from `.gitignore` and commit a
   freshly-regenerated lockfile (regenerate via `npm install` first, since
   it's been gitignored this whole time and may be stale).
3. Add `_site/` to `.gitignore` and `git rm -r --cached _site` to stop
   tracking build output.

## Caveat

Netlify's `netlify.toml` build command/publish directory take precedence
over dashboard UI settings. If the dashboard currently has different values
(a custom command, a different publish dir, a base directory, etc.), adding
`netlify.toml` will silently change effective behavior. Verify current
dashboard settings before or immediately after applying fix #1.

## Not included in this pass

Committing `_data/products.json`, `_data/categories.json`, and the new
`img-product/<uuid>/` folder is a *future* action tied to wiring the admin
app's data into the site templates — not part of this immediate fix set.
