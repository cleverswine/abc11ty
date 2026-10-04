import markdownIt from "markdown-it";
import Image from "@11ty/eleventy-img";
import * as fs from "node:fs";
import * as path from "node:path";
import { BOO_PATH, CONTENT_DIR, readBoo } from "./lib/boo.js";

const md = markdownIt({ html: false, linkify: true, breaks: true }).disable("code");

// Description text links (e.g. "Etsy collection") should open in a new tab,
// matching every other outbound link on the site.
const defaultLinkOpen = md.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet("target", "_blank");
  tokens[idx].attrSet("rel", "noopener");
  return defaultLinkOpen(tokens, idx, options, env, self);
};

const escapeAttr = (s) => String(s ?? "").replace(/[&"<>]/g, (c) => ({"&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;"}[c]));

// Card-size copies of a hand-added product's photo. Product cards are
// 160-231px wide at every screen width, so with sizes="230px" a browser picks
// 240px on a standard screen, 480px on a 2x one and 720px on a 3x phone.
const CARD_IMAGE_WIDTHS = [240, 480, 720];
const CARD_IMAGE_SIZES = "230px";

export default async function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("img");
  // the content (lib/boo.js): boo.json is the `boo` global data, and its
  // photos are served at img-product/ - the paths boo.json uses
  // (no boo.json yet - e.g. a new server whose admin is still fetching the
  // content from GitHub - is an empty site, not a failed build)
  eleventyConfig.addGlobalData("boo", () => fs.existsSync(BOO_PATH) ? readBoo(BOO_PATH) : []);
  eleventyConfig.addWatchTarget(BOO_PATH);
  eleventyConfig.addPassthroughCopy({"content/img-product": "img-product"});
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("js");
  eleventyConfig.addPassthroughCopy("favicon.ico");
  eleventyConfig.addPassthroughCopy("apple-touch-icon.png");

  // Renders section/item description text (which may contain markdown,
  // e.g. links) as HTML. Blank-line-separated lines become paragraphs.
  eleventyConfig.addFilter("markdown", (content) => md.render(content || ""));

  // The <img> for a product card. A hand-added product's first photo is
  // stored at up to 1200px (see admin/server.js) and doubles as its card
  // image, so the card gets card-size WebP copies made at build time (the
  // popup still shows the full photo), with the photo's real width/height so
  // the page doesn't jump as lazy-loaded photos arrive. `asIs` keeps the file
  // as it is - for Etsy items, whose images[0] is already a small 340px
  // thumbnail.
  //   {% cardImage card_src, item.title, is_etsy %}
  // (shortcode arguments can't index arrays, hence card_src = images | first)
  eleventyConfig.addShortcode("cardImage", async function (src, alt, asIs) {
    let attrs = `class="product-card__image abc-product-img" alt="${escapeAttr(alt)}" loading="lazy" decoding="async"`;
    if (asIs || !src) return `<img src="${escapeAttr(src)}" ${attrs}/>`;
    let copies = (await Image(path.join(CONTENT_DIR, src), {
      widths: CARD_IMAGE_WIDTHS,
      formats: ["webp"],
      outputDir: path.join(eleventyConfig.directories.output, "img-card"),
      urlPath: "img-card/",
      // keep animated GIFs animated
      sharpOptions: {animated: true},
    })).webp;
    // a photo narrower than a width just gets fewer copies (never upscaled)
    let srcset = copies.map((c) => `${c.url} ${c.width}w`).join(", ");
    let fallback = copies[Math.min(1, copies.length - 1)];
    let {width, height} = copies.at(-1);
    return `<img src="${fallback.url}" srcset="${srcset}" sizes="${CARD_IMAGE_SIZES}" width="${width}" height="${height}" ${attrs}/>`;
  });
};