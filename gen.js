import * as fs from 'node:fs';
import * as parser from 'node-html-parser';
import Fetch from "@11ty/eleventy-fetch";
import Image from "@11ty/eleventy-img";

const ignoreSections = ["Christmas", "On sale"]
let result = [];

let trickyHeaders = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:134.0) Gecko/20100101 Firefox/134.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Referer": "https://www.auntieboocrafts.com/",
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

fs.writeFileSync('_data/boo.json', JSON.stringify(result, null, 2));
