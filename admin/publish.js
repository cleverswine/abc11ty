// Publishing: commits the site's content to `main` on GitHub through
// GitHub's REST API - no git, SSH key or cron needed. Netlify deploys `main`
// as usual.
//
// The content (web/content/: boo.json and img-product/, see web/lib/boo.js)
// exists in three places:
//   - the working copy here, which the admin page edits and the preview
//     site shows (on the server, a ./content directory mounted over
//     web/content - see docker-compose.yml);
//   - web/content/ on GitHub's `main`, which the public site is built from;
//   - in between, the *base* (content/.publish-base.json): the `main`
//     commit the working copy was last in sync with, and the git blob id of
//     each content file in it.
//
// A file whose git blob id differs from the base's is an unpublished change
// (git's blob id is just a hash of the file, so it's computed here, no git
// needed). Publishing uploads only those files and commits them on top of
// `main`'s latest commit, touching nothing outside web/content/ - so code
// pushed to `main` meanwhile is kept, and code and content never block each
// other. Content changed on GitHub since the base (someone pushed a change
// to web/content/) is brought into the working copy, unless the same file
// was changed here too: that's a conflict, which a publish refuses unless
// told to replace GitHub's version. boo.json, which holds every section, is
// merged section by section instead (mergeBoo()), so only a section changed
// on both sides is a conflict.
//
// Needs GITHUB_TOKEN (see web/lib/env.js): a fine-grained token for this
// repository with "Contents: read and write".

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BOO_PATH, CONTENT_DIR, readBoo, writeBoo } from '../web/lib/boo.js';
import { envValue } from '../web/lib/env.js';

const REPO = envValue('GITHUB_REPO') || 'cleverswine/abc11ty';
const BRANCH = 'main';
// where the content lives in the repo
const REPO_CONTENT_DIR = 'web/content';
const BASE_PATH = path.join(CONTENT_DIR, '.publish-base.json');
// files uploaded to GitHub at the same time
const UPLOAD_CONCURRENCY = 4;

export function githubConfigured() {
    return Boolean(envValue('GITHUB_TOKEN'));
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

class GitHubError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Calls the repository's REST API, e.g. github('GET', '/git/ref/heads/main').
// Rate limits are waited out the way GitHub's docs say (retry-after, or the
// reset time, or at least a minute, growing on repeats) - which matters for
// a big publish, as GitHub allows only 80 new files a minute and 500 an hour.
async function github(method, apiPath, body, onWait = () => {}) {
    for (let attempt = 1; ; attempt++) {
        let res = await fetch(`https://api.github.com/repos/${REPO}${apiPath}`, {
            method,
            headers: {
                'Authorization': `Bearer ${envValue('GITHUB_TOKEN')}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                ...(body && {'Content-Type': 'application/json'}),
            },
            body: body && JSON.stringify(body),
        });
        if (res.ok) return res.json();
        let text = await res.text();
        let rateLimited = res.status === 429 || (res.status === 403 && /rate limit/i.test(text));
        if (rateLimited && attempt < 8) {
            let wait = res.headers.get('retry-after') ? +res.headers.get('retry-after') * 1000
                : res.headers.get('x-ratelimit-remaining') === '0' ? +res.headers.get('x-ratelimit-reset') * 1000 - Date.now()
                : 60000 * 2 ** (attempt - 1);
            onWait(Math.max(wait, 1000));
            await delay(Math.max(wait, 1000));
            continue;
        }
        if (res.status >= 500 && attempt < 4) {
            await delay(2000 * attempt);
            continue;
        }
        let message = text;
        try { message = JSON.parse(text).message ?? text; } catch {}
        throw new GitHubError(res.status, `GitHub ${method} ${apiPath}: ${res.status} ${message}`);
    }
}

async function mainHead() {
    return (await github('GET', `/git/ref/heads/${BRANCH}`)).object.sha;
}

// The content files in a commit, as a Map of path (relative to the content
// directory, e.g. "img-product/1.webp") to git blob id, plus the commit's
// tree id.
async function remoteContent(commitSha) {
    let commit = await github('GET', `/git/commits/${commitSha}`);
    let tree = await github('GET', `/git/trees/${commit.tree.sha}?recursive=1`);
    if (tree.truncated) throw new Error('the repository is too big to list in one request');
    let prefix = REPO_CONTENT_DIR + '/';
    let files = new Map(tree.tree
        .filter(entry => entry.type === 'blob' && entry.path.startsWith(prefix))
        .map(entry => [entry.path.slice(prefix.length), entry.sha]));
    return {treeSha: commit.tree.sha, files};
}

async function downloadBlob(sha) {
    let blob = await github('GET', `/git/blobs/${sha}`);
    return Buffer.from(blob.content, blob.encoding === 'base64' ? 'base64' : 'utf8');
}

// ---------------------------------------------------------------------------
// The working copy
// ---------------------------------------------------------------------------

// git's id for a file's contents
function blobSha(buffer) {
    return crypto.createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
}

// path -> {size, mtimeMs, sha}, so only files that changed are re-hashed
const shaCache = new Map();

// The working copy's content files - boo.json and img-product/* (dot files
// and leftover temp files aren't content) - as a Map of path to git blob id.
function localContent() {
    let paths = [];
    if (fs.existsSync(path.join(CONTENT_DIR, 'boo.json'))) paths.push('boo.json');
    let imageDir = path.join(CONTENT_DIR, 'img-product');
    if (fs.existsSync(imageDir)) {
        for (let file of fs.readdirSync(imageDir)) {
            if (!file.startsWith('.')) paths.push(`img-product/${file}`);
        }
    }
    let files = new Map();
    for (let rel of paths) {
        let full = path.join(CONTENT_DIR, rel);
        let stat = fs.statSync(full);
        if (!stat.isFile()) continue;
        let cached = shaCache.get(rel);
        if (!cached || cached.size !== stat.size || cached.mtimeMs !== stat.mtimeMs) {
            cached = {size: stat.size, mtimeMs: stat.mtimeMs, sha: blobSha(fs.readFileSync(full))};
            shaCache.set(rel, cached);
        }
        files.set(rel, cached.sha);
    }
    return files;
}

function readBase() {
    if (!fs.existsSync(BASE_PATH)) return null;
    let base = JSON.parse(fs.readFileSync(BASE_PATH, 'utf8'));
    return {...base, files: new Map(Object.entries(base.files))};
}

function writeBase(base) {
    let tmp = BASE_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({...base, files: Object.fromEntries(base.files)}, null, 1) + '\n');
    fs.renameSync(tmp, BASE_PATH);
}

// Writes a file from GitHub into the working copy (null contents deletes it),
// via a temp file so the admin server and site never see half of one.
function writeLocal(rel, contents) {
    let full = path.join(CONTENT_DIR, rel);
    if (contents === null) {
        fs.rmSync(full, {force: true});
        return;
    }
    fs.mkdirSync(path.dirname(full), {recursive: true});
    fs.writeFileSync(full + '.tmp', contents);
    fs.renameSync(full + '.tmp', full);
}

// Which paths differ between two path -> blob id maps.
function differences(a, b) {
    return [...new Set([...a.keys(), ...b.keys()])].filter(p => a.get(p) !== b.get(p));
}

// The unpublished changes, compared with the base (no network involved):
// {changed, added, deleted} lists of paths.
export function unpublishedChanges() {
    let base = readBase();
    if (!base) return null;
    let local = localContent();
    let changes = {changed: [], added: [], deleted: []};
    for (let p of differences(base.files, local)) {
        if (!base.files.has(p)) changes.added.push(p);
        else if (!local.has(p)) changes.deleted.push(p);
        else changes.changed.push(p);
    }
    return changes;
}

// Brings content changed on GitHub (between the base and `main`'s commit
// `head`, whose files are `remote`) into the working copy, except files also
// changed here, whose paths are returned as conflicts. `resolved` paths
// already have GitHub's changes merged in (see mergeBoo()), so are skipped.
async function takeRemoteChanges(base, remote, local, log, resolved = []) {
    let conflicts = [];
    let take = [];
    for (let p of differences(base.files, remote)) {
        if (resolved.includes(p)) continue;
        if (local.get(p) === remote.get(p)) continue;        // already the same
        if (local.get(p) === base.files.get(p)) take.push(p); // untouched here
        else conflicts.push(p);
    }
    for (let p of take) {
        log(`  getting ${p} from GitHub`);
        writeLocal(p, remote.has(p) ? await downloadBlob(remote.get(p)) : null);
    }
    return {taken: take, conflicts};
}

// ---------------------------------------------------------------------------
// Merging boo.json
// ---------------------------------------------------------------------------

// boo.json is one file holding everything, so when it's changed both here
// and on GitHub it's merged rather than one side replacing the other: a
// three-way merge against the base's version, section by section (matched
// by sectionId) and, within a section, field by field (sectionTitle, photos,
// items, subcategories, ...). A section or field changed on only one side
// takes that side's version; one changed on both sides differently is a
// conflict - reported by section title, and settled in this copy's favour
// when `replace` is set. Section order follows whichever side reordered
// (this copy's, if both did); a section added on one side goes after the
// section it follows there.

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// three-way pick for one value; undefined means absent
function pick(base, local, remote) {
    if (same(local, remote) || same(remote, base)) return {value: local};
    if (same(local, base)) return {value: remote};
    return {value: local, conflict: true};
}

// keys/ids in order: `primary`'s, with ones only in `other` inserted after
// the key they follow there
function mergeOrder(primary, other) {
    let order = [...primary];
    other.forEach((key, i) => {
        if (order.includes(key)) return;
        let at = i === 0 ? 0 : order.indexOf(other[i - 1]) + 1;
        order.splice(at, 0, key);
    });
    return order;
}

// whether `list`'s order differs from `base`'s, among the ids both have
function reordered(base, list) {
    let a = base.filter(id => list.includes(id));
    let b = list.filter(id => base.includes(id));
    return !same(a, b);
}

function mergeSection(base = {}, local, remote) {
    let merged = {};
    let conflict = false;
    for (let key of mergeOrder(Object.keys(local), Object.keys(remote))) {
        let r = pick(base[key], local[key], remote[key]);
        conflict ||= r.conflict;
        if (r.value !== undefined) merged[key] = r.value;
    }
    return {section: merged, conflict};
}

// Returns {boo, conflicts: [section titles]}; `boo` takes this copy's side
// of any conflict.
export function mergeBooSections(base, local, remote) {
    let byId = list => new Map(list.map(s => [s.sectionId, s]));
    let [b, l, r] = [byId(base), byId(local), byId(remote)];
    let ids = list => list.map(s => s.sectionId);
    let order = reordered(ids(base), ids(local)) || !reordered(ids(base), ids(remote))
        ? mergeOrder(ids(local), ids(remote))
        : mergeOrder(ids(remote), ids(local));
    let boo = [];
    let conflicts = [];
    for (let id of order) {
        let [bs, ls, rs] = [b.get(id), l.get(id), r.get(id)];
        let title = (ls ?? rs ?? bs).sectionTitle || id;
        if (ls && rs && !same(ls, rs)) {
            let {section, conflict} = mergeSection(bs, ls, rs);
            if (conflict) conflicts.push(title);
            boo.push(section);
            continue;
        }
        // the same on both sides, or added/removed on one side
        let {value, conflict} = pick(bs, ls, rs);
        if (conflict) conflicts.push(title);
        if (value) boo.push(value);
    }
    return {boo, conflicts};
}

// Merges GitHub's boo.json (blob `remoteSha`) into this copy's, against the
// base's (blob `baseSha`, null if it had none). With conflicts and no
// `replace`, nothing is written. Returns {merged: whether this copy now
// includes GitHub's changes, conflicts: [section titles]}.
async function mergeBoo(baseSha, remoteSha, {replace, log}) {
    let base = baseSha ? JSON.parse(await downloadBlob(baseSha)) : [];
    let remote = remoteSha ? JSON.parse(await downloadBlob(remoteSha)) : [];
    // read and written with no await in between, so an edit made here
    // meanwhile isn't lost
    let local = readBoo(BOO_PATH);
    let {boo, conflicts} = mergeBooSections(base, local, remote);
    if (conflicts.length && !replace) return {merged: false, conflicts};
    log(`  merging GitHub's changes to boo.json${conflicts.length ? ` (keeping this copy's ${conflicts.join(', ')})` : ''}`);
    if (!same(boo, local)) writeBoo(BOO_PATH, boo);
    return {merged: true, conflicts};
}

// A conflict in boo.json, as listed to the page: "boo.json#<section title>".
const booConflicts = titles => titles.map(t => `boo.json#${t}`);

// ---------------------------------------------------------------------------
// Syncing and publishing
// ---------------------------------------------------------------------------

// Brings the working copy up to date with `main` (run when the admin starts).
// With no base yet: an empty working copy (a new server) is filled from
// `main`; an existing one is taken to be `main`'s, so anything that differs
// shows as unpublished. Otherwise content changed on GitHub since the base is
// brought in, and the base moves to `main`'s latest commit - unless a file
// was changed on both sides, which is left for publishing to settle.
// Returns {taken, conflicts}.
export async function syncFromGitHub({log = console.log} = {}) {
    let head = await mainHead();
    let {files: remote} = await remoteContent(head);
    let base = readBase();
    if (!base) {
        if (!fs.existsSync(path.join(CONTENT_DIR, 'boo.json'))) {
            log(`filling ${CONTENT_DIR} from GitHub (${remote.size} files)...`);
            await mapLimit([...remote], 8, async ([p, sha]) => writeLocal(p, await downloadBlob(sha)));
        }
        writeBase({commit: head, files: remote});
        return {taken: [], conflicts: []};
    }
    if (head === base.commit) return {taken: [], conflicts: []};
    let boo = await resolveBoo(base, remote, {replace: false, log});
    let result = await takeRemoteChanges(base, remote, localContent(), log, boo.resolved);
    let conflicts = [...result.conflicts.filter(p => p !== 'boo.json'), ...booConflicts(boo.conflicts)];
    if (conflicts.length === 0) writeBase({commit: head, files: remote});
    return {taken: [...result.taken, ...boo.resolved], conflicts};
}

// If boo.json was changed both here and on GitHub (`remote`) since the base,
// merges GitHub's changes into this copy (see mergeBoo()). Returns
// {resolved: ['boo.json'] if it now includes GitHub's changes, else [],
// conflicts: [section titles]}.
async function resolveBoo(base, remote, {replace, log}) {
    let p = 'boo.json';
    let local = localContent();
    let changedHere = local.get(p) !== base.files.get(p);
    let changedThere = remote.get(p) !== base.files.get(p);
    if (!changedHere || !changedThere || local.get(p) === remote.get(p) || !local.has(p)) {
        return {resolved: [], conflicts: []};
    }
    let {merged, conflicts} = await mergeBoo(base.files.get(p), remote.get(p), {replace, log});
    return {resolved: merged ? [p] : [], conflicts};
}

async function mapLimit(list, limit, fn) {
    let results = new Array(list.length);
    let next = 0;
    let worker = async () => {
        while (next < list.length) {
            let i = next++;
            results[i] = await fn(list[i], i);
        }
    };
    await Promise.all(Array.from({length: Math.min(limit, list.length)}, worker));
    return results;
}

class ConflictError extends Error {
    constructor(conflicts) {
        super(`changed both here and on GitHub since the last publish: ${conflicts.join(', ')}`);
        this.conflicts = conflicts;
    }
}

function commitMessage(paths, deleted) {
    let photos = paths.filter(p => p.startsWith('img-product/')).length;
    let parts = [];
    if (paths.includes('boo.json')) parts.push('content');
    if (photos) parts.push(`${photos} photo${photos === 1 ? '' : 's'}`);
    if (deleted.length) parts.push(`${deleted.length} file${deleted.length === 1 ? '' : 's'} removed`);
    return `Publish from the admin page: ${parts.join(', ')}`;
}

// Publishes the working copy's changes to `main`: uploads the changed files,
// commits them on top of `main`'s latest commit (only web/content/ is
// touched), and moves `main` to it - never forcing; if `main` moved in the
// meantime it starts over. Content changed on GitHub since the base is
// brought into the working copy too. If a file was changed both here and on
// GitHub it throws a ConflictError (`.conflicts`), changing nothing - unless
// `replace` is set, in which case this copy's version wins.
//
// onProgress({phase: 'uploading', done, total} | {phase: 'waiting', ms}).
// Returns {commit, published: count, taken: [paths]} (commit null if there
// was nothing to publish).
export async function publish({replace = false, onProgress = () => {}, log = console.log} = {}) {
    for (let attempt = 1; ; attempt++) {
        let head = await mainHead();
        let {treeSha, files: remote} = await remoteContent(head);
        let base = readBase() ?? {commit: head, files: remote};
        // boo.json is merged rather than replaced, even with `replace` -
        // which only settles conflicting sections in this copy's favour
        let boo = await resolveBoo(base, remote, {replace, log});
        let local = localContent();

        let localChanges = differences(base.files, local);
        let remoteChanges = differences(base.files, remote);
        let conflicts = localChanges.filter(p => remoteChanges.includes(p) && local.get(p) !== remote.get(p)
            && !boo.resolved.includes(p));
        conflicts = [...conflicts.filter(p => p !== 'boo.json'), ...booConflicts(boo.conflicts)];
        if (conflicts.length && !replace) throw new ConflictError(conflicts);

        // what GitHub needs from here: every file that differs from main's,
        // except ones changed only on GitHub (those come the other way)
        let toPublish = differences(remote, local)
            .filter(p => localChanges.includes(p));
        let upload = toPublish.filter(p => local.has(p));
        let deleted = toPublish.filter(p => !local.has(p));

        let commit = null;
        let published = new Map();
        if (toPublish.length) {
            let done = 0;
            onProgress({phase: 'uploading', done, total: upload.length});
            let entries = await mapLimit(upload, UPLOAD_CONCURRENCY, async p => {
                let contents = fs.readFileSync(path.join(CONTENT_DIR, p));
                let blob = await github('POST', '/git/blobs', {content: contents.toString('base64'), encoding: 'base64'},
                    ms => onProgress({phase: 'waiting', ms, done, total: upload.length}));
                published.set(p, blob.sha);
                onProgress({phase: 'uploading', done: ++done, total: upload.length});
                return {path: `${REPO_CONTENT_DIR}/${p}`, mode: '100644', type: 'blob', sha: blob.sha};
            });
            entries.push(...deleted.map(p => ({path: `${REPO_CONTENT_DIR}/${p}`, mode: '100644', type: 'blob', sha: null})));
            let tree = await github('POST', '/git/trees', {base_tree: treeSha, tree: entries});
            let created = await github('POST', '/git/commits', {
                message: commitMessage(upload, deleted),
                tree: tree.sha,
                parents: [head],
            });
            try {
                await github('PATCH', `/git/refs/heads/${BRANCH}`, {sha: created.sha, force: false});
            } catch (e) {
                // main moved since we read it (not a fast-forward): start over
                if (e.status === 422 && attempt < 3) {
                    log('main moved during the publish - starting over');
                    continue;
                }
                throw e;
            }
            commit = created.sha;
            log(`published ${toPublish.length} files as ${commit.slice(0, 7)}`);
        }

        // bring in what changed only on GitHub (none of it is a conflict
        // left unpublished: conflicting files were published above)
        let {taken} = await takeRemoteChanges(base, remote, local, log, boo.resolved);
        taken.push(...boo.resolved);

        // the new base: main's files as they now are
        let files = new Map(remote);
        for (let [p, sha] of published) files.set(p, sha);
        for (let p of deleted) files.delete(p);
        writeBase({commit: commit ?? head, files});
        return {commit, published: toPublish.length, taken};
    }
}
