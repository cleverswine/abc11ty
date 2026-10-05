// The Etsy import: brings the "etsy-shop" section of web/content/boo.json up
// to date with the Auntie Boo Crafts Etsy shop, using Etsy's Open API v3.
// Used by the admin page's "Check Etsy for changes" button (admin/server.js)
// and by the command-line web/gen.js.
//
// It needs the app's API key from https://www.etsy.com/developers/your-apps,
// as ETSY_KEYSTRING and ETSY_SHARED_SECRET - set in the environment, or in a
// web/.env file (gitignored) like:
//
//   ETSY_KEYSTRING=1aa2bb33c44d55eeeeee6fff
//   ETSY_SHARED_SECRET=a1b2c3d4e5
//
// A refresh (refreshShop):
//   1. Asks the API for the shop, its sections (Etsy's product categories,
//      e.g. "Keychains", "Pens") and every active listing, with its photos.
//   2. For each listing in a section whose photos are new or changed (each
//      item remembers its photos' Etsy ids, `etsyImageIds`), saves a small
//      card thumbnail as img-product/<listingId>.webp and every photo,
//      full-size, as img-product/<listingId>-<n>.jpg.
//   3. Re-reads boo.json - so edits made in the admin page meanwhile aren't
//      lost - merges the listings into the "etsy-shop" section (each Etsy
//      section becomes one of its subcategories), writes it, and deletes
//      Etsy photo files nothing uses any more.
//
// Safety rules - a failed run must never wipe out good data:
//   - Every section other than "etsy-shop" is hand-made in the admin tool
//     and is passed through completely untouched.
//   - Inside "etsy-shop", hand-added items (source != "Etsy") are kept, as
//     are the subcategory order, each subcategory's `show` flag, the order of
//     the items already there, and the section's own title/description/show.
//   - If the API can't be reached or answers with an error, boo.json isn't
//     written at all. If a listing's photos can't be downloaded, it keeps its
//     previous ones (and the next refresh tries again).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Image from "@11ty/eleventy-img";
import { BOO_PATH, CONTENT_DIR, IMAGE_DIR, isEtsyItem, readBoo, writeBoo } from './boo.js';
import { envValue } from './env.js';

const WEB_DIR = fileURLToPath(new URL('..', import.meta.url));
const API_BASE = 'https://openapi.etsy.com/v3/application';

// the shop's address, shared with the site's templates...
const SHOP_URL = JSON.parse(fs.readFileSync(path.join(WEB_DIR, '_data', 'shop.json'), 'utf8')).url;
// ...and its name as the API knows it, e.g. "AuntieBooCrafts"
const SHOP_NAME = new URL(SHOP_URL).pathname.split('/').filter(Boolean).at(-1);

// The one section of boo.json this module owns. Its title, description and
// show flag are safe to edit in the admin tool, but renaming this id would
// stop the import from finding it again.
const ETSY_SECTION_ID = 'etsy-shop';
// ...and its title until someone renames it in the admin tool
const DEFAULT_ETSY_TITLE = 'Etsy Items';

// Etsy section titles to leave off the site.
const IGNORE_SECTIONS = ["On sale"];

// Etsy serves each photo at several sizes, named in its URL
// (.../il_fullxfull.4532219153_1abc.jpg): the card thumbnail uses the 340x270
// crop the shop's own listing grid shows, the gallery full-width 794px photos.
const THUMBNAIL_SIZE = 'il_340x270';
const GALLERY_SIZE = 'il_794xN';

// listings whose photos are downloaded at the same time
const LISTING_CONCURRENCY = 4;

// The API key ("keystring:shared_secret") from ETSY_KEYSTRING and
// ETSY_SHARED_SECRET (see lib/env.js), or null if either is missing.
export function etsyApiKey() {
    let keystring = envValue('ETSY_KEYSTRING');
    let secret = envValue('ETSY_SHARED_SECRET');
    return keystring && secret ? `${keystring}:${secret}` : null;
}

// ---------------------------------------------------------------------------
// The Etsy API
// ---------------------------------------------------------------------------

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// A small client for the Open API: get(path, params) returns an endpoint's
// JSON, getAll() every result of a paginated one. Being rate-limited (429) or
// a server error is retried a few times; any other failure throws, which
// ends a refresh without writing anything.
function etsyClient(apiKey) {
    async function get(apiPath, params = {}) {
        let url = new URL(API_BASE + apiPath);
        for (let [name, value] of Object.entries(params)) {
            url.searchParams.set(name, Array.isArray(value) ? value.join(',') : value);
        }
        for (let attempt = 1; ; attempt++) {
            let res = await fetch(url, {headers: {'x-api-key': apiKey}});
            if (res.ok) return res.json();
            let body = await res.text();
            if ((res.status === 429 || res.status >= 500) && attempt < 4) {
                await delay(2000 * attempt);
                continue;
            }
            throw new Error(`Etsy API error ${res.status} for ${url.pathname}: ${body.slice(0, 500)}`);
        }
    }
    async function getAll(apiPath, params = {}) {
        let results = [];
        for (let offset = 0; ; offset += 100) {
            let page = await get(apiPath, {...params, limit: 100, offset});
            results.push(...page.results);
            if (page.results.length === 0 || results.length >= page.count) return results;
        }
    }
    return {get, getAll};
}

async function getShopId(api) {
    let {results} = await api.get('/shops', {shop_name: SHOP_NAME});
    let shop = results.find(s => s.shop_name.toLowerCase() === SHOP_NAME.toLowerCase());
    if (!shop) throw new Error(`no Etsy shop named ${SHOP_NAME}`);
    return shop.shop_id;
}

// The shop's sections as [{id, name}], in the order the shop shows them.
async function getSections(api, shopId) {
    let {results} = await api.get(`/shops/${shopId}/sections`);
    return results
        .sort((a, b) => a.rank - b.rank)
        .map(section => ({id: section.shop_section_id, name: decodeEntities(section.title)}));
}

// Every active listing, with its photos, newest first.
async function getActiveListings(api, shopId) {
    let ids = (await api.getAll(`/shops/${shopId}/listings/active`)).map(listing => listing.listing_id);
    // only the batch endpoint can include the photos
    let listings = [];
    for (let i = 0; i < ids.length; i += 100) {
        let batch = await api.get('/listings/batch', {listing_ids: ids.slice(i, i + 100), includes: 'Images'});
        // (the listings endpoint is the shop's own; this just makes sure)
        listings.push(...batch.results.filter(listing => listing.shop_id === shopId));
    }
    return listings.sort((a, b) => b.original_creation_timestamp - a.original_creation_timestamp);
}

// The API returns titles HTML-escaped ("Mother&#39;s Day Gift").
function decodeEntities(text) {
    let named = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};
    return String(text ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
        if (code[0] !== '#') return named[code.toLowerCase()] ?? entity;
        return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
    });
}

// ---------------------------------------------------------------------------
// Photos and items
// ---------------------------------------------------------------------------

// A listing's photos in its own order.
function listingPhotos(listing) {
    return [...(listing.images ?? [])].sort((a, b) => a.rank - b.rank);
}

// Downloads an image into img-product/ under `filename`, resized to `width`
// (never upscaled) and re-encoded as `format`, which also strips metadata.
// Returns the path to store in boo.json, e.g. "img-product/123.webp".
async function downloadImage(url, width, format, filename) {
    await Image(url, {
        widths: [width],
        formats: [format],
        outputDir: IMAGE_DIR,
        filenameFormat: () => filename,
        // eleventy-img otherwise reuses its result for a URL it has already
        // processed this run, even if the filename asked for is different
        useCache: false,
    });
    return `img-product/${filename}`;
}

// A photo's URL at another of Etsy's sizes (THUMBNAIL_SIZE, GALLERY_SIZE).
function sized(url, size) {
    return url.replace(/\/il_[^./]+\./, `/${size}.`);
}

// Downloads a listing's photos and returns its `images`: the small card
// thumbnail first, since it's what the site's product cards show, then every
// photo full-size, in the listing's order (the first being the same picture
// as the thumbnail - the popup slideshow skips the thumbnail). A listing's
// photos all download at once (from Etsy's image CDN, and eleventy-img caps
// how many it processes at a time).
async function downloadListingImages(listing) {
    let urls = listingPhotos(listing).map(image => image.url_fullxfull);
    if (urls.length === 0) throw new Error('the listing has no photos');
    let id = listing.listing_id;
    return Promise.all([
        downloadImage(sized(urls[0], THUMBNAIL_SIZE), 340, "webp", `${id}.webp`),
        ...urls.map((url, i) => downloadImage(sized(url, GALLERY_SIZE), 794, "jpeg", `${id}-${i + 1}.jpg`)),
    ]);
}

// A boo.json item for an Etsy listing. Etsy titles are keyword lists
// ("Floral Chicken Magnet, Farmhouse Decor, ..."): the first phrase makes a
// readable title, and the whole list is the description. `etsyImageIds` are
// the Etsy ids of the photos `images` was made from, so the next refresh can
// tell whether they've changed (undefined if unknown - they're re-downloaded).
function etsyItem(id, fullTitle, images, etsyPage, etsyImageIds) {
    return {
        id,
        show: true,
        title: fullTitle.split(",")[0],
        description: fullTitle,
        images,
        etsyPage,
        source: "Etsy",
        etsyImageIds,
    };
}

// Runs `fn` on every element of `list`, `limit` at a time, keeping the
// results in order.
async function mapLimit(list, limit, fn) {
    let results = new Array(list.length);
    let next = 0;
    let worker = async () => {
        while (next < list.length) {
            let i = next++;
            results[i] = await fn(list[i]);
        }
    };
    await Promise.all(Array.from({length: Math.min(limit, list.length)}, worker));
    return results;
}

function sameIds(a, b) {
    return Array.isArray(a) && a.length === b.length && a.every((id, i) => id === b[i]);
}

// ---------------------------------------------------------------------------
// Merging into boo.json
// ---------------------------------------------------------------------------

function etsySectionOf(boo) {
    return boo.find(s => s.sectionId === ETSY_SECTION_ID);
}

// Every Etsy item in boo.json: those in subcategories, plus any --item / a
// listing refresh added to the top of the section (see refreshListing).
function etsyItemsOf(boo) {
    let section = etsySectionOf(boo);
    return [
        ...(section?.items ?? []),
        ...(section?.subcategories ?? []).flatMap(group => group.items ?? []),
    ].filter(isEtsyItem);
}

// The API has no "shop order" for listings, so items already in a
// subcategory keep their places, and new ones go at the top (newest first).
function orderLikePrevious(fresh, previousItems) {
    let position = new Map(previousItems.map((item, i) => [item.id, i]));
    let added = fresh.filter(item => !position.has(item.id));
    let known = fresh.filter(item => position.has(item.id))
        .sort((a, b) => position.get(a.id) - position.get(b.id));
    return [...added, ...known];
}

// etsy-shop's new subcategory list: `previousGroups` updated with `fetched`
// ([{name, items}], one per Etsy section), following the safety rules at the
// top.
function mergeSubcategories(previousGroups, fetched) {
    let fetchedItems = new Map(fetched.map(section => [section.name, section.items]));
    // existing subcategories keep their (admin-chosen) order; sections new
    // on Etsy go at the end
    let names = [...new Set([...previousGroups.map(g => g.name), ...fetchedItems.keys()])];

    return names
        .map(name => {
            let previous = previousGroups.find(g => g.name === name);
            // undefined = a section no longer on Etsy
            let fresh = fetchedItems.get(name) ?? [];
            let handAdded = (previous?.items ?? []).filter(item => !isEtsyItem(item));
            return {
                name,
                show: previous?.show ?? true,
                items: [...orderLikePrevious(fresh, previous?.items ?? []), ...handAdded],
            };
        })
        // drop subcategories left with no items at all (e.g. a section that
        // was removed on Etsy and had nothing hand-added)
        .filter(group => group.items.length > 0);
}

// `boo` with its etsy-shop section rebuilt from `fetched`, every other
// section left as it was (or etsy-shop added at the end the very first
// time). Items a listing refresh added to the top of the section are dropped
// once a full refresh has put them in their proper subcategories (kept until
// then, e.g. if the listing isn't in a section on Etsy).
function buildBoo(boo, fetched) {
    let previous = etsySectionOf(boo);
    let subcategories = mergeSubcategories(previous?.subcategories ?? [], fetched);
    let subcategoryIds = new Set(subcategories.flatMap(group => group.items.map(item => item.id)));
    let topItems = (previous?.items ?? []).filter(item => !subcategoryIds.has(item.id));
    if (!previous) {
        return [...boo, {sectionId: ETSY_SECTION_ID, sectionTitle: DEFAULT_ETSY_TITLE, show: true, subcategories}];
    }
    // keeps the section's other fields (title, description, show, photos...) and
    // their order in the file
    let section = {...previous, subcategories};
    if (topItems.length > 0) section.items = topItems;
    else delete section.items;
    return boo.map(s => s === previous ? section : s);
}

// Puts `item` at the top of the etsy-shop subcategory named `category`.
// Subcategories are named after Etsy's shop sections; one the shop has that
// boo.json doesn't yet goes at the end, as a full refresh would add it.
function addToCategory(etsySection, item, category, log) {
    etsySection.subcategories ??= [];
    let group = etsySection.subcategories
        .find(group => group.name.toLowerCase() === category.toLowerCase());
    if (!group) {
        group = {name: category, show: true, items: []};
        etsySection.subcategories.push(group);
        log(`  -> no "${category}" subcategory yet - creating it`);
    }
    log(`  -> adding it to the top of "${group.name}"`);
    group.items = [item, ...(group.items ?? [])];
}

// Deletes Etsy photo files (<listingId>.webp, <listingId>-<n>.jpg, and old
// .png thumbnails) that nothing in `boo` uses any more - a removed listing's,
// or the extras of one that now has fewer photos. Hand uploads (upload-*)
// are never touched. Returns how many were deleted.
function deleteUnusedEtsyPhotos(boo) {
    let used = new Set(boo.flatMap(section => [
        ...(section.items ?? []),
        ...(section.subcategories ?? []).flatMap(group => group.items ?? []),
    ]).flatMap(item => item.images ?? []).map(p => path.basename(p)));
    let deleted = 0;
    for (let file of fs.readdirSync(IMAGE_DIR)) {
        if (/^\d+(-\d+)?\.(webp|jpe?g|png)$/.test(file) && !used.has(file)) {
            fs.unlinkSync(path.join(IMAGE_DIR, file));
            deleted++;
        }
    }
    return deleted;
}

// ---------------------------------------------------------------------------
// Refreshing
// ---------------------------------------------------------------------------

// Brings the etsy-shop section up to date with the shop - new listings added
// at the top of their category, gone ones removed, changed titles and photos
// updated - downloading only photos that are new or changed. Calls
// onProgress({done, total}) as listings are processed and log(line) with a
// running commentary. Throws, writing nothing, if the API fails.
//
// Returns a summary: {added, removed, photosUpdated, photosFailed: [title],
// renamed: [{from, to}], deletedFiles: count}.
export async function refreshShop({apiKey, onProgress = () => {}, log = console.log} = {}) {
    let api = etsyClient(apiKey);
    let shopId = await getShopId(api);
    let sections = await getSections(api, shopId);
    let listings = await getActiveListings(api, shopId);
    log(`${SHOP_NAME}: ${sections.length} sections, ${listings.length} active listings`);

    let unsectioned = listings.filter(listing => !listing.shop_section_id).length;
    if (unsectioned) log(`(${unsectioned} listings aren't in any section - they're left off the site)`);

    // what's there now, to tell which photos need downloading
    let previousById = new Map(etsyItemsOf(readBoo(BOO_PATH)).map(item => [item.id, item]));
    let wanted = sections.filter(section => {
        if (IGNORE_SECTIONS.includes(section.name)) log(`ignoring section ${section.name}`);
        return !IGNORE_SECTIONS.includes(section.name);
    });
    let toProcess = wanted.flatMap(section =>
        listings.filter(listing => listing.shop_section_id === section.id).map(listing => ({section, listing})));

    let photoResults = new Map();   // listing id -> 'updated' | 'failed'
    let done = 0;
    onProgress({done, total: toProcess.length});
    let items = await mapLimit(toProcess, LISTING_CONCURRENCY, async ({listing}) => {
        let id = String(listing.listing_id);
        let title = decodeEntities(listing.title);
        let imageIds = listingPhotos(listing).map(image => image.listing_image_id);
        let previous = previousById.get(id);
        let images = previous?.images;
        let keptIds = previous?.etsyImageIds;
        let upToDate = previous && sameIds(previous.etsyImageIds, imageIds)
            && previous.images.every(p => fs.existsSync(path.join(CONTENT_DIR, p)));
        if (!upToDate) {
            try {
                images = await downloadListingImages(listing);
                keptIds = imageIds;
                photoResults.set(id, 'updated');
                log(`  ${title.split(",")[0]}: downloaded ${images.length - 1} photos`);
            } catch (e) {
                photoResults.set(id, 'failed');
                log(`  ${title.split(",")[0]}: couldn't download its photos (${e.message}) - ${images ? 'keeping the previous ones' : 'skipping it'}`);
            }
        }
        onProgress({done: ++done, total: toProcess.length});
        return images ? etsyItem(id, title, images, listing.url.split("?")[0], keptIds) : null;
    });
    let fetched = wanted.map(section => ({
        name: section.name,
        items: items.filter((item, i) => item && toProcess[i].section === section),
    }));

    // Re-read boo.json and merge into that, with no awaits in between, so
    // admin-page edits made while the photos downloaded aren't overwritten.
    let boo = readBoo(BOO_PATH);
    let before = new Map(etsyItemsOf(boo).map(item => [item.id, item]));
    let updated = buildBoo(boo, fetched);
    writeBoo(BOO_PATH, updated);
    let deletedFiles = deleteUnusedEtsyPhotos(updated);

    let after = etsyItemsOf(updated);
    let afterIds = new Set(after.map(item => item.id));
    let summary = {
        added: after.filter(item => !before.has(item.id)).map(item => item.title),
        removed: [...before.values()].filter(item => !afterIds.has(item.id)).map(item => item.title),
        renamed: after.filter(item => before.has(item.id) && before.get(item.id).title !== item.title)
            .map(item => ({from: before.get(item.id).title, to: item.title})),
        photosUpdated: after.filter(item => before.has(item.id) && photoResults.get(item.id) === 'updated').map(item => item.title),
        photosFailed: [...photoResults].filter(([, result]) => result === 'failed')
            .map(([id]) => after.find(item => item.id === id)?.title ?? id),
        deletedFiles,
    };
    log(summaryLines(summary).join('\n'));
    return summary;
}

// Refreshes one listing - re-downloading its photos even if they look
// unchanged - from a listing URL (or id). A listing not in boo.json yet goes
// to the top of the subcategory named after its Etsy section (created if
// need be), or, if it's in no section, to the top of the etsy-shop
// section's own `items`, above its subcategories, until the next full
// refresh files it properly. An existing item only gets new photos; its
// title, show flag and place are left alone.
//
// Returns {ok: true, added, title} - or {ok: false, message}, changing
// nothing, if it isn't a listing URL or the listing isn't in this shop.
// Throws, writing nothing, if the API fails.
export async function refreshListing({apiKey, url, log = console.log}) {
    let id = /^\d+$/.test(url) ? url : String(url).match(/\/listing\/(\d+)/)?.[1];
    if (!id) {
        return {ok: false, message: `not an Etsy listing URL (expected .../listing/<number>/...): ${url}`};
    }
    let api = etsyClient(apiKey);
    let shopId = await getShopId(api);
    let listing = await api.get(`/listings/${id}`, {includes: 'Images'});
    if (listing.shop_id !== shopId) {
        return {ok: false, message: `listing ${id} isn't in the ${SHOP_NAME} shop`};
    }
    let section = listing.shop_section_id
        && (await getSections(api, shopId)).find(s => s.id === listing.shop_section_id);
    let category = section && !IGNORE_SECTIONS.includes(section.name) ? section.name : null;
    log(`listing ${id}: category ${category ?? '(none)'}`);
    let images = await downloadListingImages(listing);
    let imageIds = listingPhotos(listing).map(image => image.listing_image_id);

    // re-read and change boo.json with no awaits in between (see refreshShop)
    let boo = readBoo(BOO_PATH);
    let etsySection = etsySectionOf(boo);
    let item = etsyItemsOf(boo).find(item => item.id === id);
    let title = item?.title;
    if (item) {
        log(`  -> new photos for "${item.title}"`);
        item.images = images;
        item.etsyImageIds = imageIds;
        // an item left at the top of the section (no category then) moves
        // into its category if there is one now
        let topItems = etsySection?.items ?? [];
        if (category && topItems.includes(item)) {
            etsySection.items = topItems.filter(other => other !== item);
            if (etsySection.items.length === 0) delete etsySection.items;
            addToCategory(etsySection, item, category, log);
        }
    } else {
        if (!etsySection) {
            etsySection = {sectionId: ETSY_SECTION_ID, sectionTitle: DEFAULT_ETSY_TITLE, show: true, subcategories: []};
            boo.push(etsySection);
        }
        let newItem = etsyItem(id, decodeEntities(listing.title), images, listing.url.split("?")[0], imageIds);
        title = newItem.title;
        if (category) {
            addToCategory(etsySection, newItem, category, log);
        } else {
            log(`  -> adding it to the top of the ${etsySection.sectionTitle} section`);
            etsySection.items = [newItem, ...(etsySection.items ?? [])];
        }
    }
    writeBoo(BOO_PATH, boo);
    deleteUnusedEtsyPhotos(boo);
    return {ok: true, added: !item, title};
}

// Rebuilds the etsy-shop section from the Etsy items already in boo.json,
// without contacting Etsy - re-sorting and normalizing it (a dry run of the
// merge).
export function rebuildEtsySection() {
    let boo = readBoo(BOO_PATH);
    let fetched = (etsySectionOf(boo)?.subcategories ?? []).map(group => ({
        name: group.name,
        items: (group.items ?? []).filter(isEtsyItem),
    }));
    writeBoo(BOO_PATH, buildBoo(boo, fetched));
}

// A refresh summary as lines of text, e.g. for the command line.
export function summaryLines(summary) {
    let lines = [];
    let list = (label, titles) => {
        if (titles.length) lines.push(`${label} (${titles.length}):`, ...titles.map(t => `  ${t}`));
    };
    list('New listings', summary.added);
    list('Removed (no longer on Etsy)', summary.removed);
    list('Renamed on Etsy', summary.renamed.map(r => `${r.from} -> ${r.to}`));
    list('New photos', summary.photosUpdated);
    list("Couldn't download photos (kept the old ones; tried again next time)", summary.photosFailed);
    if (lines.length === 0) lines.push('Everything is already up to date.');
    if (summary.deletedFiles) lines.push(`Deleted ${summary.deletedFiles} photo files no longer used.`);
    return lines;
}
