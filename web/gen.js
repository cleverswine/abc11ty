// gen.js - scrapes the Auntie Boo Crafts Etsy shop into _data/boo.json.
//
// Run by hand from web/ (it's not part of the eleventy build):
//
//   node gen.js               scrape Etsy in a visible browser window
//   node gen.js --headless    same, but with no window - for unattended runs
//   node gen.js --skip-fetch  don't touch Etsy; just re-merge/normalize boo.json
//   node gen.js --item <url>  re-download the images of one listing (e.g.
//                             after changing its photos on Etsy), without
//                             scraping the whole shop, adding it to the top
//                             of its category (from the listing page's
//                             breadcrumb) if it's new; can be
//                             combined with --headless
//
// What it does:
//   1. Opens the shop home page and reads its list of sections (Etsy's
//      product categories, e.g. "Keychains", "Pens").
//   2. For each section, opens that section's page and reads every listing
//      on it, saving a small card thumbnail as img-product/<listingId>.png.
//   3. For each listing, opens the listing's own page and saves every photo
//      in its image carousel full-size as img-product/<listingId>-<n>.jpg.
//   4. Merges all of that into the "etsy-shop" section of boo.json (each
//      Etsy section becomes one of its subcategories) and writes the file.
//
// Safety rules - a bad or blocked run must never wipe out good data:
//   - Every section other than "etsy-shop" is hand-made in the admin tool
//     and is passed through completely untouched.
//   - Inside "etsy-shop", hand-added items (source != "Etsy") are kept, as
//     are the subcategory order, each subcategory's `show` flag, and the
//     section's own title/description/show.
//   - If Etsy blocks a page (it uses a DataDome captcha), whatever that page
//     would have replaced is kept as-is: a blocked home page keeps every
//     subcategory, a blocked section page keeps that subcategory, and a
//     blocked listing page keeps that item's previous photo gallery.

import * as fs from 'node:fs';
import * as readline from 'node:readline/promises';
import * as parser from 'node-html-parser';
import { chromium } from 'playwright';
import Image from "@11ty/eleventy-img";

const SHOP_URL = 'https://www.etsy.com/shop/AuntieBooCrafts';
const BOO_PATH = '_data/boo.json';
const IMAGE_DIR = './img-product/';

// Browser cookies (including any captcha pass) are saved here at the end of
// every run and loaded at the start of the next, so a captcha solved once by
// hand keeps working for later runs. Gitignored.
const SESSION_PATH = '.etsy-session.json';

// The one section of boo.json that gen.js owns. Its title, description and
// show flag are safe to edit in the admin tool, but renaming this id would
// stop gen.js from finding it again.
const ETSY_SECTION_ID = 'etsy-shop';

// Etsy section titles to leave off the site.
const IGNORE_SECTIONS = ["On sale"];

// Pause before every Etsy request, to look less like a bot.
const REQUEST_DELAY_MS = 3000;

const skipFetch = process.argv.includes('--skip-fetch');

// --item <listing URL>: refresh just that one item's images (see refreshItem)
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

// A visible browser lets a human solve a captcha: when a page is blocked,
// gen.js pauses until Enter is pressed in the terminal, then retries.
// --headless needs no display and never pauses - blocked pages are skipped
// (see the safety rules above).
const headed = !process.argv.includes('--headless');

// The current boo.json - the starting point everything is merged into.
const previousBoo = fs.existsSync(BOO_PATH) ? JSON.parse(fs.readFileSync(BOO_PATH, 'utf8')) : [];
const previousEtsySection = previousBoo.find(s => s.sectionId === ETSY_SECTION_ID);
const previousGroups = previousEtsySection?.subcategories ?? [];

// Every Etsy item already in boo.json: those in subcategories, plus any
// added by --item to the top of the section (see refreshItem).
const previousEtsyItems = [
    ...(previousEtsySection?.items ?? []),
    ...previousGroups.flatMap(group => group.items ?? []),
].filter(item => item.source === 'Etsy');

// Each Etsy item's images from the last run, by listing id - the fallback
// when a listing page is blocked this time.
const previousImagesById = new Map(
    previousEtsyItems
        .map(item => [item.id, item.images ?? []])
);

// ---------------------------------------------------------------------------
// Fetching pages
// ---------------------------------------------------------------------------

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForEnter(message) {
    let rl = readline.createInterface({input: process.stdin, output: process.stdout});
    await rl.question(message);
    rl.close();
}

// Etsy answers a plain fetch() with a 403, so pages are loaded in a real
// Chromium browser (driven by Playwright) instead. The browser is only
// started on the first request, so --skip-fetch never launches it. One
// browser context (one cookie jar) is shared by the whole run, so a captcha
// passed on one page carries over to the rest.
let browser, context;

async function getContext() {
    if (!context) {
        browser = await chromium.launch({
            headless: !headed,
            // hides one of the more obvious "this browser is automated" signals
            args: ['--disable-blink-features=AutomationControlled'],
        });
        context = await browser.newContext({
            userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
            locale: "en-US",
            extraHTTPHeaders: {"Accept-Language": "en-US,en;q=0.5"},
            storageState: fs.existsSync(SESSION_PATH) ? SESSION_PATH : undefined,
        });
        // another automation signal some bot checks look at
        await context.addInitScript(() => {
            Object.defineProperty(navigator, "webdriver", {get: () => undefined});
        });
    }
    return context;
}

// Saves the session for next time and shuts the browser down. A no-op if
// no page was ever fetched.
async function closeBrowser() {
    if (!context) return;
    await context.storageState({path: SESSION_PATH});
    await browser.close();
}

// Loads `url` and returns its HTML, or null if it failed. On failure the
// full response is logged, since that's how you tell a captcha (403 from
// "server: DataDome") from a real outage; then a headed run waits for the
// captcha to be solved and retries, while a headless run gives up.
//
// A null return is not the only way a page can fail - Etsy can also return
// a 200 with a challenge page in it - so callers still check that the
// content they need is actually there.
async function fetchHtml(url) {
    await delay(REQUEST_DELAY_MS);
    let page = await (await getContext()).newPage();
    try {
        while (true) {
            console.log(`fetching ${url}`);
            try {
                let response = await page.goto(url, {waitUntil: "domcontentloaded", timeout: 30000});
                // give any anti-bot JS challenge a moment to resolve before reading
                await page.waitForLoadState("networkidle", {timeout: 15000}).catch(() => {});
                let html = await page.content();
                if (response?.ok()) {
                    console.log(`  -> ok ${response.status()}, ${html.length} bytes`);
                    return html;
                }
                console.log(`  -> FAILED ${url}`);
                console.log(`     status: ${response ? `${response.status()} ${response.statusText()}` : '(no response)'}`);
                console.log(`     headers: ${JSON.stringify(response ? await response.allHeaders() : {})}`);
                console.log(`     body (first 1000 chars): ${html.slice(0, 1000)}`);
            } catch (e) {
                console.log(`  -> FAILED ${url}: ${e.message}`);
            }
            if (!headed) return null;
            await waitForEnter('     Solve it in the browser window, then press Enter to retry (Ctrl+C to abort)... ');
        }
    } finally {
        await page.close();
    }
}

// Downloads an image into img-product/ under `filename`, resized to `width`
// (never upscaled) and re-encoded as `format`, which also strips metadata.
// Returns the path to store in boo.json, e.g. "img-product/123.png".
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

// ---------------------------------------------------------------------------
// Scraping
// ---------------------------------------------------------------------------

// Returns [{name, items}], one per Etsy section, in the shop's order. A
// section whose page was blocked has `items: null` (as opposed to `[]`, a
// section that really is empty), so the merge knows to keep its old items.
// Returns null if the home page itself was blocked.
async function scrapeShop() {
    let html = await fetchHtml(SHOP_URL);
    // the section nav is a menu of buttons, each with a data-section-id and
    // a label like "Keychains (12)"
    let buttons = html ? parser.parse(html).querySelectorAll('button.wt-menu__item[data-section-id]') : [];
    if (buttons.length === 0) {
        console.log('no section nav found on the shop home page (likely blocked) - leaving all Etsy listings untouched');
        return null;
    }

    let sections = [];
    for (let button of buttons) {
        let name = button.innerHTML.trim().split("(")[0].trim();
        let sectionId = button.getAttribute('data-section-id');
        console.log("===========================================");
        // section "0" is Etsy's catch-all "All" section
        if (sectionId === '0' || IGNORE_SECTIONS.includes(name)) {
            console.log(`ignoring section ${name}`);
            continue;
        }
        console.log(`processing section ${name}`);
        sections.push({name, items: await scrapeSection(sectionId)});
    }
    return sections;
}

// Returns the boo.json items for one Etsy section, or null if its page was
// blocked.
async function scrapeSection(sectionId) {
    let html = await fetchHtml(`${SHOP_URL}?section_id=${sectionId}`);
    let grid = html && parser.parse(html).querySelector('div.responsive-listing-grid');
    if (!grid) {
        console.log(`  -> no listing grid found on section page ${sectionId} (likely blocked) - leaving this section's listings untouched`);
        return null;
    }

    let listings = grid.querySelectorAll('a.listing-link');
    console.log(`found ${listings.length} listings`);
    let items = [];
    for (let listing of listings) {
        let id = listing.getAttribute("data-listing-id");
        // Etsy titles are keyword lists ("Floral Chicken Magnet, Farmhouse
        // Decor, ..."); the first phrase makes a readable title
        let fullTitle = listing.getAttribute("title");
        let etsyPage = listing.getAttribute("href").split("?")[0];

        let thumbnail = await downloadImage(listing.querySelector("img").getAttribute("src"), 340, "png", `${id}.png`);
        // if the listing page is blocked, keep last run's gallery - everything
        // after its first image, which was the thumbnail (re-added below)
        let gallery = await scrapeListingGallery(id, etsyPage)
            ?? (previousImagesById.get(id) ?? []).slice(1);

        items.push({
            id,
            show: true,
            title: fullTitle.split(",")[0],
            description: fullTitle,
            // the small thumbnail comes first since it's what the site's
            // product cards show; the popup slideshow skips it and shows
            // the full-size gallery (whose first photo is the same picture)
            images: [thumbnail, ...gallery],
            etsyPage,
            source: "Etsy",
        });
    }
    return items;
}

// Downloads every photo in a listing's image carousel, full-size, as
// img-product/<id>-1.jpg, -2.jpg, ... in Etsy's order. Returns their paths,
// or null if the page was blocked.
async function scrapeListingGallery(id, listingUrl) {
    let listing = await scrapeListing(id, listingUrl);
    return listing && await downloadGallery(id, listing.urls);
}

// Returns {title, category, urls} for a listing page: its full keyword-list
// title (as the shop grid's link title has it), its category (the last
// entry of the breadcrumb above the photos, or null if none was found), and
// the full-size URLs of every photo in its image carousel, in Etsy's order.
// Returns null if the page was blocked.
//
// The carousel only links 75x75 thumbnails, e.g.
//   https://i.etsystatic.com/.../il_75x75.8652877783_q0sf.jpg
// but swapping the size part of the name for 794xN gets the full-size photo
// from the same URL:
//   https://i.etsystatic.com/.../il_794xN.8652877783_q0sf.jpg
// (340x270 works too - it's the size the shop's listing grid uses, which is
// how --item rebuilds an item's card thumbnail; see refreshItem.)
async function scrapeListing(id, listingUrl) {
    let html = await fetchHtml(listingUrl);
    let root = html && parser.parse(html);
    let thumbs = root ? root.querySelectorAll('img[data-carousel-thumbnail-image]') : [];
    // Set removes duplicates while keeping the order
    let urls = [...new Set(thumbs
        .map(img => img.getAttribute('src') || img.getAttribute('data-src-delay') || '')
        .filter(src => src.includes('/il_75x75.'))
        .map(src => src.replace('/il_75x75.', '/il_794xN.')))];
    if (urls.length === 0) {
        console.log(`  -> no image carousel found on listing page ${id} (likely blocked) - keeping its previous images`);
        return null;
    }
    // .text decodes HTML entities; og:title is the fallback if the heading's
    // markup ever changes
    let title = root.querySelector('h1')?.text.trim()
        || parser.parse(root.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? '').text.trim();
    let category = getBreadcrumbCategory(root);
    console.log(`  -> category: ${category ?? '(no breadcrumb found)'}`);
    return {title, category, urls};
}

// The last entry of a listing page's breadcrumb. Tries the page's structured
// data (a schema.org BreadcrumbList) first, then the visible breadcrumb nav.
function getBreadcrumbCategory(root) {
    for (let script of root.querySelectorAll('script[type="application/ld+json"]')) {
        let data;
        try {
            data = JSON.parse(script.textContent);
        } catch {
            continue;
        }
        let list = [data, ...(data['@graph'] ?? [])].flat()
            .find(entry => entry?.['@type'] === 'BreadcrumbList');
        let name = list?.itemListElement?.at(-1)?.name ?? list?.itemListElement?.at(-1)?.item?.name;
        if (name) return parser.parse(name).text.trim();
    }
    let nav = root.querySelector('nav[aria-label*="readcrumb"], [data-breadcrumbs], [class*="breadcrumb"]');
    let entries = (nav?.querySelectorAll('li') ?? [])
        .map(li => li.text.trim())
        .filter(Boolean);
    return entries.at(-1) ?? null;
}

async function downloadGallery(id, urls) {
    let paths = [];
    for (let [i, url] of urls.entries()) {
        paths.push(await downloadImage(url, 794, "jpeg", `${id}-${i + 1}.jpg`));
    }
    console.log(`  -> ${paths.length} images`);
    return paths;
}

// ---------------------------------------------------------------------------
// Merging into boo.json
// ---------------------------------------------------------------------------

// Builds etsy-shop's new subcategory list from the scrape results (see
// scrapeShop for the shape), following the safety rules at the top.
function mergeSubcategories(scraped) {
    // home page blocked: keep everything
    if (!scraped) return previousGroups;

    let scrapedItems = new Map(scraped.map(section => [section.name, section.items]));
    // existing subcategories keep their (admin-chosen) order; sections new
    // on Etsy go at the end
    let names = [...new Set([...previousGroups.map(g => g.name), ...scrapedItems.keys()])];

    return names
        .map(name => {
            let previous = previousGroups.find(g => g.name === name);
            // undefined = section no longer on Etsy, null = its page was blocked
            let fresh = scrapedItems.get(name);
            if (fresh === null) return previous ?? {name, show: true, items: []};
            let handAdded = (previous?.items ?? []).filter(item => item.source !== 'Etsy');
            return {
                name,
                show: previous?.show ?? true,
                items: [...(fresh ?? []), ...handAdded],
            };
        })
        // drop subcategories left with no items at all (e.g. a section that
        // was removed on Etsy and had nothing hand-added)
        .filter(group => group.items.length > 0);
}

// Returns the full new boo.json contents for a full run: the rebuilt
// etsy-shop section swapped in place of the old one, every other section
// left as it was (or etsy-shop added at the end on the very first run).
// Items that --item added to the top of the section are dropped once the
// scrape has put them in their proper subcategories (kept until then, e.g.
// if their section page was blocked).
function buildBoo(scraped) {
    let subcategories = mergeSubcategories(scraped);
    let subcategoryIds = new Set(subcategories.flatMap(group => group.items.map(item => item.id)));
    let topItems = (previousEtsySection?.items ?? []).filter(item => !subcategoryIds.has(item.id));
    let etsySection = {
        sectionId: ETSY_SECTION_ID,
        sectionTitle: previousEtsySection?.sectionTitle || 'Etsy Items',
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

// --item: re-downloads one Etsy item's card thumbnail and photo gallery,
// updating its `images` in place (in the previousBoo object that gets
// written back out). Everything else about an existing item - title, show
// flag, which subcategory it's in - is left alone. Returns false, changing
// nothing, if the URL isn't a listing URL or its page is blocked.
//
// A listing that isn't in boo.json yet is added to the top of the
// subcategory named by the last entry of its page's breadcrumb (created if
// need be). If no breadcrumb is found, it goes to the top of the etsy-shop
// section's own `items`, above its subcategories, and the next full run
// drops it from there once it has scraped it into its proper subcategory.
async function refreshItem(url) {
    let id = url.match(/\/listing\/(\d+)/)?.[1];
    if (!id) {
        console.log(`not an Etsy listing URL (expected .../listing/<number>/...): ${url}`);
        return false;
    }
    let etsyPage = url.split("?")[0];
    let item = previousEtsyItems.find(item => item.id === id);
    console.log(item
        ? `refreshing images for "${item.title}" (${id})`
        : `listing ${id} isn't in ${BOO_PATH} yet - adding it`);

    let listing = await scrapeListing(id, etsyPage);
    if (!listing) return false;
    // the first photo, at the size the shop's listing grid uses, is the same
    // card thumbnail a full run would have downloaded from the section page
    let thumbnail = await downloadImage(listing.urls[0].replace('/il_794xN.', '/il_340x270.'), 340, "png", `${id}.png`);
    let images = [thumbnail, ...await downloadGallery(id, listing.urls)];

    if (item) {
        item.images = images;
        // an item an earlier run left at the top of the section (no
        // breadcrumb found then) moves into its category if there is one now
        let topItems = previousEtsySection?.items ?? [];
        if (!listing.category || !topItems.includes(item)) return true;
        previousEtsySection.items = topItems.filter(other => other !== item);
        if (previousEtsySection.items.length === 0) delete previousEtsySection.items;
        addToCategory(previousEtsySection, item, listing.category);
        return true;
    }
    if (!listing.title) {
        console.log(`  -> no title found on listing page ${id}`);
        return false;
    }
    let etsySection = previousEtsySection;
    if (!etsySection) {
        etsySection = {sectionId: ETSY_SECTION_ID, sectionTitle: 'Etsy Items', show: true, subcategories: []};
        previousBoo.push(etsySection);
    }
    // same shape as scrapeSection's items
    let newItem = {
        id,
        show: true,
        title: listing.title.split(",")[0],
        description: listing.title,
        images,
        etsyPage,
        source: "Etsy",
    };
    if (!listing.category) {
        console.log(`  -> adding it to the top of the ${etsySection.sectionTitle} section`);
        etsySection.items = [newItem, ...(etsySection.items ?? [])];
        return true;
    }
    addToCategory(etsySection, newItem, listing.category);
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

function writeBoo(boo) {
    fs.writeFileSync(BOO_PATH, JSON.stringify(boo, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (itemUrl) {
    let ok;
    try {
        ok = await refreshItem(itemUrl);
    } finally {
        // save the session even if this crashed partway through
        await closeBrowser();
    }
    if (ok) {
        writeBoo(previousBoo);
    } else {
        console.log(`${BOO_PATH} not changed`);
        process.exitCode = 1;
    }
} else {
    let scraped;
    if (skipFetch) {
        console.log('--skip-fetch passed, reusing Etsy-sourced items already in _data/boo.json instead of hitting Etsy');
        scraped = previousGroups.map(group => ({
            name: group.name,
            items: (group.items ?? []).filter(item => item.source === 'Etsy'),
        }));
    } else {
        try {
            scraped = await scrapeShop();
        } finally {
            await closeBrowser();
        }
    }
    writeBoo(buildBoo(scraped));
}
