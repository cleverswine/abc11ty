import * as fs from 'node:fs';
import * as parser from 'node-html-parser';
import Fetch from "@11ty/eleventy-fetch";
import Image from "@11ty/eleventy-img";
// import Image from "@11ty/eleventy-img";

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
    //if (sectionId !== '38581786') return [];
    await delay(3000);

    let items = [];

    // let data = fs.readFileSync('scripts/boo-section.html', 'utf8');
    let data = await Fetch(`https://www.etsy.com/shop/AuntieBooCrafts?section_id=${sectionId}`, {
        duration: "1d",
        type: "html",
        fetchOptions: {headers: trickyHeaders,},
    });

    parsedData = parser.parse(data);
    let listings = parsedData.querySelectorAll('a.listing-link');
    for (let i = 0; i < listings.length; i++) {
        let listing = listings[i];
        let imageUrl = listing.querySelector("img").getAttribute("src");
        let imgStats = await Image(imageUrl, { widths: [340], formats: ["png"] });
        items.push({
            title: listing.attrs["title"].split(",")[0],
            description: listing.attrs["title"],
            image: imgStats.png[0].url,
            etsyPage: listing.attrs["href"].split("?")[0]
        });
    }
    return items;
}

let data = ""; //fs.readFileSync('scripts/boo.html', 'utf8');
try {
    data = await Fetch("https://www.etsy.com/shop/auntieboocrafts", {
        duration: "1d",
        type: "html",
        fetchOptions: {headers: trickyHeaders,},
    });
} catch (e) {
    console.log(e);
    return;
}

let parsedData = parser.parse(data);
let sectionButtons = parsedData.querySelectorAll('button.wt-menu__item');
for (let i = 0; i < sectionButtons.length; i++) {
    let sectionButton = sectionButtons[i];
    if (sectionButton.hasAttribute('data-section-id')) {
        let sectionId = sectionButton.getAttribute('data-section-id');
        if (sectionId !== '0') {
            let sectionObj = {
                sectionId: sectionId,
                sectionTitle: sectionButton.innerHTML.trim().split("(")[0].trim(),
                items: getSectionItems(sectionId)
            };

            result.push(sectionObj)
        }
    }
}

fs.writeFileSync('scripts/boo-test.json', JSON.stringify(result, null, 2));
