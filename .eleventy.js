module.exports = function (eleventyConfig) {
    // Copy `img/` to `_site/img`
    eleventyConfig.addPassthroughCopy("img");
    eleventyConfig.addPassthroughCopy("css");
    eleventyConfig.addPassthroughCopy("js");

    eleventyConfig.addPassthroughCopy("favicon.ico");
    eleventyConfig.addPassthroughCopy("apple-touch-icon.png");

    // eleventyConfig.addPassthroughCopy({"node_modules/bootstrap/dist/css/bootstrap.min.css": "css/bootstrap.min.css"});
    // eleventyConfig.addPassthroughCopy({"node_modules/bootstrap/dist/js/bootstrap.min.js": "js/bootstrap.min.js"});
};