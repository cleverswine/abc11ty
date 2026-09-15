import markdownIt from "markdown-it";

const md = markdownIt({ html: false, linkify: true, breaks: true }).disable("code");

// Description text links (e.g. "Etsy collection") should open in a new tab,
// matching every other outbound link on the site.
const defaultLinkOpen = md.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet("target", "_blank");
  tokens[idx].attrSet("rel", "noopener");
  return defaultLinkOpen(tokens, idx, options, env, self);
};

export default async function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("img");
  eleventyConfig.addPassthroughCopy("img-product");
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("js");
  eleventyConfig.addPassthroughCopy("favicon.ico");
  eleventyConfig.addPassthroughCopy("apple-touch-icon.png");

  // Renders section/item description text (which may contain markdown,
  // e.g. links) as HTML. Blank-line-separated lines become paragraphs.
  eleventyConfig.addFilter("markdown", (content) => md.render(content || ""));
};