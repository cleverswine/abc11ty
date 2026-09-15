#!/usr/bin/env bash
# Deletes files in web/img-product/ that aren't referenced by any item's
# "images" array in web/_data/boo.json.
# Pass --dry-run to only list what would be deleted.
set -euo pipefail
shopt -s nullglob

if ! command -v jq >/dev/null 2>&1; then
    echo "error: jq is required (e.g. apt install jq)" >&2
    exit 1
fi

dry_run=false
if [ "${1:-}" = "--dry-run" ]; then
    dry_run=true
fi

# assumes it's run from the repo root
cd web

referenced=$(jq -r '.[] | (.items[]?, (.subcategories[]?.items[]?)) | .images[]?' \
    _data/boo.json | sed 's#^img-product/##' | sort -u)

unused=()
for path in img-product/*; do
    name=$(basename "$path")
    if ! grep -qxF "$name" <<< "$referenced"; then
        unused+=("$path")
    fi
done

if [ ${#unused[@]} -eq 0 ]; then
    echo "no unused images found"
    exit 0
fi

echo "unused images (${#unused[@]}):"
printf '  %s\n' "${unused[@]}"

if [ "$dry_run" = true ]; then
    echo "dry run - nothing deleted"
    exit 0
fi

read -r -p "Delete these ${#unused[@]} file(s)? [y/N] " reply
if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    echo "aborted - nothing deleted"
    exit 0
fi

rm -f -- "${unused[@]}"
echo "deleted ${#unused[@]} file(s)"
