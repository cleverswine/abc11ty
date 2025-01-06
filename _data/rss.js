const EleventyFetch = require("@11ty/eleventy-fetch");
const EleventyImage = require("@11ty/eleventy-img");
const RSSParser = require('rss-parser');
const HTMLParser = require('node-html-parser');

module.exports = async function () {
    // await EleventyImage("https://i.etsystatic.com/36256941/r/il/0274f0/6504511696/il_600x600.6504511696_99t6.jpg", { widths: [200], heights: [150], formats: ["png"]});
    // await EleventyImage("https://i.etsystatic.com/36256941/r/il/248c20/6454725092/il_600x600.6454725092_skcg.jpg", { widths: [200], formats: ["png"]});
    // await EleventyImage("https://i.etsystatic.com/36256941/r/il/fc7804/6094621468/il_600x600.6094621468_stur.jpg", { widths: [200], formats: ["png"]});
    // await EleventyImage("https://i.etsystatic.com/36256941/c/860/845/0/0/il/6b85b8/5616505301/il_600x600.5616505301_n5yd.jpg", { widths: [200], formats: ["png"]});
    // await EleventyImage("https://i.etsystatic.com/36256941/c/949/754/0/397/il/edf0fa/4870710569/il_600x600.4870710569_cwsx.jpg", { widths: [200], formats: ["png"]});

    let url = "https://www.etsy.com/shop/auntieboocrafts/rss";
    let rssParser = new RSSParser();
    let result = [];

    let xml = await EleventyFetch(url);
    let feed = await rssParser.parseString(xml);
    for (let i = 0; i < feed.items.length; i++) {
        if(i > 8) break;
        const item = feed.items[i];
        var root = HTMLParser.parse(item.content);
        var imageUrl = root.querySelector("img").getAttribute("src");
        let stats = await EleventyImage(imageUrl, { widths: [340], formats: ["png"] });
        var x = { url: item.link, imageInfo: stats, title: item.title.replace(" by AuntieBooCrafts", ""), isoDate: item.isoDate };
        console.log(x);
        result.push(x);        
    }

    // let url = "https://www.etsy.com/shop/auntieboocrafts";
    // let data = await EleventyFetch(url);
    // // const data = fs.readFileSync('../abc.html', 'utf8');
    // let result = [];

    // let listings = HTMLParser.parse(data).querySelectorAll('a.listing-link');
    // console.log("items found:");
    // console.log(listings.length);
    // for (let i = 0; i < listings.length; i++) {
    //     let element = listings[i];    
    //     let imageUrl = element.querySelector("img").getAttribute("src");
    //     let stats = await EleventyImage(imageUrl, { widths: [340], formats: ["png"] });
    //     let x = { url: element.attrs["href"], imageInfo: stats, title: element.attrs["title"], isoDate: "" };
    //     //console.log(x);
    //     result.push(x);
    // }

    return result;
};