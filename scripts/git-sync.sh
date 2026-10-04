#!/usr/bin/env bash
# Auto-commits and pushes changes to web/_data/boo.json and web/img-product/
# (never anything else in the repo). Meant to run unattended on a schedule
# (see CLAUDE.md) so admin-tool edits and gen.js scrapes always make it to
# git without anyone remembering to do it by hand.
# No-ops cleanly if there's nothing to commit.
#
# Also handles the admin page's "Publish site" button: if
# web/.publish-requested exists, it pushes dev to main (which Netlify deploys
# to production), records the outcome in web/.publish-status for the admin
# page to show, and deletes the flag. The push is never forced, so if main
# has commits dev doesn't, it's refused and the error is shown instead.
#
# The flag is claimed by renaming it to web/.publish-in-progress (atomic), so
# the admin page's "Cancel publish" either deletes the flag first and wins, or
# finds it gone and reports that it was too late - never both.
set -euo pipefail

# assumes it's run from the repo root
paths=(web/_data/boo.json web/img-product)
publish_flag=web/.publish-requested
publish_status=web/.publish-status
publish_claim=web/.publish-in-progress

# Status file format, read by admin/server.js: line 1 is "ok" or "error",
# line 2 the time, the rest the published commit or the git error output.
write_status() {
    local tmp="$publish_status.tmp"
    printf '%s\n%s\n%s\n' "$1" "$(date -Iseconds)" "$2" > "$tmp"
    mv "$tmp" "$publish_status"
}

if git status --porcelain -- "${paths[@]}" | grep -q .; then
    git add -- "${paths[@]}"
    git commit -m "Auto-sync boo.json / product images"
    if ! out=$(git push 2>&1); then
        echo "$out" >&2
        if [[ -f $publish_flag ]]; then
            rm -f "$publish_flag"
            write_status error "Saving changes to GitHub failed, so nothing was published:"$'\n'"$out"
        fi
        exit 1
    fi
fi

# Claimed before pushing so a failure isn't retried every run; pressing
# Publish again retries it.
if mv "$publish_flag" "$publish_claim" 2>/dev/null; then
    if out=$(git push origin dev:main 2>&1); then
        write_status ok "$(git rev-parse --short dev)"
        rm -f "$publish_claim"
        echo "Published dev to main"
    else
        write_status error "$out"
        rm -f "$publish_claim"
        echo "$out" >&2
        exit 1
    fi
fi
