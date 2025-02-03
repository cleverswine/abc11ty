const EleventyFetch = require("@11ty/eleventy-fetch");
const EleventyImage = require("@11ty/eleventy-img");
const RSSParser = require('rss-parser');
const HTMLParser = require('node-html-parser');
const fs = require('node:fs');

module.exports = async function () {
    // await EleventyImage("https://i.etsystatic.com/36256941/r/il/0274f0/6504511696/il_600x600.6504511696_99t6.jpg", { widths: [200], heights: [150], formats: ["png"]});
    // await EleventyImage("https://i.etsystatic.com/36256941/r/il/248c20/6454725092/il_600x600.6454725092_skcg.jpg", { widths: [200], formats: ["png"]});
    // await EleventyImage("https://i.etsystatic.com/36256941/r/il/fc7804/6094621468/il_600x600.6094621468_stur.jpg", { widths: [200], formats: ["png"]});
    // await EleventyImage("https://i.etsystatic.com/36256941/c/860/845/0/0/il/6b85b8/5616505301/il_600x600.5616505301_n5yd.jpg", { widths: [200], formats: ["png"]});
    // await EleventyImage("https://i.etsystatic.com/36256941/c/949/754/0/397/il/edf0fa/4870710569/il_600x600.4870710569_cwsx.jpg", { widths: [200], formats: ["png"]});

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

    let url = "https://www.etsy.com/shop/auntieboocrafts";

    // Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36
    // Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7

    let data = await EleventyFetch(url, {
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
    // const data = fs.readFileSync('../abc.html', 'utf8');
    let result = [];

    let listings = HTMLParser.parse(data).querySelectorAll('a.listing-link');
    console.log("items found:");
    console.log(listings.length);
    for (let i = 0; i < listings.length; i++) {
        let element = listings[i];
        let imageUrl = element.querySelector("img").getAttribute("src");
        let stats = await EleventyImage(imageUrl, {widths: [340], formats: ["png"]});
        let x = {
            url: element.attrs["href"].split("?")[0],
            imageInfo: stats,
            title: element.attrs["title"],
            isoDate: ""
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

    //await fs.writeFile("boo.json", JSON.stringify(result, null, 2));

    return result;
};