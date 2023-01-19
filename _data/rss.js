const EleventyFetch = require("@11ty/eleventy-fetch");
const EleventyImage = require("@11ty/eleventy-img");
const RSSParser = require('rss-parser');
const HTMLParser = require('node-html-parser');

module.exports = async function () {
    let url = "https://www.etsy.com/shop/auntieboocrafts/rss";
    let rssParser = new RSSParser();
    let result = [];

    let xml = await EleventyFetch(url);
    let feed = await rssParser.parseString(xml);
    for (let i = 0; i < feed.items.length; i++) {
        const item = feed.items[i];
        var root = HTMLParser.parse(item.content);
        var imageUrl = root.querySelector("img").getAttribute("src");
        // console.log(item);
        let stats = await EleventyImage(imageUrl, { widths: [240], formats: ["png"] });
        // console.log(stats);
        var x = { url: item.link, imageInfo: stats, title: item.title.replace(" by AuntieBooCrafts", ""), isoDate: item.isoDate };
        // console.log(x);
        result.push(x);        
    }
    return result;
};

//   https://i.etsystatic.com/36256941/r/il/6e3d42/4146019462/il_570xN.4146019462_qgza.jpg
//   {
//     webp: [
//       {
//         format: 'webp',
//         width: 570,
//         height: 760,
//         url: '/img/9rUGiEVYQt-570.webp',
//         sourceType: 'image/webp',
//         srcset: '/img/9rUGiEVYQt-570.webp 570w',
//         filename: '9rUGiEVYQt-570.webp',
//         outputPath: 'img/9rUGiEVYQt-570.webp',
//         size: 71538
//       }
//     ]
//   }