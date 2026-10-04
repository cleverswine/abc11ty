// Reading and writing web/_data/boo.json, shared by web/gen.js and
// admin/server.js (which imports it as ../web/lib/boo.js).
import * as fs from 'node:fs';

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
