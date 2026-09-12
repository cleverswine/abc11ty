import * as fs from 'node:fs';
import * as parser from 'node-html-parser';
import Fetch from "@11ty/eleventy-fetch";
import Image from "@11ty/eleventy-img";

const ignoreSections = ["Christmas", "On sale"]
const skipFetch = process.argv.includes('--skip-fetch');
const booPath = '_data/boo.json';
let result = [];

let previousBoo = fs.existsSync(booPath) ? JSON.parse(fs.readFileSync(booPath, 'utf8')) : null;

let trickyHeaders = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Referer": "https://www.auntieboocrafts.com/",
    "Cookie": "",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "cross-site",
    "Sec-Fetch-User": "?1",
    "Sec-GPC": "1",
    "Priority": "u=0, i",
    "Pragma": "no-cache",
    "Cache-Control": "no-cache",
    "TE": "trailers"
}

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

async function getSectionItems(sectionId) {
    console.log(`fetching section page ${sectionId} in 3 seconds...`);
    await delay(3000);

    let items = [];

    let data = "";
    try {
        data = await Fetch(`https://www.etsy.com/shop/AuntieBooCrafts?section_id=${sectionId}`, {
            duration: "1d",
            type: "html",
            fetchOptions: {headers: trickyHeaders,},
        });
        console.log(`fetched section page ${sectionId}`)
    } catch (e) {
        console.log(e);
        return [];
    }

    parsedData = parser.parse(data);
    let listingsSection = parsedData.querySelectorAll('div.responsive-listing-grid')[0];
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
            etsyPage: listing.attrs["href"].split("?")[0]
        });
    }
    return items;
}

if (skipFetch) {
    console.log('--skip-fetch passed, reusing Etsy-sourced sections already in _data/boo.json instead of hitting Etsy');
    // drop manual sections/items here - preserveManualContent() below adds them back,
    // so this is just the "no new scrape happened" baseline it merges onto.
    result = (previousBoo || [])
        .filter(section => !section.manual)
        .map(section => ({...section, items: section.items.filter(item => !item.manual)}));
} else {
    let data = "";
    try {
        data = await Fetch("https://www.etsy.com/shop/auntieboocrafts", {
            duration: "1d",
            type: "html",
            fetchOptions: {headers: trickyHeaders,},
        });
    } catch (e) {
        console.log(e);
    }

    let parsedData = parser.parse(data);
    let sectionButtons = parsedData.querySelectorAll('button.wt-menu__item');
    for (let i = 0; i < sectionButtons.length; i++) {
        let sectionButton = sectionButtons[i];
        if (sectionButton.hasAttribute('data-section-id')) {
            console.log("===========================================");
            console.log(`found section ${sectionButton.innerHTML.trim()}`);
            let sectionTitle = sectionButton.innerHTML.trim().split("(")[0].trim();
            let sectionId = sectionButton.getAttribute('data-section-id');
            if (ignoreSections.indexOf(sectionTitle) === -1 && sectionId !== '0') {
                console.log(`processing section ${sectionTitle}`)
                let sectionObj = {
                    sectionId: sectionId,
                    sectionTitle: sectionTitle,
                    items: await getSectionItems(sectionId)
                };
                result.push(sectionObj)
            } else {
                console.log(`ignoring section ${sectionTitle}`)
            }
        }
    }
}

function preserveManualContent(freshResult, previousBoo) {
    if (!previousBoo) {
        return freshResult;
    }
    // sections tagged "manual" (no matching Etsy section) are carried forward
    // untouched, subcategories and all - gen.js never has to understand their
    // internal shape, it just never overwrites anything tagged manual.
    let manualOnlySections = previousBoo.filter(section => section.manual);

    for (let section of freshResult) {
        let previousSection = previousBoo.find(s => s.sectionId === section.sectionId && !s.manual);
        if (!previousSection) {
            continue;
        }
        // manual items appended onto a real Etsy section carry their own
        // "manual" tag per item, so they're easy to pick back out and re-append.
        let manualItems = (previousSection.items || []).filter(item => item.manual);
        section.items.push(...manualItems);
        // raw Etsy scrapes never set these fields, so their presence here can
        // only mean they were set by hand - safe to always carry forward.
        if (typeof previousSection.pinned === 'boolean') {
            section.pinned = previousSection.pinned;
        }
        if (previousSection.sectionDescription) {
            section.sectionDescription = previousSection.sectionDescription;
        }
        if (typeof previousSection.show === 'boolean') {
            section.show = previousSection.show;
        }
    }

    let combined = [...freshResult, ...manualOnlySections];
    // pinned sections float to the top, preserving relative order otherwise
    combined.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    return combined;
}

result = preserveManualContent(result, previousBoo);

if (previousBoo) {
    fs.copyFileSync(booPath, '_data/boo-old.json');
}
fs.writeFileSync(booPath, JSON.stringify(result, null, 2));
