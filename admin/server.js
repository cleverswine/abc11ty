import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', 'web');
const booPath = path.join(rootDir, '_data', 'boo.json');
const booOldPath = path.join(rootDir, '_data', 'boo-old.json');
const imgProductDir = path.join(rootDir, 'img-product');

const app = express();
const PORT = process.env.PORT || 4321;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/img-product', express.static(imgProductDir));
app.use('/assets/css', express.static(path.join(rootDir, 'css')));

function readBoo() {
    return JSON.parse(fs.readFileSync(booPath, 'utf8'));
}

function writeBoo(boo) {
    fs.copyFileSync(booPath, booOldPath);
    let tmpPath = booPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(boo, null, 2) + '\n');
    fs.renameSync(tmpPath, booPath);
}

function findSection(boo, sectionId) {
    return boo.find(s => s.sectionId === sectionId);
}

function findSubcategory(section, name) {
    return (section.subcategories || []).find(g => g.name === name);
}

function findItem(section, itemId) {
    let item = (section.items || []).find(i => i.id === itemId);
    if (item) {
        return {item, list: section.items};
    }
    for (let group of section.subcategories || []) {
        item = (group.items || []).find(i => i.id === itemId);
        if (item) {
            return {item, list: group.items};
        }
    }
    return {item: null, list: null};
}

// An item sourced from Etsy is read-only and excluded from reordering here -
// gen.js re-scrapes and re-appends it on every run, so edits made here would
// just be clobbered. Anything else (source: "Manual", or unset) is ours.
function isLocked(item) {
    return item.source === 'Etsy';
}

function newItemId() {
    return 'manual-' + randomUUID().split('-')[0];
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

function newEventId() {
    return 'event-' + randomUUID().split('-')[0];
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

// ---- sections (all freely editable - only individual Etsy-sourced items are locked) ----

app.get('/api/boo', (req, res) => {
    res.json(readBoo());
});

app.get('/api/sections/:sectionId', (req, res) => {
    let boo = readBoo();
    let section = findSection(boo, req.params.sectionId);
    if (!section) return res.status(404).json({error: 'section not found'});
    res.json(section);
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
    let boo = readBoo();
    let section = findSection(boo, req.params.sectionId);
    if (!section) return res.status(404).json({error: 'section not found'});

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
        if (findSection(boo, newId)) return res.status(409).json({error: 'sectionId already exists'});
        section.sectionId = newId;
    }

    writeBoo(boo);
    res.json(section);
});

app.delete('/api/sections/:sectionId', (req, res) => {
    let boo = readBoo();
    let section = findSection(boo, req.params.sectionId);
    if (!section) return res.status(404).json({error: 'section not found'});
    boo = boo.filter(s => s.sectionId !== req.params.sectionId);
    writeBoo(boo);
    res.status(204).end();
});

// ---- events on a section (e.g. live-events' in-person event list) ----

app.post('/api/sections/:sectionId/events', (req, res) => {
    let boo = readBoo();
    let section = findSection(boo, req.params.sectionId);
    if (!section) return res.status(404).json({error: 'section not found'});
    let event = {id: newEventId(), ...sanitizeEventInput(req.body)};
    section.events = section.events || [];
    section.events.push(event);
    writeBoo(boo);
    res.status(201).json(event);
});

app.patch('/api/sections/:sectionId/events/:eventId', (req, res) => {
    let boo = readBoo();
    let section = findSection(boo, req.params.sectionId);
    if (!section) return res.status(404).json({error: 'section not found'});
    let event = (section.events || []).find(e => e.id === req.params.eventId);
    if (!event) return res.status(404).json({error: 'event not found'});
    Object.assign(event, sanitizeEventInput({...event, ...req.body}));
    writeBoo(boo);
    res.json(event);
});

app.delete('/api/sections/:sectionId/events/:eventId', (req, res) => {
    let boo = readBoo();
    let section = findSection(boo, req.params.sectionId);
    if (!section) return res.status(404).json({error: 'section not found'});
    let events = section.events || [];
    let idx = events.findIndex(e => e.id === req.params.eventId);
    if (idx === -1) return res.status(404).json({error: 'event not found'});
    events.splice(idx, 1);
    writeBoo(boo);
    res.status(204).end();
});

app.put('/api/sections/:sectionId/events/order', (req, res) => {
    let boo = readBoo();
    let section = findSection(boo, req.params.sectionId);
    if (!section) return res.status(404).json({error: 'section not found'});
    let order = Array.isArray(req.body.order) ? req.body.order : [];
    let events = section.events || [];
    let ids = new Set(events.map(e => e.id));
    if (order.length !== events.length || !order.every(id => ids.has(id))) {
        return res.status(400).json({error: 'order must contain exactly the current event ids'});
    }
    let byId = new Map(events.map(e => [e.id, e]));
    section.events = order.map(id => byId.get(id));
    writeBoo(boo);
    res.json(section);
});

// ---- items directly on a section ----

app.post('/api/sections/:sectionId/items', (req, res) => {
    let boo = readBoo();
    let section = findSection(boo, req.params.sectionId);
    if (!section) return res.status(404).json({error: 'section not found'});
    let item = {id: newItemId(), ...sanitizeItemInput(req.body), source: 'Manual'};
    section.items = section.items || [];
    section.items.push(item);
    writeBoo(boo);
    res.status(201).json(item);
});

app.patch('/api/sections/:sectionId/items/:itemId', (req, res) => {
    let boo = readBoo();
    let section = findSection(boo, req.params.sectionId);
    if (!section) return res.status(404).json({error: 'section not found'});
    let {item} = findItem(section, req.params.itemId);
    if (!item) return res.status(404).json({error: 'item not found'});
    if (isLocked(item)) return res.status(403).json({error: 'this item comes from Etsy and cannot be edited here'});
    Object.assign(item, sanitizeItemInput({...item, ...req.body}));
    writeBoo(boo);
    res.json(item);
});

app.delete('/api/sections/:sectionId/items/:itemId', (req, res) => {
    let boo = readBoo();
    let section = findSection(boo, req.params.sectionId);
    if (!section) return res.status(404).json({error: 'section not found'});
    let {item, list} = findItem(section, req.params.itemId);
    if (!item) return res.status(404).json({error: 'item not found'});
    if (isLocked(item)) return res.status(403).json({error: 'this item comes from Etsy and cannot be deleted here'});
    let idx = list.indexOf(item);
    list.splice(idx, 1);
    writeBoo(boo);
    res.status(204).end();
});

// Reorders only the non-Etsy items in section.items, leaving any Etsy items
// exactly where they were (gen.js always re-appends them after the
// freshly-scraped Etsy ones, so that's the only order that survives a scrape).
app.put('/api/sections/:sectionId/items/order', (req, res) => {
    let boo = readBoo();
    let section = findSection(boo, req.params.sectionId);
    if (!section) return res.status(404).json({error: 'section not found'});
    let order = Array.isArray(req.body.order) ? req.body.order : [];
    let items = section.items || [];
    let lockedItems = items.filter(isLocked);
    let freeItems = items.filter(i => !isLocked(i));
    let freeIds = new Set(freeItems.map(i => i.id));
    if (order.length !== freeItems.length || !order.every(id => freeIds.has(id))) {
        return res.status(400).json({error: 'order must contain exactly the non-Etsy item ids for this section'});
    }
    let byId = new Map(freeItems.map(i => [i.id, i]));
    section.items = [...lockedItems, ...order.map(id => byId.get(id))];
    writeBoo(boo);
    res.json(section);
});

// ---- subcategories (any section - structure here is always editable) ----

app.post('/api/sections/:sectionId/subcategories', (req, res) => {
    let boo = readBoo();
    let section = findSection(boo, req.params.sectionId);
    if (!section) return res.status(404).json({error: 'section not found'});
    let name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({error: 'name is required'});
    section.subcategories = section.subcategories || [];
    if (findSubcategory(section, name)) return res.status(409).json({error: 'a subcategory with that name already exists'});
    let group = {name, show: req.body.show !== false, items: []};
    section.subcategories.push(group);
    writeBoo(boo);
    res.status(201).json(group);
});

app.patch('/api/sections/:sectionId/subcategories/:name', (req, res) => {
    let boo = readBoo();
    let section = findSection(boo, req.params.sectionId);
    if (!section) return res.status(404).json({error: 'section not found'});
    let group = findSubcategory(section, req.params.name);
    if (!group) return res.status(404).json({error: 'subcategory not found'});
    if (typeof req.body.show === 'boolean') group.show = req.body.show;
    if (typeof req.body.name === 'string' && req.body.name.trim() && req.body.name !== group.name) {
        if (findSubcategory(section, req.body.name)) return res.status(409).json({error: 'a subcategory with that name already exists'});
        group.name = req.body.name.trim();
    }
    writeBoo(boo);
    res.json(group);
});

app.delete('/api/sections/:sectionId/subcategories/:name', (req, res) => {
    let boo = readBoo();
    let section = findSection(boo, req.params.sectionId);
    if (!section) return res.status(404).json({error: 'section not found'});
    if (!findSubcategory(section, req.params.name)) return res.status(404).json({error: 'subcategory not found'});
    section.subcategories = section.subcategories.filter(g => g.name !== req.params.name);
    writeBoo(boo);
    res.status(204).end();
});

app.put('/api/sections/:sectionId/subcategories/order', (req, res) => {
    let boo = readBoo();
    let section = findSection(boo, req.params.sectionId);
    if (!section) return res.status(404).json({error: 'section not found'});
    let order = Array.isArray(req.body.order) ? req.body.order : [];
    let groups = section.subcategories || [];
    let names = new Set(groups.map(g => g.name));
    if (order.length !== groups.length || !order.every(n => names.has(n))) {
        return res.status(400).json({error: 'order must contain exactly the current subcategory names'});
    }
    let byName = new Map(groups.map(g => [g.name, g]));
    section.subcategories = order.map(n => byName.get(n));
    writeBoo(boo);
    res.json(section);
});

// ---- items inside a subcategory group ----

app.post('/api/sections/:sectionId/subcategories/:name/items', (req, res) => {
    let boo = readBoo();
    let section = findSection(boo, req.params.sectionId);
    if (!section) return res.status(404).json({error: 'section not found'});
    let group = findSubcategory(section, req.params.name);
    if (!group) return res.status(404).json({error: 'subcategory not found'});
    let item = {id: newItemId(), ...sanitizeItemInput(req.body), source: 'Manual'};
    group.items = group.items || [];
    group.items.push(item);
    writeBoo(boo);
    res.status(201).json(item);
});

app.patch('/api/sections/:sectionId/subcategories/:name/items/:itemId', (req, res) => {
    let boo = readBoo();
    let section = findSection(boo, req.params.sectionId);
    if (!section) return res.status(404).json({error: 'section not found'});
    let group = findSubcategory(section, req.params.name);
    if (!group) return res.status(404).json({error: 'subcategory not found'});
    let item = (group.items || []).find(i => i.id === req.params.itemId);
    if (!item) return res.status(404).json({error: 'item not found'});
    if (isLocked(item)) return res.status(403).json({error: 'this item comes from Etsy and cannot be edited here'});
    Object.assign(item, sanitizeItemInput({...item, ...req.body}));
    writeBoo(boo);
    res.json(item);
});

app.delete('/api/sections/:sectionId/subcategories/:name/items/:itemId', (req, res) => {
    let boo = readBoo();
    let section = findSection(boo, req.params.sectionId);
    if (!section) return res.status(404).json({error: 'section not found'});
    let group = findSubcategory(section, req.params.name);
    if (!group) return res.status(404).json({error: 'subcategory not found'});
    let item = (group.items || []).find(i => i.id === req.params.itemId);
    if (!item) return res.status(404).json({error: 'item not found'});
    if (isLocked(item)) return res.status(403).json({error: 'this item comes from Etsy and cannot be deleted here'});
    let idx = group.items.indexOf(item);
    group.items.splice(idx, 1);
    writeBoo(boo);
    res.status(204).end();
});

// Reorders only the non-Etsy items within the group, same idea as the
// section-level flat-item reorder above.
app.put('/api/sections/:sectionId/subcategories/:name/items/order', (req, res) => {
    let boo = readBoo();
    let section = findSection(boo, req.params.sectionId);
    if (!section) return res.status(404).json({error: 'section not found'});
    let group = findSubcategory(section, req.params.name);
    if (!group) return res.status(404).json({error: 'subcategory not found'});
    let order = Array.isArray(req.body.order) ? req.body.order : [];
    let items = group.items || [];
    let lockedItems = items.filter(isLocked);
    let freeItems = items.filter(i => !isLocked(i));
    let freeIds = new Set(freeItems.map(i => i.id));
    if (order.length !== freeItems.length || !order.every(id => freeIds.has(id))) {
        return res.status(400).json({error: 'order must contain exactly the non-Etsy item ids in this subcategory'});
    }
    let byId = new Map(freeItems.map(i => [i.id, i]));
    group.items = [...lockedItems, ...order.map(id => byId.get(id))];
    writeBoo(boo);
    res.json(group);
});

// ---- uploading a new product image ----

const ALLOWED_IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        cb(null, ALLOWED_IMAGE_EXT.has(path.extname(file.originalname).toLowerCase()));
    },
    limits: {fileSize: 10 * 1024 * 1024},
});

app.post('/api/images', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({error: 'no image file received (or file type not allowed)'});
    let ext = path.extname(req.file.originalname).toLowerCase();
    let filename = `upload-${randomUUID().split('-')[0]}${ext}`;
    try {
        // Re-encoding through sharp drops EXIF/GPS/camera metadata unless
        // .withMetadata() is called, which is exactly the point here.
        let image = sharp(req.file.buffer, {animated: ext === '.gif'});
        await image.toFile(path.join(imgProductDir, filename));
    } catch (err) {
        console.error('failed to process uploaded image', err);
        return res.status(400).json({error: 'uploaded file could not be processed as an image'});
    }
    res.status(201).json({path: 'img-product/' + filename});
});

app.listen(PORT, () => {
    console.log(`abc11ty admin running at http://localhost:${PORT}`);
    console.log('Editing _data/boo.json directly - remember to git add/commit/push to publish changes.');
});
