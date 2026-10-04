// Where the site's content lives, and reading and writing its boo.json -
// shared by web/gen.js, web/lib/etsy.js, web/eleventy.config.js and
// admin/server.js (which imports it as ../web/lib/boo.js).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// The content: content/boo.json (every section and item) and
// content/img-product/ (their photos). Photo paths in boo.json are like
// "img-product/123.webp" - relative to this directory, and also the URL the
// site serves them at. On the server, docker-compose.yml mounts a separate
// ./content directory here, so the git checkout's own copy is never edited.
export const CONTENT_DIR = fileURLToPath(new URL('../content/', import.meta.url));
export const BOO_PATH = path.join(CONTENT_DIR, 'boo.json');
export const IMAGE_DIR = path.join(CONTENT_DIR, 'img-product');

// An item gen.js copied from Etsy - replaced on every run, so read-only in
// the admin tool - as opposed to one added by hand (source: "Manual").
// admin/public/app.js has a copy for the browser.
export function isEtsyItem(item) {
    return item.source === 'Etsy';
}

export function readBoo(path) {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

// Writes to a temp file and renames it over boo.json, so anything reading it
// at the same moment (the admin server, gen.js, scripts/git-sync.sh, the
// eleventy dev server) gets the old file or the new one, never half of one.
export function writeBoo(path, boo) {
    let tmpPath = path + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(boo, null, 2) + '\n');
    fs.renameSync(tmpPath, path);
}
