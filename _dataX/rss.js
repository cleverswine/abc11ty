const EleventyFetch = require("@11ty/eleventy-fetch");
const EleventyImage = require("@11ty/eleventy-img");
const RSSParser = require('rss-parser');
const HTMLParser = require('node-html-parser');
const fs = require('node:fs');

module.exports = async function () {
    // let url = "https://www.etsy.com/shop/auntieboocrafts/rss";
    // let rssParser = new RSSParser();
    // let result = [];
    //
    // let xml = await EleventyFetch(url);
    // let feed = await rssParser.parseString(xml);
    // for (let i = 0; i < feed.items.length; i++) {
    //     if(i > 8) break;
    //     const item = feed.items[i];
    //     var root = HTMLParser.parse(item.content);
    //     var imageUrl = root.querySelector("img").getAttribute("src");
    //     let stats = await EleventyImage(imageUrl, { widths: [340], formats: ["png"] });
    //     var x = { url: item.link, imageInfo: stats, title: item.title.replace(" by AuntieBooCrafts", ""), isoDate: item.isoDate };
    //     console.log(x);
    //     result.push(x);
    // }

    // let url = "https://www.etsy.com/shop/auntieboocrafts";
    // let data = await EleventyFetch(url, {
    //     duration: "1d",
    //     type: "html",
    //     fetchOptions: {
    //         headers: {
    //             "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:134.0) Gecko/20100101 Firefox/134.0",
    //             "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    //             "Accept-Language": "en-US,en;q=0.5",
    //             "Accept-Encoding": "gzip, deflate, br, zstd",
    //             "Referer": "https://www.auntieboocrafts.com/",
    //             "DNT": "1",
    //             "Connection": "keep-alive",
    //             "Upgrade-Insecure-Requests": "1",
    //             "Sec-Fetch-Dest": "document",
    //             "Sec-Fetch-Mode": "navigate",
    //             "Sec-Fetch-Site": "cross-site",
    //             "Sec-Fetch-User": "?1",
    //             "Sec-GPC": "1",
    //             "Priority": "u=0, i",
    //             "Pragma": "no-cache",
    //             "Cache-Control": "no-cache",
    //             "TE": "trailers"
    //         },
    //     },
    // });

    let result = [];

    // let listings = HTMLParser.parse(data).querySelectorAll('a.listing-link');
    // console.log("items found:");
    // console.log(listings.length);
    // for (let i = 0; i < listings.length; i++) {
    //     let element = listings[i];
    //     let imageUrl = element.querySelector("img").getAttribute("src");
    //     let stats = await EleventyImage(imageUrl, {widths: [340], formats: ["png"]});
    //     let x = {
    //         url: element.attrs["href"].split("?")[0],
    //         imageInfo: stats,
    //         title: element.attrs["title"],
    //         isoDate: ""
    //     };
    //     result.push(x);
    // }
    //
    // fs.writeFile("boo.json", JSON.stringify(result, null, 2), err => {
    //     if (err) {
    //         console.error(err);
    //     } else {
    //         // file written successfully
    //     }
    // });

    return result;
};