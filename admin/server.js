import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { BOO_PATH, IMAGE_DIR, isEtsyItem, readBoo as readBooFile, writeBoo as writeBooFile } from '../web/lib/boo.js';
import { etsyApiKey, refreshShop } from '../web/lib/etsy.js';
import { githubConfigured, publish, syncFromGitHub, unpublishedChanges } from './publish.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', 'web');

const app = express();
const PORT = process.env.PORT || 4321;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/img-product', express.static(IMAGE_DIR));
app.use('/assets/css', express.static(path.join(rootDir, 'css')));

const readBoo = () => readBooFile(BOO_PATH);
const writeBoo = boo => writeBooFile(BOO_PATH, boo);

function findSection(boo, sectionId) {
    return boo.find(s => s.sectionId === sectionId);
}

function findSubcategory(section, name) {
    return (section.subcategories || []).find(g => g.name === name);
}

function findItem(section, itemId) {
    for (let list of [section.items, ...(section.subcategories || []).map(g => g.items)]) {
        let item = (list || []).find(i => i.id === itemId);
        if (item) return {item, list};
    }
    return {item: null, list: null};
}

// An item sourced from Etsy is read-only and excluded from reordering here -
// gen.js re-scrapes and re-appends it on every run, so edits made here would
// just be clobbered. Anything else (source: "Manual", or unset) is ours.
const isLocked = isEtsyItem;

function shortId() {
    return randomUUID().split('-')[0];
}

// Returns `list` rearranged to follow `order` (a list of keys), or null
// unless `order` names every movable entry exactly once. Entries `isFixed`
// picks out aren't reordered - they stay first, in their current order.
function reorder(list, order, keyOf, isFixed = () => false) {
    order = Array.isArray(order) ? order : [];
    let movable = (list || []).filter(x => !isFixed(x));
    let byKey = new Map(movable.map(x => [keyOf(x), x]));
    if (order.length !== movable.length || new Set(order).size !== order.length || !order.every(k => byKey.has(k))) {
        return null;
    }
    return [...(list || []).filter(isFixed), ...order.map(k => byKey.get(k))];
}

function sanitizeItemInput(body) {
    return {
        title: String(body.title || ''),
        description: String(body.description || ''),
        images: Array.isArray(body.images) ? body.images.map(String).filter(Boolean) : [],
        etsyPage: String(body.etsyPage || ''),
        show: body.show !== false,
    };
}

function sanitizeEventInput(body) {
    return {
        name: String(body.name || ''),
        date: String(body.date || ''),
        location: String(body.location || ''),
        link: String(body.link || ''),
        show: body.show !== false,
    };
}

// ---- config ----

app.get('/api/config', (req, res) => {
    res.json({siteUrl: process.env.SITE_URL || null});
});

// ---- publishing to the live site (admin/publish.js does the work) ----
// A publish runs in the background (uploading many photos can take a while);
// the page starts one with POST and polls GET. One at a time. `sync` is the
// result of bringing in changes from GitHub when the server started.

let publishJob = {running: false, progress: null, last: null};
let lastSync = {ok: null, error: null, conflicts: []};

function publishStatus() {
    let configured = githubConfigured();
    return {
        configured,
        changes: configured ? unpublishedChanges() : null,
        sync: lastSync,
        ...publishJob,
    };
}

app.get('/api/publish', (req, res) => {
    res.json(publishStatus());
});

// {replace: true} publishes even files that were also changed on GitHub,
// replacing GitHub's version (see publish() in publish.js).
app.post('/api/publish', (req, res) => {
    if (!githubConfigured()) return res.status(400).json({error: 'no GitHub token - add GITHUB_TOKEN to web/.env'});
    if (!publishJob.running) {
        publishJob = {running: true, progress: null, last: publishJob.last};
        publish({replace: req.body?.replace === true, onProgress: progress => { publishJob.progress = progress; }})
            .then(result => {
                publishJob.last = {ok: true, time: new Date().toISOString(), ...result};
                lastSync = {ok: true, error: null, conflicts: []};
            })
            .catch(err => {
                console.error('publish failed', err);
                publishJob.last = {ok: false, time: new Date().toISOString(), error: err.message, conflicts: err.conflicts ?? null};
            })
            .finally(() => { publishJob.running = false; publishJob.progress = null; });
    }
    res.status(202).json(publishStatus());
});

// ---- checking Etsy for changes (web/lib/etsy.js does the work) ----
// A refresh runs in the background (it can take a while when photos need
// downloading); the page starts one with POST and polls GET for progress and
// the result. One at a time.

let etsyCheck = {running: false, progress: null, last: null};

function etsyCheckStatus() {
    return {configured: etsyApiKey() !== null, ...etsyCheck};
}

app.get('/api/etsy', (req, res) => {
    res.json(etsyCheckStatus());
});

app.post('/api/etsy/refresh', (req, res) => {
    let apiKey = etsyApiKey();
    if (!apiKey) return res.status(400).json({error: 'no Etsy API key - add ETSY_KEYSTRING and ETSY_SHARED_SECRET to web/.env'});
    if (!etsyCheck.running) {
        etsyCheck = {running: true, progress: {done: 0, total: 0}, last: etsyCheck.last};
        refreshShop({apiKey, onProgress: progress => { etsyCheck.progress = progress; }})
            .then(summary => { etsyCheck.last = {ok: true, time: new Date().toISOString(), summary}; })
            .catch(err => {
                console.error('Etsy check failed', err);
                etsyCheck.last = {ok: false, time: new Date().toISOString(), error: err.message};
            })
            .finally(() => { etsyCheck.running = false; etsyCheck.progress = null; });
    }
    res.status(202).json(etsyCheckStatus());
});

// ---- route parameters ----
// Every route under /api/sections/:sectionId gets a fresh copy of boo.json
// as req.boo (re-read each time, since gen.js writes the file too) and the
// section as req.section; :name, :eventId and :itemId likewise resolve to
// req.group, req.event and req.item (+ req.itemList, the array holding it).
// Any of them missing is a 404 before the route runs. Routes that change
// something finish with writeBoo(req.boo).

app.param('sectionId', (req, res, next, sectionId) => {
    req.boo = readBoo();
    req.section = findSection(req.boo, sectionId);
    if (!req.section) return res.status(404).json({error: 'section not found'});
    next();
});

app.param('name', (req, res, next, name) => {
    req.group = findSubcategory(req.section, name);
    if (!req.group) return res.status(404).json({error: 'subcategory not found'});
    next();
});

app.param('eventId', (req, res, next, eventId) => {
    req.event = (req.section.events || []).find(e => e.id === eventId);
    if (!req.event) return res.status(404).json({error: 'event not found'});
    next();
});

// On a subcategory path the item must be in that subcategory; on a section
// path it can be anywhere in the section.
app.param('itemId', (req, res, next, itemId) => {
    let {item, list} = req.group
        ? {item: (req.group.items || []).find(i => i.id === itemId), list: req.group.items}
        : findItem(req.section, itemId);
    if (!item) return res.status(404).json({error: 'item not found'});
    req.item = item;
    req.itemList = list;
    next();
});

// ---- sections (all freely editable - only individual Etsy-sourced items are locked) ----

app.get('/api/boo', (req, res) => {
    res.json(readBoo());
});

app.get('/api/sections/:sectionId', (req, res) => {
    res.json(req.section);
});

app.post('/api/sections', (req, res) => {
    let boo = readBoo();
    let sectionId = String(req.body.sectionId || '').trim();
    if (!sectionId) return res.status(400).json({error: 'sectionId is required'});
    if (findSection(boo, sectionId)) return res.status(409).json({error: 'sectionId already exists'});
    let section = {
        sectionId,
        sectionTitle: String(req.body.sectionTitle || sectionId),
        items: [],
        subcategories: [],
    };
    if (req.body.sectionDescription) section.sectionDescription = String(req.body.sectionDescription);
    if (req.body.show === false) section.show = false;
    boo.push(section);
    writeBoo(boo);
    res.status(201).json(section);
});

app.patch('/api/sections/:sectionId', (req, res) => {
    let section = req.section;
    if (typeof req.body.sectionTitle === 'string') section.sectionTitle = req.body.sectionTitle;
    if ('sectionDescription' in req.body) {
        if (req.body.sectionDescription === null || req.body.sectionDescription === '') {
            delete section.sectionDescription;
        } else {
            section.sectionDescription = req.body.sectionDescription;
        }
    }
    if (typeof req.body.show === 'boolean') section.show = req.body.show;
    if (typeof req.body.newSectionId === 'string' && req.body.newSectionId !== section.sectionId) {
        let newId = req.body.newSectionId.trim();
        if (!newId) return res.status(400).json({error: 'sectionId cannot be empty'});
        if (findSection(req.boo, newId)) return res.status(409).json({error: 'sectionId already exists'});
        section.sectionId = newId;
    }
    writeBoo(req.boo);
    res.json(section);
});

app.delete('/api/sections/:sectionId', (req, res) => {
    writeBoo(req.boo.filter(s => s !== req.section));
    res.status(204).end();
});

// ---- events on a section (e.g. live-events' in-person event list) ----

app.post('/api/sections/:sectionId/events', (req, res) => {
    let event = {id: 'event-' + shortId(), ...sanitizeEventInput(req.body)};
    req.section.events = req.section.events || [];
    req.section.events.push(event);
    writeBoo(req.boo);
    res.status(201).json(event);
});

app.patch('/api/sections/:sectionId/events/:eventId', (req, res) => {
    Object.assign(req.event, sanitizeEventInput({...req.event, ...req.body}));
    writeBoo(req.boo);
    res.json(req.event);
});

app.delete('/api/sections/:sectionId/events/:eventId', (req, res) => {
    req.section.events.splice(req.section.events.indexOf(req.event), 1);
    writeBoo(req.boo);
    res.status(204).end();
});

app.put('/api/sections/:sectionId/events/order', (req, res) => {
    let events = reorder(req.section.events, req.body.order, e => e.id);
    if (!events) return res.status(400).json({error: 'order must contain exactly the current event ids'});
    req.section.events = events;
    writeBoo(req.boo);
    res.json(req.section);
});

// ---- subcategories (any section - structure here is always editable) ----

app.post('/api/sections/:sectionId/subcategories', (req, res) => {
    let name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({error: 'name is required'});
    req.section.subcategories = req.section.subcategories || [];
    if (findSubcategory(req.section, name)) return res.status(409).json({error: 'a subcategory with that name already exists'});
    let group = {name, show: req.body.show !== false, items: []};
    req.section.subcategories.push(group);
    writeBoo(req.boo);
    res.status(201).json(group);
});

app.patch('/api/sections/:sectionId/subcategories/:name', (req, res) => {
    let group = req.group;
    if (typeof req.body.show === 'boolean') group.show = req.body.show;
    if (typeof req.body.name === 'string' && req.body.name.trim() && req.body.name !== group.name) {
        if (findSubcategory(req.section, req.body.name)) return res.status(409).json({error: 'a subcategory with that name already exists'});
        group.name = req.body.name.trim();
    }
    writeBoo(req.boo);
    res.json(group);
});

app.delete('/api/sections/:sectionId/subcategories/:name', (req, res) => {
    req.section.subcategories = req.section.subcategories.filter(g => g !== req.group);
    writeBoo(req.boo);
    res.status(204).end();
});

app.put('/api/sections/:sectionId/subcategories/order', (req, res) => {
    let groups = reorder(req.section.subcategories, req.body.order, g => g.name);
    if (!groups) return res.status(400).json({error: 'order must contain exactly the current subcategory names'});
    req.section.subcategories = groups;
    writeBoo(req.boo);
    res.json(req.section);
});

// ---- items, directly on a section or inside one of its subcategories ----
// Each handler is registered on both paths; the item list is the
// subcategory's when there is one (req.group), the section's own otherwise.
// (Registered once per path rather than with an array of paths: with an
// array, Express resolves :itemId before :name, so req.group wouldn't be set
// yet when the item is looked up.)

function itemRoute(method, suffix, handler) {
    for (let base of ['/api/sections/:sectionId/items', '/api/sections/:sectionId/subcategories/:name/items']) {
        app[method](base + suffix, handler);
    }
}

itemRoute('post', '', (req, res) => {
    let container = req.group || req.section;
    let item = {id: 'manual-' + shortId(), ...sanitizeItemInput(req.body), source: 'Manual'};
    container.items = container.items || [];
    container.items.push(item);
    writeBoo(req.boo);
    res.status(201).json(item);
});

itemRoute('patch', '/:itemId', (req, res) => {
    if (isLocked(req.item)) return res.status(403).json({error: 'this item comes from Etsy and cannot be edited here'});
    Object.assign(req.item, sanitizeItemInput({...req.item, ...req.body}));
    writeBoo(req.boo);
    res.json(req.item);
});

itemRoute('delete', '/:itemId', (req, res) => {
    if (isLocked(req.item)) return res.status(403).json({error: 'this item comes from Etsy and cannot be deleted here'});
    req.itemList.splice(req.itemList.indexOf(req.item), 1);
    writeBoo(req.boo);
    res.status(204).end();
});

// Reorders only the non-Etsy items, which go after the Etsy ones (gen.js
// always re-appends hand-added items after the freshly scraped Etsy ones, so
// that's the only order that survives a scrape).
itemRoute('put', '/order', (req, res) => {
    let container = req.group || req.section;
    let items = reorder(container.items, req.body.order, i => i.id, isLocked);
    if (!items) {
        let where = req.group ? 'in this subcategory' : 'for this section';
        return res.status(400).json({error: `order must contain exactly the non-Etsy item ids ${where}`});
    }
    container.items = items;
    writeBoo(req.boo);
    res.json(container);
});

// ---- uploading a new product image ----

const ALLOWED_IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
// longest side, in pixels, an uploaded photo is stored at
const UPLOAD_MAX_SIZE = 1200;
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        cb(null, ALLOWED_IMAGE_EXT.has(path.extname(file.originalname).toLowerCase()));
    },
    limits: {fileSize: 10 * 1024 * 1024},
});

app.post('/api/images', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({error: 'no image file received (or file type not allowed)'});
    // GIFs stay GIFs (they may be animated); everything else becomes WebP.
    let animated = path.extname(req.file.originalname).toLowerCase() === '.gif';
    let filename = `upload-${shortId()}${animated ? '.gif' : '.webp'}`;
    try {
        // Re-encoding through sharp drops EXIF/GPS/camera metadata unless
        // .withMetadata() is called, which is exactly the point here - so
        // first apply the EXIF rotation, or phone photos could end up
        // sideways. The first photo is also the product's card image on the
        // site, so cap the size rather than serve the camera original.
        let image = sharp(req.file.buffer, {animated});
        if (!animated) image = image.rotate();
        image = image.resize({width: UPLOAD_MAX_SIZE, height: UPLOAD_MAX_SIZE, fit: 'inside', withoutEnlargement: true});
        image = animated ? image.gif() : image.webp({quality: 80});
        await image.toFile(path.join(IMAGE_DIR, filename));
    } catch (err) {
        console.error('failed to process uploaded image', err);
        return res.status(400).json({error: 'uploaded file could not be processed as an image'});
    }
    res.status(201).json({path: 'img-product/' + filename});
});

app.listen(PORT, () => {
    console.log(`abc11ty admin running at http://localhost:${PORT}`);
    console.log(`Editing ${BOO_PATH} - the Publish button commits it to GitHub.`);
    if (githubConfigured()) {
        syncFromGitHub()
            .then(({taken, conflicts}) => {
                lastSync = {ok: true, error: null, conflicts};
                if (taken.length) console.log(`brought in ${taken.length} files changed on GitHub`);
                if (conflicts.length) console.log(`changed both here and on GitHub: ${conflicts.join(', ')}`);
            })
            .catch(err => {
                console.error("couldn't sync with GitHub", err);
                lastSync = {ok: false, error: err.message, conflicts: []};
            });
    }
});
