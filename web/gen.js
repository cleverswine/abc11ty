import * as fs from 'node:fs';
import * as readline from 'node:readline/promises';
import * as parser from 'node-html-parser';
import { chromium } from 'playwright';
import Image from "@11ty/eleventy-img";

const ignoreSections = ["Christmas", "On sale"]
const skipFetch = process.argv.includes('--skip-fetch');
// Runs a visible browser window and, on a blocked/challenged request, pauses
// so a human can solve it there before gen.js retries. The resulting session
// (cookies etc, see SESSION_PATH) is saved to disk either way, so a later
// plain `node gen.js` run can reuse whatever trust was earned interactively.
const headed = process.argv.includes('--headed');
const booPath = '_data/boo.json';
const SESSION_PATH = '.etsy-session.json';

// The single section gen.js owns. Every other section (e.g. "live-events")
// is entirely hand-authored and passed through untouched. Renaming this
// section's id via the admin tool would break gen.js's ability to find it
// again next run - sectionTitle/sectionDescription/show are all safe to
// rename/edit though, since they're carried forward below.
const ETSY_SECTION_ID = 'etsy-shop';

let previousBoo = fs.existsSync(booPath) ? JSON.parse(fs.readFileSync(booPath, 'utf8')) : null;
let previousEtsySection = previousBoo ? previousBoo.find(s => s.sectionId === ETSY_SECTION_ID) : null;

// A real Chromium instance (see fetchHtml below) sets most browser-identity
// headers itself; these are the couple worth overriding explicitly.
let trickyHeaders = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.5",
}

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

// Etsy started rejecting plain HTTP fetches (even with browser-like headers)
// with a 403, so pages are now fetched through a real Chromium instance
// instead - its TLS/JS fingerprint passes where a bare fetch() no longer
// does. Not worth the overhead of eleventy-fetch-style disk caching here
// since gen.js is run manually and rarely.
let browserPromise;
function getBrowser() {
    if (!browserPromise) {
        browserPromise = chromium.launch({
            headless: !headed,
            args: ['--disable-blink-features=AutomationControlled'],
        });
    }
    return browserPromise;
}

// One context (and thus one cookie jar) for the whole run, seeded from
// SESSION_PATH when present, so a DataDome pass earned on the first request
// (or in an earlier --headed run) actually carries over to the rest.
let contextPromise;
function getContext() {
    if (!contextPromise) {
        contextPromise = (async () => {
            let browser = await getBrowser();
            let context = await browser.newContext({
                userAgent: trickyHeaders["User-Agent"],
                locale: "en-US",
                extraHTTPHeaders: {"Accept-Language": trickyHeaders["Accept-Language"]},
                storageState: fs.existsSync(SESSION_PATH) ? SESSION_PATH : undefined,
            });
            await context.addInitScript(() => {
                Object.defineProperty(navigator, "webdriver", {get: () => undefined});
            });
            return context;
        })();
    }
    return contextPromise;
}

async function waitForEnter(message) {
    let rl = readline.createInterface({input: process.stdin, output: process.stdout});
    await rl.question(message);
    rl.close();
}

async function fetchHtml(url) {
    let context = await getContext();
    let page = await context.newPage();
    try {
        while (true) {
            console.log(`fetching ${url}`);
            let response, html;
            try {
                response = await page.goto(url, {waitUntil: "domcontentloaded", timeout: 30000});
                // give any anti-bot JS challenge a moment to resolve before reading
                await page.waitForLoadState("networkidle", {timeout: 15000}).catch(() => {});
                html = await page.content();
            } catch (e) {
                console.log(`  -> FAILED ${url}: ${e.message}`);
                if (!headed) throw e;
                await waitForEnter('     Solve it in the browser window, then press Enter to retry (Ctrl+C to abort)... ');
                continue;
            }

            if (response && response.ok()) {
                console.log(`  -> ok ${response.status()}, ${html.length} bytes`);
                return html;
            }

            console.log(`  -> FAILED ${url}`);
            console.log(`     status: ${response ? `${response.status()} ${response.statusText()}` : '(no response)'}`);
            console.log(`     headers: ${JSON.stringify(response ? await response.allHeaders() : {})}`);
            console.log(`     body (first 1000 chars): ${html.slice(0, 1000)}`);

            if (!headed) return html;

            await waitForEnter('     Solve it in the browser window, then press Enter to retry (Ctrl+C to abort)... ');
        }
    } finally {
        await page.close();
    }
}

// Returns {ok, items}: ok is false whenever the fetch/parse didn't actually
// succeed (network failure, or a blocked/challenge page in place of the
// expected listing grid) - the caller must not treat that the same as "this
// section genuinely has zero listings right now", or a blocked scrape would
// wipe out real listings on merge.
async function getSectionItems(sectionId) {
    console.log(`fetching section page ${sectionId} in 3 seconds...`);
    await delay(3000);

    let items = [];

    let data = "";
    try {
        data = await fetchHtml(`https://www.etsy.com/shop/AuntieBooCrafts?section_id=${sectionId}`);
    } catch (e) {
        return {ok: false, items: []};
    }

    let parsedData = parser.parse(data);
    let listingsSection = parsedData.querySelectorAll('div.responsive-listing-grid')[0];
    if (!listingsSection) {
        console.log(`  -> no listing grid found on section page ${sectionId} (likely blocked) - leaving this section's listings untouched`);
        return {ok: false, items: []};
    }
    let listings = listingsSection.querySelectorAll('a.listing-link');
    console.log(`found ${listings.length} listings`);
    for (let i = 0; i < listings.length; i++) {
        let listing = listings[i];
        let title = listing.attrs["title"];
        let productId = listing.attrs["data-listing-id"];
        let imageUrl = listing.querySelector("img").getAttribute("src");
        let imgStats = await Image(imageUrl, {
            widths: [340],
            formats: ["png"],
            outputDir: "./img-product/",
            filenameFormat: function (id, src, width, format, options) {
                return `${productId}.${format}`;
            },
        });
        items.push({
            id: productId,
            show: true,
            title: title.split(",")[0],
            description: title,
            images: [imgStats.png[0].outputPath],
            etsyPage: listing.attrs["href"].split("?")[0],
            source: "Etsy",
        });
    }
    return {ok: true, items};
}

// [{name, ok, items}] - one entry per real Etsy category, freshly scraped
// (or, with --skip-fetch, reused from the current boo.json instead of
// fetched). scrapeFailed short-circuits the whole thing when even the shop
// home page didn't come back usable, so a blocked run leaves every Etsy
// subcategory exactly as it was instead of merging in emptiness.
let freshCategories = [];
let scrapeFailed = false;

if (skipFetch) {
    console.log('--skip-fetch passed, reusing Etsy-sourced items already in _data/boo.json instead of hitting Etsy');
    freshCategories = ((previousEtsySection && previousEtsySection.subcategories) || [])
        .map(group => ({
            name: group.name,
            ok: true,
            items: (group.items || []).filter(item => item.source === 'Etsy'),
        }));
} else {
    let data = "";
    try {
        data = await fetchHtml("https://www.etsy.com/shop/auntieboocrafts");
    } catch (e) {
        // already logged in detail by fetchHtml
    }

    let parsedData = parser.parse(data);
    let sectionButtons = parsedData.querySelectorAll('button.wt-menu__item');
    if (sectionButtons.length === 0) {
        console.log('no section nav found on the shop home page (likely blocked) - leaving all Etsy listings untouched');
        scrapeFailed = true;
    }
    for (let i = 0; i < sectionButtons.length; i++) {
        let sectionButton = sectionButtons[i];
        if (sectionButton.hasAttribute('data-section-id')) {
            console.log("===========================================");
            console.log(`found section ${sectionButton.innerHTML.trim()}`);
            let sectionTitle = sectionButton.innerHTML.trim().split("(")[0].trim();
            let sectionId = sectionButton.getAttribute('data-section-id');
            if (ignoreSections.indexOf(sectionTitle) === -1 && sectionId !== '0') {
                console.log(`processing section ${sectionTitle}`)
                freshCategories.push({
                    name: sectionTitle,
                    ...await getSectionItems(sectionId),
                });
            } else {
                console.log(`ignoring section ${sectionTitle}`)
            }
        }
    }
}

// Saved regardless of --headed: even a headless run's already-trusted
// session is worth persisting, and a --headed run's manually-solved
// challenge is exactly what makes later headless runs work at all.
if (contextPromise) {
    let context = await contextPromise;
    await context.storageState({path: SESSION_PATH});
    await context.close();
}
if (browserPromise) {
    await (await browserPromise).close();
}

// Merges the freshly-scraped Etsy categories into etsy-shop's subcategories,
// keeping the admin's current subcategory order and re-appending any
// non-Etsy (hand-added) items that were mixed into a subcategory - the same
// idea as the old per-item "manual" carry-forward, just scoped by source.
// A category whose own scrape failed (fresh.ok === false) is left exactly as
// it was in the previous boo.json rather than merged as if it were
// legitimately empty - see getSectionItems.
function mergeEtsySubcategories(freshCategories, previousEtsySection) {
    let previousGroups = (previousEtsySection && previousEtsySection.subcategories) || [];
    let previousByName = new Map(previousGroups.map(g => [g.name, g]));
    let freshByName = new Map(freshCategories.map(c => [c.name, c]));

    let orderedNames = previousGroups.map(g => g.name);
    for (let name of freshByName.keys()) {
        if (!orderedNames.includes(name)) orderedNames.push(name);
    }

    return orderedNames
        .map(name => {
            let fresh = freshByName.get(name);
            let previous = previousByName.get(name);
            if (fresh && !fresh.ok) {
                return previous || {name, show: true, items: []};
            }
            let manualItems = previous ? (previous.items || []).filter(i => i.source !== 'Etsy') : [];
            return {
                name,
                show: previous && typeof previous.show === 'boolean' ? previous.show : true,
                items: [...(fresh ? fresh.items : []), ...manualItems],
            };
        })
        // drop a subcategory once it has neither fresh Etsy items nor any
        // manual leftovers, instead of leaving an empty shell around forever
        .filter(group => group.items.length > 0);
}

let etsySection = {
    sectionId: ETSY_SECTION_ID,
    sectionTitle: (previousEtsySection && previousEtsySection.sectionTitle) || 'Etsy Shop',
    show: previousEtsySection && typeof previousEtsySection.show === 'boolean' ? previousEtsySection.show : true,
    subcategories: scrapeFailed
        ? ((previousEtsySection && previousEtsySection.subcategories) || [])
        : mergeEtsySubcategories(freshCategories, previousEtsySection),
};
if (previousEtsySection && previousEtsySection.sectionDescription) {
    etsySection.sectionDescription = previousEtsySection.sectionDescription;
}

let result;
if (previousBoo) {
    result = previousEtsySection
        ? previousBoo.map(section => section.sectionId === ETSY_SECTION_ID ? etsySection : section)
        : [...previousBoo, etsySection];
} else {
    result = [etsySection];
}

if (previousBoo) {
    fs.copyFileSync(booPath, '_data/boo-old.json');
}
fs.writeFileSync(booPath, JSON.stringify(result, null, 2) + '\n');
