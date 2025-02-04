import Handlebars from 'handlebars';
import Fetch from '@11ty/eleventy-fetch';
import Image from '@11ty/eleventy-img';
import parse from 'node-html-parser';
import fs from 'node:fs';

const template = Handlebars.compile("Name: {{name}}");
console.log(template({ name: "Nils" }));

let url = "https://www.etsy.com/shop/auntieboocrafts";
let data = "";
try {
    data = await Fetch(url, {
        duration: "1d",
        type: "html",
        fetchOptions: {
            headers: {
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
            },
        },
    });
} catch (e) {
    console.log(e);
    return;
}
let result = [];

let listings = parse(data).querySelectorAll('a.listing-link');
console.log("items found:");
console.log(listings.length);
for (let i = 0; i < listings.length; i++) {
    let element = listings[i];
    let imageUrl = element.querySelector("img").getAttribute("src");
    let stats = await Image(imageUrl, { widths: [340], formats: ["png"] });
    let x = {
        url: element.attrs["href"].split("?")[0],
        img: stats.png[0].url,
        description: element.attrs["title"],
        title: element.attrs["title"].split(",")[0],
        section: ""
    };
    result.push(x);
}

fs.writeFile("boo.json", JSON.stringify(result, null, 2), err => {
    if (err) {
        console.error(err);
    } else {
        // file written successfully
    }
});
