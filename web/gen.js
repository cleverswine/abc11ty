// gen.js - copies the Auntie Boo Crafts Etsy shop into _data/boo.json, using
// Etsy's Open API v3.
//
// Run by hand from web/ (it's not part of the eleventy build):
//
//   node gen.js               refresh everything from Etsy
//   node gen.js --skip-fetch  don't contact Etsy; just re-merge/normalize boo.json
//   node gen.js --item <url>  refresh just one listing (e.g. after changing its
//                             photos on Etsy), adding it to the top of its
//                             category if it's new
//
// It needs the app's API key from https://www.etsy.com/developers/your-apps,
// as ETSY_KEYSTRING and ETSY_SHARED_SECRET - set in the environment, or in a
// web/.env file (gitignored) like:
//
//   ETSY_KEYSTRING=1aa2bb33c44d55eeeeee6fff
//   ETSY_SHARED_SECRET=a1b2c3d4e5
//
// What it does:
//   1. Asks the API for the shop, its sections (Etsy's product categories,
//      e.g. "Keychains", "Pens") and every active listing, with its photos.
//   2. For each listing in a section, saves a small card thumbnail as
//      img-product/<listingId>.webp and every photo, full-size, as
//      img-product/<listingId>-<n>.jpg.
//   3. Merges all of that into the "etsy-shop" section of boo.json (each
//      Etsy section becomes one of its subcategories) and writes the file.
//
// Safety rules - a failed run must never wipe out good data:
//   - Every section other than "etsy-shop" is hand-made in the admin tool
//     and is passed through completely untouched.
//   - Inside "etsy-shop", hand-added items (source != "Etsy") are kept, as
//     are the subcategory order, each subcategory's `show` flag, the order of
//     the items already there, and the section's own title/description/show.
//   - If the API can't be reached or answers with an error, boo.json isn't
//     written at all. If a listing's photos can't be downloaded, it keeps its
//     previous ones.

import * as fs from 'node:fs';
import Image from "@11ty/eleventy-img";
import { isEtsyItem, readBoo, writeBoo } from './lib/boo.js';

// the shop's address, shared with the site's templates
const SHOP_URL = JSON.parse(fs.readFileSync('_data/shop.json', 'utf8')).url;
// ...and its name as the API knows it, e.g. "AuntieBooCrafts"
const SHOP_NAME = new URL(SHOP_URL).pathname.split('/').filter(Boolean).at(-1);
const BOO_PATH = '_data/boo.json';
const IMAGE_DIR = './img-product/';
const API_BASE = 'https://openapi.etsy.com/v3/application';

// The one section of boo.json that gen.js owns. Its title, description and
// show flag are safe to edit in the admin tool, but renaming this id would
// stop gen.js from finding it again.
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

const skipFetch = process.argv.includes('--skip-fetch');

// --item <listing URL>: refresh just that one item (see refreshItem)
const itemFlag = process.argv.indexOf('--item');
const itemUrl = itemFlag === -1 ? null : process.argv[itemFlag + 1];
if (itemFlag !== -1 && (!itemUrl || itemUrl.startsWith('--'))) {
    console.log('--item needs a listing URL, e.g. node gen.js --item https://www.etsy.com/listing/1234567890/...');
    process.exit(1);
}
if (itemUrl && skipFetch) {
    console.log("--item and --skip-fetch can't be used together");
    process.exit(1);
}

if (fs.existsSync('.env')) process.loadEnvFile('.env');
const API_KEY = `${process.env.ETSY_KEYSTRING ?? ''}:${process.env.ETSY_SHARED_SECRET ?? ''}`;
if (!skipFetch && !(process.env.ETSY_KEYSTRING && process.env.ETSY_SHARED_SECRET)) {
    console.log('Set ETSY_KEYSTRING and ETSY_SHARED_SECRET (see the top of gen.js) - or use --skip-fetch.');
    process.exit(1);
}

// The current boo.json - the starting point everything is merged into.
const previousBoo = fs.existsSync(BOO_PATH) ? readBoo(BOO_PATH) : [];
const previousEtsySection = previousBoo.find(s => s.sectionId === ETSY_SECTION_ID);
const previousGroups = previousEtsySection?.subcategories ?? [];

// Every Etsy item already in boo.json: those in subcategories, plus any
// added by --item to the top of the section (see refreshItem).
const previousEtsyItems = [
    ...(previousEtsySection?.items ?? []),
    ...previousGroups.flatMap(group => group.items ?? []),
].filter(isEtsyItem);

// Each Etsy item's images from the last run, by listing id - the fallback
// when a listing's photos can't be downloaded this time.
const previousImagesById = new Map(
    previousEtsyItems
        .map(item => [item.id, item.images ?? []])
);

// ---------------------------------------------------------------------------
// The Etsy API
// ---------------------------------------------------------------------------

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// GETs an Open API path (e.g. '/shops', {shop_name: 'X'}) and returns its
// JSON. Being rate-limited (429) or a server error is retried a few times;
// any other failure throws, which ends the run without writing anything.
async function etsyApi(path, params = {}) {
    let url = new URL(API_BASE + path);
    for (let [name, value] of Object.entries(params)) {
        url.searchParams.set(name, Array.isArray(value) ? value.join(',') : value);
    }
    for (let attempt = 1; ; attempt++) {
        let res = await fetch(url, {headers: {'x-api-key': API_KEY}});
        if (res.ok) return res.json();
        let body = await res.text();
        if ((res.status === 429 || res.status >= 500) && attempt < 4) {
            await delay(2000 * attempt);
            continue;
        }
        throw new Error(`Etsy API error ${res.status} for ${url.pathname}: ${body.slice(0, 500)}`);
    }
}

// Every result of a paginated endpoint.
async function etsyApiAll(path, params = {}) {
    let results = [];
    for (let offset = 0; ; offset += 100) {
        let page = await etsyApi(path, {...params, limit: 100, offset});
        results.push(...page.results);
        if (page.results.length === 0 || results.length >= page.count) return results;
    }
}

async function getShopId() {
    let {results} = await etsyApi('/shops', {shop_name: SHOP_NAME});
    let shop = results.find(s => s.shop_name.toLowerCase() === SHOP_NAME.toLowerCase());
    if (!shop) throw new Error(`no Etsy shop named ${SHOP_NAME}`);
    return shop.shop_id;
}

// The shop's sections as [{id, name}], in the order the shop shows them.
async function getSections(shopId) {
    let {results} = await etsyApi(`/shops/${shopId}/sections`);
    return results
        .sort((a, b) => a.rank - b.rank)
        .map(section => ({id: section.shop_section_id, name: decodeEntities(section.title)}));
}

// Every active listing, with its photos, newest first.
async function getActiveListings(shopId) {
    let ids = (await etsyApiAll(`/shops/${shopId}/listings/active`)).map(listing => listing.listing_id);
    // only the batch endpoint can include the photos
    let listings = [];
    for (let i = 0; i < ids.length; i += 100) {
        let batch = await etsyApi('/listings/batch', {listing_ids: ids.slice(i, i + 100), includes: 'Images'});
        listings.push(...batch.results);
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

// Downloads an image into img-product/ under `filename`, resized to `width`
// (never upscaled) and re-encoded as `format`, which also strips metadata.
// Returns the path to store in boo.json, e.g. "img-product/123.webp".
async function downloadImage(url, width, format, filename) {
    let stats = await Image(url, {
        widths: [width],
        formats: [format],
        outputDir: IMAGE_DIR,
        filenameFormat: () => filename,
        // eleventy-img otherwise reuses its result for a URL it has already
        // processed this run, even if the filename asked for is different
        useCache: false,
    });
    return stats[format][0].outputPath;
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
    let urls = (listing.images ?? [])
        .sort((a, b) => a.rank - b.rank)
        .map(image => image.url_fullxfull);
    if (urls.length === 0) throw new Error('the listing has no photos');
    let id = listing.listing_id;
    let [thumbnail, ...gallery] = await Promise.all([
        downloadImage(sized(urls[0], THUMBNAIL_SIZE), 340, "webp", `${id}.webp`),
        ...urls.map((url, i) => downloadImage(sized(url, GALLERY_SIZE), 794, "jpeg", `${id}-${i + 1}.jpg`)),
    ]);
    return [thumbnail, ...gallery];
}

// A boo.json item for an Etsy listing. Etsy titles are keyword lists
// ("Floral Chicken Magnet, Farmhouse Decor, ..."): the first phrase makes a
// readable title, and the whole list is the description.
function etsyItem(id, fullTitle, images, etsyPage) {
    return {
        id,
        show: true,
        title: fullTitle.split(",")[0],
        description: fullTitle,
        images,
        etsyPage,
        source: "Etsy",
    };
}

// The boo.json item for a listing from the API, downloading its photos - or
// keeping last run's if that fails. Null if it has no photos at all.
async function listingToItem(listing) {
    let id = String(listing.listing_id);
    let title = decodeEntities(listing.title);
    let images;
    try {
        images = await downloadListingImages(listing);
        console.log(`  ${title.split(",")[0]}: ${images.length - 1} photos`);
    } catch (e) {
        images = previousImagesById.get(id);
        console.log(`  ${title.split(",")[0]}: couldn't download its photos (${e.message}) - ${images ? 'keeping the previous ones' : 'skipping it'}`);
        if (!images) return null;
    }
    return etsyItem(id, title, images, listing.url.split("?")[0]);
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

// Returns [{name, items}], one per Etsy section, in the shop's order.
async function fetchShop() {
    let shopId = await getShopId();
    let sections = await getSections(shopId);
    let listings = await getActiveListings(shopId);
    console.log(`${SHOP_NAME}: ${sections.length} sections, ${listings.length} active listings`);

    let unsectioned = listings.filter(listing => !listing.shop_section_id).length;
    if (unsectioned) console.log(`(${unsectioned} listings aren't in any section - they're left off the site)`);

    let result = [];
    for (let section of sections) {
        if (IGNORE_SECTIONS.includes(section.name)) {
            console.log(`ignoring section ${section.name}`);
            continue;
        }
        let inSection = listings.filter(listing => listing.shop_section_id === section.id);
        console.log(`${section.name} (${inSection.length})`);
        let items = await mapLimit(inSection, LISTING_CONCURRENCY, listingToItem);
        result.push({name: section.name, items: items.filter(Boolean)});
    }
    return result;
}

// ---------------------------------------------------------------------------
// Merging into boo.json
// ---------------------------------------------------------------------------

// The API has no "shop order" for listings, so items already in a
// subcategory keep their places, and new ones go at the top (newest first).
function orderLikePrevious(fresh, previousItems) {
    let position = new Map(previousItems.map((item, i) => [item.id, i]));
    let added = fresh.filter(item => !position.has(item.id));
    let known = fresh.filter(item => position.has(item.id))
        .sort((a, b) => position.get(a.id) - position.get(b.id));
    return [...added, ...known];
}

// Builds etsy-shop's new subcategory list from fetchShop's results,
// following the safety rules at the top.
function mergeSubcategories(fetched) {
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

// Returns the full new boo.json contents for a full run: the rebuilt
// etsy-shop section swapped in place of the old one, every other section
// left as it was (or etsy-shop added at the end on the very first run).
// Items that --item added to the top of the section are dropped once a full
// run has put them in their proper subcategories (kept until then, e.g. if
// the listing isn't in a section on Etsy).
function buildBoo(fetched) {
    let subcategories = mergeSubcategories(fetched);
    let subcategoryIds = new Set(subcategories.flatMap(group => group.items.map(item => item.id)));
    let topItems = (previousEtsySection?.items ?? []).filter(item => !subcategoryIds.has(item.id));
    let etsySection = {
        sectionId: ETSY_SECTION_ID,
        sectionTitle: previousEtsySection?.sectionTitle || DEFAULT_ETSY_TITLE,
        show: previousEtsySection?.show ?? true,
        ...(topItems.length > 0 && {items: topItems}),
        subcategories,
    };
    if (previousEtsySection?.sectionDescription) {
        etsySection.sectionDescription = previousEtsySection.sectionDescription;
    }
    return previousEtsySection
        ? previousBoo.map(section => section.sectionId === ETSY_SECTION_ID ? etsySection : section)
        : [...previousBoo, etsySection];
}

// --item: refreshes one Etsy item's photos (and adds the listing if it's not
// in boo.json yet), updating the previousBoo object that gets written back
// out. Everything else about an existing item - title, show flag, which
// subcategory it's in - is left alone. Returns false, changing nothing, if
// the URL isn't a listing URL or the listing isn't in this shop.
//
// A listing that isn't in boo.json yet goes to the top of the subcategory
// named after its Etsy section (created if need be). If it isn't in a
// section, it goes to the top of the etsy-shop section's own `items`, above
// its subcategories, and the next full run drops it from there once it has
// filed it under its proper subcategory.
async function refreshItem(url) {
    let id = url.match(/\/listing\/(\d+)/)?.[1];
    if (!id) {
        console.log(`not an Etsy listing URL (expected .../listing/<number>/...): ${url}`);
        return false;
    }
    let item = previousEtsyItems.find(item => item.id === id);
    console.log(item
        ? `refreshing images for "${item.title}" (${id})`
        : `listing ${id} isn't in ${BOO_PATH} yet - adding it`);

    let shopId = await getShopId();
    let listing = await etsyApi(`/listings/${id}`, {includes: 'Images'});
    if (listing.shop_id !== shopId) {
        console.log(`  -> listing ${id} isn't in the ${SHOP_NAME} shop`);
        return false;
    }
    let section = listing.shop_section_id
        && (await getSections(shopId)).find(s => s.id === listing.shop_section_id);
    let category = section && !IGNORE_SECTIONS.includes(section.name) ? section.name : null;
    console.log(`  -> category: ${category ?? '(none)'}`);
    let images = await downloadListingImages(listing);

    if (item) {
        item.images = images;
        // an item an earlier run left at the top of the section (no
        // category then) moves into its category if there is one now
        let topItems = previousEtsySection?.items ?? [];
        if (!category || !topItems.includes(item)) return true;
        previousEtsySection.items = topItems.filter(other => other !== item);
        if (previousEtsySection.items.length === 0) delete previousEtsySection.items;
        addToCategory(previousEtsySection, item, category);
        return true;
    }
    let etsySection = previousEtsySection;
    if (!etsySection) {
        etsySection = {sectionId: ETSY_SECTION_ID, sectionTitle: DEFAULT_ETSY_TITLE, show: true, subcategories: []};
        previousBoo.push(etsySection);
    }
    let newItem = etsyItem(id, decodeEntities(listing.title), images, listing.url.split("?")[0]);
    if (!category) {
        console.log(`  -> adding it to the top of the ${etsySection.sectionTitle} section`);
        etsySection.items = [newItem, ...(etsySection.items ?? [])];
        return true;
    }
    addToCategory(etsySection, newItem, category);
    return true;
}

// Puts `item` at the top of the etsy-shop subcategory named `category`.
// Subcategories are named after Etsy's shop sections; one the shop has that
// boo.json doesn't yet goes at the end, as a full run would add it.
function addToCategory(etsySection, item, category) {
    etsySection.subcategories ??= [];
    let group = etsySection.subcategories
        .find(group => group.name.toLowerCase() === category.toLowerCase());
    if (!group) {
        group = {name: category, show: true, items: []};
        etsySection.subcategories.push(group);
        console.log(`  -> no "${category}" subcategory yet - creating it`);
    }
    console.log(`  -> adding it to the top of "${group.name}"`);
    group.items = [item, ...(group.items ?? [])];
}


// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

try {
    if (itemUrl) {
        if (await refreshItem(itemUrl)) {
            writeBoo(BOO_PATH, previousBoo);
        } else {
            console.log(`${BOO_PATH} not changed`);
            process.exitCode = 1;
        }
    } else {
        let fetched;
        if (skipFetch) {
            console.log('--skip-fetch passed, reusing Etsy-sourced items already in _data/boo.json instead of contacting Etsy');
            fetched = previousGroups.map(group => ({
                name: group.name,
                items: (group.items ?? []).filter(isEtsyItem),
            }));
        } else {
            fetched = await fetchShop();
        }
        writeBoo(BOO_PATH, buildBoo(fetched));
    }
} catch (e) {
    console.log(`\n${e.message}\n${BOO_PATH} not changed`);
    process.exitCode = 1;
}
