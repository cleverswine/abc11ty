#!/usr/bin/env bash
# Strips EXIF/ICC/C2PA/XMP metadata from product images in place - in
# ./content if there is one (the server's, see docker-compose.yml), else
# web/content.
# Pixel data is untouched - exiftool rewrites only metadata segments.
set -euo pipefail
shopt -s nullglob nocaseglob

if ! command -v exiftool >/dev/null 2>&1; then
    echo "error: exiftool is required (e.g. apt install libimage-exiftool-perl)" >&2
    exit 1
fi

# assumes it's run from the repo root
if [ -d content ]; then cd content/img-product; else cd web/content/img-product; fi
images=(*.png *.jpg *.jpeg *.webp *.gif)
if [ ${#images[@]} -eq 0 ]; then
    echo "no images found in $(pwd)" >&2
    exit 0
fi
exiftool -all= -overwrite_original "${images[@]}"
