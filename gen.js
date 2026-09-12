import * as fs from 'node:fs';
import * as parser from 'node-html-parser';
import Fetch from "@11ty/eleventy-fetch";
import Image from "@11ty/eleventy-img";

const ignoreSections = ["Christmas", "On sale"]
const skipFetch = process.argv.includes('--skip-fetch');
let result = [];

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
            order: 0,
            title: title.split(",")[0],
            description: title,
            image: imgStats.png[0].outputPath,
            etsyPage: listing.attrs["href"].split("?")[0]
        });
    }
    return items;
}

if (skipFetch) {
    console.log('--skip-fetch passed, reusing sections already in _data/boo.json instead of hitting Etsy');
    result = JSON.parse(fs.readFileSync('_data/boo.json', 'utf8'));
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

function flattenManualItems(manualSection) {
    // manual items can be listed flat (section.items) and/or grouped under
    // section.subcategories - both end up as a flat list tagged with a
    // "subcategory" field, which is what index.html actually groups on.
    let items = (manualSection.items || []).map(item => ({...item, manual: true}));
    for (let group of manualSection.subcategories || []) {
        // a hidden subcategory hides all of its items; index.html already
        // filters items on "show", so folding the group's flag into each
        // item's "show" hides the whole group (and its heading) for free.
        let groupShown = group.show !== false;
        for (let item of group.items || []) {
            items.push({
                ...item,
                subcategory: group.name,
                manual: true,
                show: item.show !== false && groupShown,
            });
        }
    }
    return items;
}

function mergeManualData(result) {
    let manualPath = '_data/boo-manual.json';
    if (!fs.existsSync(manualPath)) {
        return result;
    }
    // drop artifacts from a previous merge so re-running (e.g. with --skip-fetch) is idempotent
    result = result.filter(s => !s.manual);
    for (let section of result) {
        section.items = section.items.filter(item => !item.manual);
        delete section.pinned;
        delete section.sectionDescription;
        delete section.show;
    }
    let manualSections = JSON.parse(fs.readFileSync(manualPath, 'utf8'));
    for (let manualSection of manualSections) {
        let manualItems = flattenManualItems(manualSection);
        let existing = result.find(s => s.sectionId === manualSection.sectionId);
        if (existing) {
            existing.items.push(...manualItems);
            if (manualSection.pinned) {
                existing.pinned = true;
            }
            if (manualSection.sectionDescription) {
                existing.sectionDescription = manualSection.sectionDescription;
            }
            if (typeof manualSection.show === 'boolean') {
                existing.show = manualSection.show;
            }
        } else {
            let {items, subcategories, ...sectionFields} = manualSection;
            result.push({...sectionFields, manual: true, items: manualItems});
        }
    }
    // pinned sections float to the top, preserving relative order otherwise
    result.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    return result;
}

result = mergeManualData(result);

fs.copyFileSync('_data/boo.json', '_data/boo-old.json');
fs.writeFileSync('_data/boo.json', JSON.stringify(result, null, 2));
