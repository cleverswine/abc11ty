#!/usr/bin/env bash
# Auto-commits and pushes changes to web/_data/boo.json and web/img-product/
# (never boo-old.json, never anything else in the repo). Meant to run
# unattended on a schedule (see CLAUDE.md) so admin-tool edits and gen.js
# scrapes always make it to git without anyone remembering to do it by hand.
# No-ops cleanly if there's nothing to commit.
set -euo pipefail

# assumes it's run from the repo root
paths=(web/_data/boo.json web/img-product)

if ! git status --porcelain -- "${paths[@]}" | grep -q .; then
    exit 0
fi

git add -- "${paths[@]}"
git commit -m "Auto-sync boo.json / product images"
git push
