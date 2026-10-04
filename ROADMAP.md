# Roadmap: making the site easier to maintain

Written October 2026. Steps 1-3 of the suggested order are done, and so
is most of step 4: `gen.js` uses the Etsy API, and there's a dev container. The goal: the home server is
the only place work happens, and day to day, nobody needs anything but the
admin page in a browser.

The problems this addresses:

1. The server has to stay on the `dev` branch, since admin edits are
   auto-pushed, but not every change should go to the production site.
2. Setting up a machine to work on this takes too much effort: Node, the
   Playwright browser and its system libraries, and installing both `web/`
   and `admin/` separately.
3. Scraping Etsy is fragile (captchas, a headed browser), but there was no
   other obvious way to mirror the products.
4. Whoever uses the admin page can't publish the site, which is awkward
   with the admin tool running in Docker.
5. Keeping dependencies up to date will be hard without a coding agent
   on hand.

## Suggested order

1. ~~Commit lockfiles and move to Node 24.~~ Done.
2. ~~Add the Publish button.~~ Done. Still optional: Netlify branch deploys
   for `dev` (see below).
3. ~~Apply for an Etsy API key.~~ Done.
4. ~~Once the key arrives: rewrite `gen.js` on the API~~ (done) and run it
   in Docker - now possible, since it no longer needs a browser.
   (~~Add a dev container.~~ Done.)
5. Set up Renovate and write the runbook.

## A "Publish" button that keeps the server on `dev` (problems 1 and 4)

A flag that a cron job checks works well, with two adjustments:

- **Use a flag file, not a flag in `boo.json`.** For example
  `web/.publish-requested`, listed in `.gitignore`. A flag inside `boo.json`
  would be auto-committed by `git-sync.sh`, and leftover flags would cause
  surprise publishes.
- **Publishing doesn't need a branch switch.** From the `dev` checkout,
  `git push origin dev:main` moves `main` up to match `dev`, and Netlify's
  production deploy follows. The server never leaves `dev`.

How it would work:

- **Admin page:** a **Publish site** button that writes the flag file, plus
  a "Last published: …" line read from a status file.
- **`scripts/git-sync.sh`** (already run by cron) gets one more step: if the
  flag file exists, sync as usual, run `git push origin dev:main`, write the
  result (the time, or the error) to the status file, and delete the flag.
- **Safety:** if someone ever commits directly to `main`, the push is
  refused rather than overwriting it, and the admin page shows the error.
- **No container changes:** the admin container still needs no git and no
  SSH keys, since the host's cron does the pushing.

Optional: turn on Netlify branch deploys for `dev`. Every auto-sync then
gets its own preview address, so changes can be checked on the real site
before pressing Publish.

## Replace scraping with Etsy's API (problem 3)

Done (October 2026): `gen.js` now uses the API (see CLAUDE.md), and the
site footer has Etsy's attribution notice.

Etsy has an official API (Open API v3). Reading public shop data needs only
an API key: register a personal app at <https://www.etsy.com/developers>,
and Etsy has to approve it. It provides:

- **The shop's sections and every active listing**, including each
  listing's section ID. That settles which category a listing belongs in,
  with no breadcrumb guessing (see `gen.js --item`).
- **Each listing's photos**, as direct image addresses, so no thumbnail-URL
  swapping.
- **Plain web requests**: no browser, no captcha, no `.etsy-session.json`.

That removes Playwright (the hardest dependency to install) and
`node-html-parser`, and lets `gen.js` run unattended on a schedule, for
example nightly from cron.

Check before committing to this:

- **Approval:** Etsy has to approve the app, and it isn't instant or
  guaranteed.
- **Attribution:** Etsy may require a short notice on the site saying it
  uses the Etsy API and isn't endorsed by Etsy. Check their current terms
  when registering.

Alternatives considered and rejected: the shop's RSS feed only lists recent
items and has no sections; Etsy's CSV download is manual and has no photos.

## No more workstation setup (problem 2)

Done: `.devcontainer/` and a root `npm install` that installs both
projects. Not yet: running `gen.js` in Docker. That waited for the API
switch (a container can only run Chromium headless, which Etsy's captcha
blocked); now that `gen.js` needs no browser, a `gen` service on a plain
`node:24-alpine` image with the key passed as environment variables is
all it takes.

- **Run everything in Docker,** including `gen.js` (for example a `gen`
  service in `docker-compose.yml`, run with `docker compose run gen`). The
  server then needs only Docker, not Node.
- **Add a dev container config** (`.devcontainer/`) for the rare times code
  needs editing. Opening the repo in VS Code, or in a GitHub Codespace in a
  browser with nothing installed, gives a ready environment with both
  projects installed.
- **One install command:** make the root `npm install` install both `web/`
  and `admin/`.

## Keeping it alive without an agent (problem 5)

The live site is plain static files, so outdated dependencies can't break
it; they can only make a rebuild fail. This is mostly about keeping builds
reliable:

- **Commit lockfiles.** `.gitignore` currently excludes
  `package-lock.json`, so no versions are pinned. Every Netlify build and
  every container restart (which runs `npm install`) can quietly pick up
  newer versions. Commit the lockfiles and use `npm ci`, so builds are
  reproducible. This is the most important fix here.
- **Upgrade Node.** The containers run `node:20-alpine`, and Node 20
  reached end of life in April 2026. Move to Node 24 and pin the same
  version everywhere: `docker-compose.yml`, a `.nvmrc` file, and Netlify.
- **Automate updates.** Renovate (a free GitHub app) can open a monthly pull
  request with dependency updates. Netlify builds a preview for each one.
  Let minor and patch updates merge automatically when the build passes;
  leave major updates for whenever someone next looks.
- **Fewer dependencies.** After the API switch, what's left is Eleventy,
  eleventy-img, Express, multer and sharp.
- **A short runbook at the top of the README:** "Edit in admin, then press
  Publish. If the site looks wrong, check the deploys in Netlify. To update
  dependencies, merge the Renovate pull request."
