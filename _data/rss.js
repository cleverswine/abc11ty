const EleventyFetch = require("@11ty/eleventy-fetch");
const EleventyImage = require("@11ty/eleventy-img");
//const RSSParser = require('rss-parser');
const HTMLParser = require('node-html-parser');

module.exports = async function () {
    // let url = "https://www.etsy.com/shop/auntieboocrafts/rss";
    // let rssParser = new RSSParser();
    // let result = [];

    // let xml = await EleventyFetch(url);
    // let feed = await rssParser.parseString(xml);
    // for (let i = 0; i < feed.items.length; i++) {
    //     const item = feed.items[i];
    //     var root = HTMLParser.parse(item.content);
    //     var imageUrl = root.querySelector("img").getAttribute("src");
    //     // console.log(item);
    //     let stats = await EleventyImage(imageUrl, { widths: [240], formats: ["png"] });
    //     // console.log(stats);
    //     var x = { url: item.link, imageInfo: stats, title: item.title.replace(" by AuntieBooCrafts", ""), isoDate: item.isoDate };
    //     console.log(x);
    //     result.push(x);        
    // }
    const url = "https://www.etsy.com/shop/auntieboocrafts";
    let data = await EleventyFetch(url);
    // const data = fs.readFileSync('../abc.html', 'utf8');
    var result = [];

    var listings = HTMLParser.parse(data).querySelectorAll('a.listing-link');
    listings.forEach(async element => {
    
        var imageUrl = element.querySelector("img").getAttribute("src");
        let stats = await EleventyImage(imageUrl, { widths: [340], formats: ["png"] });
        var x = { url: element.attrs["href"], imageInfo: stats, title: element.attrs["title"], isoDate: "" };
        console.log(x);
        result.push(x);
    });

    return result;
};