# Building Auntie Boo Crafts in Carrd

Oct 7, 2026

## Overview

The Auntie Boo Crafts site can be rebuilt in Carrd as one long page: a sticky header, a centered welcome block, and two themed sections (In Person Events in slate blue, Etsy Items in sage green). Carrd is a one-page builder, which matches the current site, but you lose the automatic Etsy sync: products become hand-placed images and links.

What the current `web/` site renders, from `web/content/boo.json` as of today:

| Part | Current site | Carrd equivalent |
| --- | --- | --- |
| Header | Logo, name, links to each section | Header container, pinned, with a Links element |
| Welcome (hero) | Logo, "Welcome to Auntie Boo Crafts!", intro text, Etsy button | Container with Image, Text and Buttons elements |
| In Person Events | Intro, 7 booth photos, 3 events, 5 groups (17 products) | Section with a Gallery, Table or Text list, and one Gallery per group |
| Etsy Items | Intro, 11 groups (99 products), "Visit shop on Etsy" button | Section with one Gallery per group, each linking to Etsy; or a short section of category tiles and a few featured items (see Lighter Etsy section) |
| Product popup | Carousel with thumbnails, Etsy purchase button | Gallery lightbox (photo + caption); link the caption or a button to Etsy |
| Footer | Copyright and Etsy trademark notice | Footer container with small Text |

Carrd features that need a paid Pro plan are flagged below. The free plan shows "Made with Carrd" branding, caps the number of elements, and has no custom domain, embeds or analytics. Every Pro plan can be tried free for 7 days without a card, which is enough to build and check the page before paying.

## Design tokens

Every color below comes from `web/css/tokens.css` and `web/css/app.css`; type the hex codes into Carrd's color pickers exactly. Carrd has no color variables (its Variables feature, Pro Plus only, inserts text and URLs, not styles), so keep this table open while you build and use **Element Styles** to share a look between elements (see Element recipes).

### Colors

| Token | Hex | Used for |
| --- | --- | --- |
| ink | `#1E170D` | Body text, headings, the Etsy button's fill |
| paper | `#F1E9D8` | Page background |
| surface | `#FBF7EE` | Header, welcome block, cards, popups; button text on ink |
| text-secondary | `#5A4C38` | Intro paragraphs, nav links |
| text-muted | `#7C6C52` | Captions, event dates and locations, footer |
| sage | `#5F8C3E` | Etsy section accent (underlines, icons) |
| sage-tint | `#DCE8CB` | Etsy section chips, "More …" card hover |
| sage-glow | `#C4DBA5` | Etsy section background (top of gradient) |
| sage-dark | `#2E4620` | Etsy section titles, chip text |
| periwinkle | `#6489C4` | Events section accent (underlines) |
| slate | `#3E5A82` | Active thumbnail border |
| slate-tint | `#CFDBEA` | Events section chips |
| slate-glow | `#AEC5E0` | Events section background (top of gradient) |
| slate-dark | `#1E3350` | Events section titles, chip text, links in intros |
| etsy-orange | `#F1641E` | The word "Etsy" on buttons (bold), focus ring |

Each section's background is a vertical gradient: its glow color at the top fading to paper `#F1E9D8` by about 420px. In Carrd, set the section's container background to a gradient, top to bottom, from the glow color to `#F1E9D8`. Carrd's gradients are two-color, so you may not be able to set where the fade ends; if the whole container fades evenly, it still reads close enough.

### Contrast checks

The pairs the site relies on all pass WCAG AA (4.5:1) for normal text:

| Text on background | Ratio |
| --- | --- |
| ink on paper | 14.7:1 |
| text-secondary on paper | 6.9:1 |
| text-muted on surface | 4.8:1 |
| text-muted on paper | 4.2:1 (AA for large text only, so keep muted text on surface or make it bigger) |
| sage-dark on sage-glow | 7.0:1 |
| slate-dark on slate-glow | 7.2:1 |
| etsy-orange on ink | 5.6:1 |

Do not put the orange "Etsy" word on any button color other than ink.

### Type

| Role | Font | Weight | Size (desktop) |
| --- | --- | --- | --- |
| Headings, site name, "+N" photo badge | Fraunces (Google Font), fallback Georgia | 500; section titles 600 | Section title 1.9rem (~30px); group title 1.45rem (~23px); welcome title 1.75rem (~28px) |
| Body | System sans: -apple-system, Segoe UI, Roboto | 400 | 16px, line height 1.6 |
| Intros | Body font | 400 | 0.9rem (~14px) |
| Product names, chips, captions | Body font | 400 | 0.8–0.85rem (~13px) |
| Footer notice | Body font | 400 | 0.7rem (~11px) |

In Carrd, pick Fraunces from the font list for heading elements and a system or Roboto font for text elements. If Fraunces is not offered, Georgia is the site's own fallback. Carrd's fonts come from Google Fonts; Pro Standard's **Serve fonts locally** option (Publish → Settings → Options) only hosts those same fonts on your site instead of Google's, it does not let you upload a font.

### Shape and spacing

| Token | Value | Carrd setting |
| --- | --- | --- |
| Soft radius | 20px | Corner radius on cards, images, galleries, containers |
| Small radius | 14px | Section photo tiles and popup images |
| Pill radius | 999px (fully round) | Buttons and chips |
| Soft shadow | 0 4px 14px, `#1E170D` at 10% | Image and card shadow |
| Lift shadow | 0 10px 24px, `#1E170D` at 16% | Hover shadow (where Carrd allows hover styles) |
| Section padding | 2rem × 1.25rem (32px × 20px) | Container padding |
| Header height | 76px | Header container height |
| Product grid | Cards at least 160px wide, 24px row gap, 18px column gap; 2 per row on phones | Gallery thumbnail size and spacing |

## Site setup

Use **Pro Standard ($19/year)**: it is the cheapest plan with a custom domain, embeds, analytics and meta tags. What each plan adds, per Carrd's plan page:

| Plan | Price | What matters for this site |
| --- | --- | --- |
| Free | $0 | Carrd branding, element limit, `.carrd.co` address only |
| Pro Lite | $9/year | 3 sites, no branding, no element limit, site icon and share image, images up to 16MB. No custom domain, embeds or analytics |
| Pro Standard | $19/year | 10 sites, plus custom domain with SSL, embeds (custom code), analytics, meta tags, serve fonts locally |
| Pro Plus | $49/year | 25 sites, plus advanced settings (fixed element IDs, custom classes, custom CSS, JS events), password protection, redirects, variables, site download |

Pro Plus is only worth it if you want the pinned header or exact styling through custom CSS (see Page structure).

1. Sign in at carrd.co, choose **Create site**, and start from the blank template (keeps you from undoing a template's styles).
2. Select the **Page** element and set:
   - Width: about 64rem (1024px) for content, with the header and sections set to full width so their backgrounds run edge to edge.
   - Default text: color `#1E170D`, system sans or Roboto, 16px, line height 1.6.
   - Links: `#1E3350` (slate-dark), underlined.
3. Select the **Background** element and set it to Solid Color `#F1E9D8` (it also offers Gradient, Image, Video and Slideshow; the gradients belong on the section containers instead).
4. Click **Publish** and set:
   - **Title**: `Auntie Boo Crafts`.
   - **Description**: `Auntie Boo Crafts - specializing in bookmarks, hair clips, glitter pens, key chains, and badge reels.`
   - On the **Media** tab (Pro Lite and up): **Icon** → Upload `web/apple-touch-icon.png` (a square PNG; crop in the dialog and click **Accept**), and **Share Image** → Upload the logo `web/img/logo.png` or a booth photo. A changed share image can take up to 24 hours to show where the link was already shared.
   - Click **Publish Changes**.
5. Analytics (Pro Standard): Carrd connects Cloudflare Web Analytics itself, so you do not need to paste the beacon `<script>` from `web/index.html`. On the Dashboard's **Sites** tab, click the site's **Manage** icon → **Analytics** → **Select Provider** → **Cloudflare Web Analytics** → **Enable**. Carrd's own cookie-free analytics is the other option.
6. Publish to a `.carrd.co` address first. Once the page is checked on a phone, connect the domain (Pro Standard): **Publish** → set **Action** to **Publish to a custom domain** → enter the domain exactly as you want it shown (`domain.ext` or `www.domain.ext`). At your domain registrar, add the records the publish panel shows: an **A** record for `@` pointing to the IP address Carrd gives, and a **CNAME** for `www` pointing to the bare domain. The form you didn't pick redirects to the one you did. Click **Publish Changes**; the domain shows "(initializing)" for up to an hour, then works over SSL. Remove the Netlify DNS records for the domain at the same time.

Upload images at the sizes the site already uses: card thumbnails `web/content/img-product/<listingId>.webp` (340×270) and gallery photos `<listingId>-<n>.jpg` (794px). Carrd accepts images up to 16MB on Pro plans and re-compresses them, so do not upload anything larger than about 1600px.

## Page structure

Build one scrolling page of stacked containers, top to bottom, in the order below. Do not add Section Break elements (Control element, Type **Section Break**): in Carrd they split the page into named sections that are switched between like separate pages, while the current site scrolls. For the same reason skip **Header Marker** and **Footer Marker** controls; they exist to repeat a header or footer on every section, and this page has only one.

Header links jump down the page through **Scroll Points**, not element IDs (fixed IDs need Pro Plus's advanced settings). To add one: **Add Element** → **Control** → set **Type** to **Scroll Point** → give it a **Name** of lowercase letters, numbers and hyphens → drag it to just above the container it marks. Link to it with `#name`. Use the current anchors, so old links keep working: `live-events` and `etsy-shop`, plus one per group for the chips (see Chips).

1. **Header** (container, full width)
   - Background `#FBF7EE` at 92% opacity, shadow 0 2px 16px `#1E170D` at 7%, padding 12px × 20px, height about 76px.
   - Container **Type** set to **Columns** (it starts with two of equal width; widths can go as low as 20%): left, the logo (36px tall) and "Auntie Boo Crafts" in Fraunces 16px; right, a Links element with "In Person Events" (`#live-events`) and "Etsy Items" (`#etsy-shop`), 14px, `#5A4C38`, hover `#1E170D`, 20px apart.
   - Columns stack on phones automatically. To center them, open the container's **Appearance**, switch **Mobile** from **Auto** to **Manual** and set the alignment; settings left at Auto stay automatic.
   - Pinning: Carrd's docs describe no "stick to top" setting, so on Pro Standard the header scrolls away (the current site's stays put). On Pro Plus, the element's **Settings** tab can give it a custom class and custom CSS such as `position: sticky; top: 0; z-index: 10` - check it on the published site, since Carrd's page wrapper may stop sticky from working.
2. **Welcome** (container, full width, centered)
   - Background `#FBF7EE`, padding 40px top, 48px bottom.
   - Logo image 220px wide; heading "Welcome to Auntie Boo Crafts!" in Fraunces 28px (22px on phones); the intro paragraph from `web/index.html` in `#5A4C38`, 15px, max width about 90 characters; the "Visit shop on Etsy" button (recipe below).
3. **In Person Events** (container, ID `live-events`, slate theme)
   - Scroll Point `live-events` just above it.
   - Background gradient `#AEC5E0` to `#F1E9D8`; padding 32px × 20px.
   - Title row: a map-pin icon and "In Person Events" in Fraunces 30px, weight 600, `#1E3350`.
   - Intro text (the section description in `boo.json`), 14px, `#5A4C38`.
   - Booth photo mosaic (up to 5 of the 7 photos) and its caption.
   - Event list: one card per visible event.
   - Chip row linking to each group: Composition Notebooks, Bookmarks, Hair Clips, Paperclips, Sticky Notes (chips `#CFDBEA` / `#1E3350`).
   - One product gallery per group, each under its group title.
4. **Etsy Items** (container, ID `etsy-shop`, sage theme)
   - Scroll Point `etsy-shop` just above it.
   - Background gradient `#C4DBA5` to `#F1E9D8`; same padding.
   - Title row: a shopping-bag icon and "Etsy Items" in `#2E4620`.
   - Intro text with a link to the Etsy shop. Text elements take Carrd's Markdown: `[Etsy shop](https://www.etsy.com/shop/AuntieBooCrafts||blank)` makes a link that opens in a new tab, and `**Etsy**` bolds a word.
   - Chip row (chips `#DCE8CB` / `#2E4620`) for the 11 groups: Keychains, Magnets, Badge Reels, Pens, Lanyards, Teacher, Bookmarks, Hair Clips, Stickers, Digital Patterns, Christmas.
   - One product gallery per group.
   - "Visit shop on Etsy" button, centered, 24px above it.
5. **Footer** (container, centered)
   - 13px `#7C6C52` copyright line, then the Etsy trademark notice at 11px, max width about 38rem: "The term 'Etsy' is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc." That notice is required only because the current site uses the Etsy API; a hand-built Carrd page can drop it. Copyright line: "© 2026 Auntie Boo Crafts · Etsy shop · RSS", linking the shop and its `/rss` feed.

The current site draws a soft wave at the top of each themed section. Carrd cannot draw it natively; either skip it or upload a 1200×40 wave image in the glow color as the first element of each section, full width, no spacing above.

## Element recipes

Style one of each element, then save its look as an **Element Style**: select it → **Appearance** → the style dropdown at the top right of the panel → **Add Style** (rename it with the **Edit** icon, e.g. "Product gallery"). On every later element of the same type, pick that style from the same dropdown. Changing any linked element's appearance then changes them all, which is the closest Carrd gets to a reusable component; deleting a style leaves the elements looking the same but unlinked.

Link fields take a few Carrd-specific forms used below: append `||blank` to open a URL in a new tab (`https://www.etsy.com/shop/AuntieBooCrafts||blank`), and `#name` jumps to a Scroll Point.

### "Visit shop on Etsy" button

| Setting | Value |
| --- | --- |
| Element | Buttons |
| Label | Visit shop on Etsy (the current site shows "Etsy" in bold `#F1641E`; Carrd's Markdown, including `[Etsy]{#F1641E}` colored text, works in Text, Gallery captions, Lists and Tables but not button labels, so either keep the whole label `#FBF7EE` or build the button in an Embed) |
| Link | `https://www.etsy.com/shop/AuntieBooCrafts||blank` |
| Fill / text | `#1E170D` / `#FBF7EE` |
| Shape | Corner radius fully round (pill), padding 10px × 24px, 14px weight 500 |
| Icon | External-link arrow, after the label |
| Hover | Keep the colors; add a lift shadow 0 10px 24px `#1E170D` at 16% if offered |

### Product gallery (one per group)

| Setting | Value |
| --- | --- |
| Element | Gallery, grid style |
| Images | Each product's card image (Etsy thumbnails `<listingId>.webp`; hand-made items their first photo) |
| Columns | 5–6 on desktop (cards about 160–180px), 2 on phones |
| Spacing | 18px |
| Corners / shadow | 20px radius; soft shadow 0 4px 14px `#1E170D` at 10% |
| Captions | Product title, 13px, centered, under the image. Captions take Markdown, so an Etsy item's caption can carry its link: `[Name](https://www.etsy.com/listing/…||blank)` |
| On click | Lightbox for hand-made items (In Person Events), with the description as caption; for Etsy items, link each image to its `etsyPage` URL with `||blank` instead |

Carrd's lightbox shows one image per thumbnail, so a product's extra photos are not reachable from the grid. For a product with several photos, either add them as extra images in the same gallery or link to the Etsy listing, which has every photo.

Group titles go above each gallery as a heading in Fraunces 23px, weight 600, in the section's dark color, underlined 2px in its accent (`#5F8C3E` for Etsy, `#6489C4` for events).

### Booth photo mosaic

Use a Gallery with the first booth photo large and four small (Carrd's gallery has no mixed-size layout, so the closest match is two galleries side by side in a Columns container: one image in a column about 67% wide, a 2×2 grid in one about 33%). Max width 720px, 8px gaps, 20px radius on the large tile and 14px on the small ones, lightbox on. Put the caption under it in 13px `#7C6C52`.

### Event cards

One container per event with background `#FBF7EE`, 20px radius, the soft shadow, and padding 14px × 20px, saved as an Element Style. Place them in a Columns container, one column each (Carrd allows up to 5, so the 3 events fit in one row); they stack on phones.

| Part | Style |
| --- | --- |
| Name | 14px `#1E170D`, underlined and linked when the event has a link |
| Location | 13px `#7C6C52` under the name |
| Date | 13px `#7C6C52`, right-aligned, one line |

### Chips

A Buttons element with several small buttons: fill the section's tint (`#CFDBEA` or `#DCE8CB`), text its dark color (`#1E3350` or `#2E4620`), pill radius, padding 6px × 14px, 13px. Put a Scroll Point above each group heading and link each chip to it (for example Scroll Point `etsy-bookmarks`, link `#etsy-bookmarks`). Scroll Point names must be unique, so prefix them by section: `events-bookmarks` and `etsy-bookmarks`.

### "More … in Etsy Items" card

Where a hand-made group shares its name with an Etsy group (Bookmarks, Hair Clips), end its row with a small container: background `#DCE8CB` at 45%, 1px border `#C4DBA5`, 20px radius, centered text "More Bookmarks in Etsy Items" in Fraunces 14px `#2E4620`, linked to the Etsy group's Scroll Point (`#etsy-bookmarks`).

### Custom code (Embed)

Anything Carrd can't do natively goes in an **Embed** element (Pro Standard): set **Type** to **Code** and either **Style** **Inline** (the code appears where the element sits) or **Hidden** with a placement of **Head**, **Body Top** or **Body End**. Embeds show nothing in the builder, so publish to see them. Two uses here:

- The right-click/drag deterrent from `web/js/app.js`, adapted to Carrd's markup, in a Hidden embed at Body End.
- A `<style>` block for touches Carrd's settings lack (the hover lift shadow, the section waves). Without Pro Plus's custom classes there is no stable way to target one element, so keep such CSS to page-wide rules.

## Lighter Etsy section (no mirroring)

Instead of copying all 99 Etsy listings, the Etsy Items section can show what the shop sells and send people to Etsy for the rest. Etsy stays the full catalog, and this section changes only a few times a year. It replaces the per-group galleries and chips in **Etsy Items** (Page structure, item 4); the title row, intro and sage theme stay the same.

The idea behind it: links to individual listings break when an item sells out or expires, but links to the shop and its sections keep working. So build the section mostly from section links, and keep listing links few and long-lived.

### Layout, top to bottom

1. **Title and intro**, as before. End the intro with a reason to visit the shop, e.g. "New items are added every week. Follow the shop on Etsy to see them first."
2. **Shop by category**: one Gallery of category tiles (recipe below), one tile per Etsy shop section.
3. **Featured** (optional): one Gallery of 4 hand-picked items, or a seasonal set (Christmas now, Teacher in August), each linking to its listing.
4. **"See all 99 items on Etsy"** button, centered and larger than the header's: the "Visit shop on Etsy" button recipe with padding 14px × 32px and 16px text. Update the count when you swap the featured items, or leave the number out.

With Scroll Point `etsy-shop` above it, the header link works as before. Remove the `etsy-…` Scroll Points and chips, and point the "More … in Etsy Items" cards in In Person Events at the matching Etsy section instead (table below): "More Bookmarks on Etsy", linked with `||blank`.

### Category tiles

A Gallery with the product gallery's style (20px radius, soft shadow, caption under the image), with columns set so the tiles are about 200px wide (4 across on desktop, 2 on phones). Each tile:

- **Image**: one good product photo from that section. The listed thumbnails are the first item in each group today, `web/content/img-product/<file>`; pick a better one if you like, at the same 340×270 crop so the tiles line up.
- **Caption**: the section name, 14px, optionally with the item count in muted text: `Keychains [18 items]{#7C6C52}`. Counts go out of date, so leave them off if you won't update them.
- **Link**: the Etsy shop section URL with `||blank`.

Etsy shop sections (from the Etsy API, Oct 6, 2026; ids don't change when a section is renamed):

| Section | Active listings | Link | Thumbnail today |
| --- | --- | --- | --- |
| Keychains | 18 | `https://www.etsy.com/shop/AuntieBooCrafts?section_id=38581786` | `4584562223.webp` |
| Badge Reels | 17 | `https://www.etsy.com/shop/AuntieBooCrafts?section_id=38744312` | `1899652821.webp` |
| Lanyards | 15 | `https://www.etsy.com/shop/AuntieBooCrafts?section_id=39028304` | `1863088007.webp` |
| Hair Clips | 10 | `https://www.etsy.com/shop/AuntieBooCrafts?section_id=51285496` | `1892554727.webp` |
| Stickers | 8 | `https://www.etsy.com/shop/AuntieBooCrafts?section_id=53050376` | `4588710139.webp` |
| Magnets | 7 | `https://www.etsy.com/shop/AuntieBooCrafts?section_id=38688549` | `1391505298.webp` |
| Bookmarks | 7 | `https://www.etsy.com/shop/AuntieBooCrafts?section_id=45394178` | `1676189134.webp` |
| Pens | 6 | `https://www.etsy.com/shop/AuntieBooCrafts?section_id=38892123` | `1263043610.webp` |
| Digital Patterns | 5 | `https://www.etsy.com/shop/AuntieBooCrafts?section_id=53305770` | `1887458996.webp` |
| Christmas | 5 | `https://www.etsy.com/shop/AuntieBooCrafts?section_id=39703262` | `1616617091.webp` |
| Teacher | 1 | `https://www.etsy.com/shop/AuntieBooCrafts?section_id=39712299` | `1684881131.webp` |

The shop also has three empty sections (Backpack & Purse, Can Wraps, Composition Notebooks); leave them out until they have listings. The table is sorted by size; 8 tiles (Keychains through Pens) make two even rows of 4, with Digital Patterns, Christmas and Teacher covered by the featured row and the "See all" button. Click each link once after publishing to confirm it opens the right section.

### Featured items

A second Gallery, same style, 4 tiles in one row (2×2 on phones):

- Pick items that are always in stock (made to order, or several in stock) so their links stay good. Seasonal items work if you swap them out after the season.
- **Caption**: the product name linked to its listing, `[Glitter Pen](https://www.etsy.com/listing/<id>||blank)`. Each item's listing URL is its `etsyPage` in `web/content/boo.json`.
- **Image**: its thumbnail, `web/content/img-product/<listingId>.webp`, linked to the same URL.
- Give the gallery a heading that says why these items are there: "Favorites", or "For the holidays".

### Upkeep

| When | What to do |
| --- | --- |
| Each season, or when a featured item sells out | Swap the featured gallery's images and links; update the "See all" count |
| A new Etsy section has listings | Add a tile, with its link from the section's page on Etsy (the `section_id=` in its URL) |
| A section is emptied or deleted | Remove its tile |
| Otherwise | Nothing; new and sold items only change Etsy |

## Content workflow and limitations

In Carrd, every product change is a manual edit and republish; nothing reads `boo.json` or Etsy. With 116 products today (99 Etsy, 17 hand-made), budget an afternoon for the first build and a few minutes per listing change after that.

| Today (11ty + admin) | In Carrd |
| --- | --- |
| "Check Etsy for changes" adds, removes and re-photographs Etsy listings | Add or remove gallery images and links by hand when the Etsy shop changes |
| Admin tool edits sections, groups, events and products, then Publish site | Edit in the Carrd builder, then Publish |
| Show/hide toggles on sections, groups, events and items | Delete the element or move it off-page; Carrd has no hide toggle per gallery image |
| Popup carousel with every photo, thumbnails and a purchase button | One lightbox image per thumbnail, caption only (captions can hold a link) |
| Responsive image sizes built at deploy (240/480/720px WebP) | Carrd resizes uploads itself |
| Netlify deploy from GitHub, free | Carrd Pro Standard, $19/year, plus the domain |
| Cloudflare Web Analytics beacon in the template | Carrd's built-in Cloudflare Web Analytics connection |
| Right-click/drag deterrent on product photos | Not available without custom code (Embed) |
| Content in git; any version can be restored | No version history in the docs; Pro Plus can download the site as HTML/CSS/JS for a backup |

To avoid most of this upkeep, use the lighter Etsy section below instead of mirroring the shop.

**Open questions** (not covered by Carrd's docs; check in the builder, ideally during the 7-day trial):

- Whether Fraunces is in Carrd's font list. If not, use Georgia; loading Fraunces through an Embed `<style>` is possible but needs custom classes (Pro Plus) to apply it to just the headings.
- What the Gallery element offers: grid columns, lightbox, per-image links and captions. The docs confirm galleries have captions (with Markdown) and per-image click events, but have no Gallery article.
- Whether a container's background can be a gradient, or only the page's Background element.
- The free plan's element limit; Pro removes it, so it only matters while trying things out on Free.

## Sources

- Etsy shop section ids and listing counts: the Etsy Open API (`/shops/{id}/sections`), Oct 6, 2026.
- Colors, type, spacing and structure: this repo's `web/css/tokens.css`, `web/css/app.css`, `web/index.html` and `web/content/boo.json`.
- Carrd's docs, read Oct 6, 2026:
  - Plans and prices: [Plans](https://carrd.com/docs/pro/plans), [Trial](https://carrd.com/docs/pro/trial).
  - Building: [Using Sections](https://carrd.com/docs/building/using-sections), [Setting up a Section](https://carrd.com/docs/building/setting-up-a-section), [Adding a Header](https://carrd.com/docs/building/adding-a-header), [Adding a Footer](https://carrd.com/docs/building/adding-a-footer), [Using Scroll Points](https://carrd.com/docs/building/using-scroll-points), [URL Types](https://carrd.com/docs/building/url-types), [Organizing Elements into Columns](https://carrd.com/docs/building/organizing-elements-into-columns), [Optimizing Elements for Mobile](https://carrd.com/docs/building/optimizing-elements-for-mobile), [Using Element Styles](https://carrd.com/docs/building/using-element-styles), [Background Element](https://carrd.com/docs/building/background-element), [Formatting with Markdown](https://carrd.com/docs/building/formatting-with-markdown), [Embedding Custom Code](https://carrd.com/docs/building/embedding-custom-code), [Using Advanced Settings](https://carrd.com/docs/building/using-advanced-settings), [Using Variables](https://carrd.com/docs/building/using-variables).
  - Sites: [Changing a Title or Description](https://carrd.com/docs/sites/changing-a-title-and-description), [Adding a Site Icon](https://carrd.com/docs/sites/adding-a-site-icon), [Adding a Share Image](https://carrd.com/docs/sites/adding-a-share-image), [Setting up Site Analytics](https://carrd.com/docs/sites/setting-up-site-analytics), [Using a Custom Domain](https://carrd.com/docs/sites/using-a-custom-domain), [Serving Fonts Locally](https://carrd.com/docs/sites/serving-fonts-locally).
- Carrd's docs have no article on individual content elements (Gallery, Buttons, Links, Container styling), so those settings follow the builder as generally known; see Open questions.
