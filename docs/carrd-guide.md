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
| Etsy Items | Intro, 11 groups (99 products), "Visit shop on Etsy" button | Section with one Gallery per group, each linking to Etsy |
| Product popup | Carousel with thumbnails, Etsy purchase button | Gallery lightbox (photo + caption); link the caption or a button to Etsy |
| Footer | Copyright and Etsy trademark notice | Footer container with small Text |

Carrd features that need a paid Pro plan are flagged below; the free plan shows Carrd branding and has no custom domain or embeds.

## Design tokens

Every color below comes from `web/css/tokens.css` and `web/css/app.css`; type the hex codes into Carrd's color pickers exactly. Carrd has no shared color variables on most plans, so keep this table open while you build.

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

Each section's background is a vertical gradient: its glow color at the top fading to paper `#F1E9D8` by about 420px. In Carrd, set the section's container background to a linear gradient, 180°, glow at 0% and `#F1E9D8` at roughly 30%.

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

In Carrd, pick Fraunces from the font list for heading elements and a system or Roboto font for text elements. If Fraunces is not offered, Georgia is the site's own fallback.

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

Use **Pro Standard ($19/year)**: it is the cheapest plan with a custom domain, embeds (for the Cloudflare analytics beacon) and meta tags. Pro Lite ($9/year) only removes Carrd branding; Pro Plus ($49/year) adds password protection and site-file downloads, which this site does not need.

1. Sign in at carrd.co, choose **Create site**, and start from the blank template (keeps you from undoing a template's styles).
2. Open **Page** settings and set:
   - Background: color `#F1E9D8`.
   - Width: about 64rem (1024px) for content, with the header and sections set to full width so their backgrounds run edge to edge.
   - Default text: color `#1E170D`, system sans or Roboto, 16px, line height 1.6.
   - Links: `#1E3350` (slate-dark), underlined.
3. Open **Site** settings (Pro Standard):
   - Title: `Auntie Boo Crafts`.
   - Description: `Auntie Boo Crafts - specializing in bookmarks, hair clips, glitter pens, key chains, and badge reels.`
   - Icon: upload `web/favicon.ico` or `web/apple-touch-icon.png` (Carrd wants a square PNG).
   - Share image: the logo `web/img/logo.png` or a booth photo.
4. Add an **Embed** element (type Code, placed in Head) with the Cloudflare Web Analytics `<script>` from `web/index.html`, if you keep analytics.
5. **Publish** to a `.carrd.co` address first; connect the custom domain in Site settings once the page is checked on a phone.

Upload images at the sizes the site already uses: card thumbnails `web/content/img-product/<listingId>.webp` (340×270) and gallery photos `<listingId>-<n>.jpg` (794px). Carrd re-compresses uploads, so do not upload anything larger than about 1600px.

## Page structure

Build one scrolling page of stacked containers, top to bottom, in the order below. Do not add Section Break elements: in Carrd they turn the page into separate screens that swap, while the current site scrolls. Give each container an **ID** in its settings so the header links can jump to it (`#live-events`, `#etsy-shop`), matching the current anchors.

1. **Header** (container, full width, pinned to the top)
   - Background `#FBF7EE` at 92% opacity, shadow 0 2px 16px `#1E170D` at 7%, padding 12px × 20px, height about 76px.
   - Two columns: left, the logo (36px tall) and "Auntie Boo Crafts" in Fraunces 16px; right, a Links element with "In Person Events" and "Etsy Items", 14px, `#5A4C38`, hover `#1E170D`, 20px apart.
   - On phones, stack both columns centered.
2. **Welcome** (container, full width, centered)
   - Background `#FBF7EE`, padding 40px top, 48px bottom.
   - Logo image 220px wide; heading "Welcome to Auntie Boo Crafts!" in Fraunces 28px (22px on phones); the intro paragraph from `web/index.html` in `#5A4C38`, 15px, max width about 90 characters; the "Visit shop on Etsy" button (recipe below).
3. **In Person Events** (container, ID `live-events`, slate theme)
   - Background gradient `#AEC5E0` to `#F1E9D8`; padding 32px × 20px.
   - Title row: a map-pin icon and "In Person Events" in Fraunces 30px, weight 600, `#1E3350`.
   - Intro text (the section description in `boo.json`), 14px, `#5A4C38`.
   - Booth photo mosaic (up to 5 of the 7 photos) and its caption.
   - Event list: one card per visible event.
   - Chip row linking to each group: Composition Notebooks, Bookmarks, Hair Clips, Paperclips, Sticky Notes (chips `#CFDBEA` / `#1E3350`).
   - One product gallery per group, each under its group title.
4. **Etsy Items** (container, ID `etsy-shop`, sage theme)
   - Background gradient `#C4DBA5` to `#F1E9D8`; same padding.
   - Title row: a shopping-bag icon and "Etsy Items" in `#2E4620`.
   - Intro text with a link to the Etsy shop.
   - Chip row (chips `#DCE8CB` / `#2E4620`) for the 11 groups: Keychains, Magnets, Badge Reels, Pens, Lanyards, Teacher, Bookmarks, Hair Clips, Stickers, Digital Patterns, Christmas.
   - One product gallery per group.
   - "Visit shop on Etsy" button, centered, 24px above it.
5. **Footer** (container, centered)
   - 13px `#7C6C52` copyright line, then the Etsy trademark notice at 11px, max width about 38rem: "The term 'Etsy' is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc." That notice is required only because the current site uses the Etsy API; a hand-built Carrd page can drop it. Copyright line: "© 2026 Auntie Boo Crafts · Etsy shop · RSS", linking the shop and its `/rss` feed.

The current site draws a soft wave at the top of each themed section. Carrd cannot draw it natively; either skip it or upload a 1200×40 wave image in the glow color as the first element of each section, full width, no spacing above.

## Element recipes

Style one of each element, then duplicate it; Carrd copies an element's whole style, which is the closest it gets to a reusable component.

### "Visit shop on Etsy" button

| Setting | Value |
| --- | --- |
| Element | Buttons |
| Label | Visit shop on Etsy (the current site shows "Etsy" in bold `#F1641E`; Carrd buttons are one color, so either keep the whole label `#FBF7EE` or use an orange "Etsy" in an Embed button) |
| Link | `https://www.etsy.com/shop/AuntieBooCrafts`, open in new tab |
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
| Captions | Product title, 13px, centered, under the image |
| On click | Lightbox for hand-made items (In Person Events), with the description as caption; for Etsy items, link each image to its `etsyPage` URL instead |

Carrd's lightbox shows one image per thumbnail, so a product's extra photos are not reachable from the grid. For a product with several photos, either add them as extra images in the same gallery or link to the Etsy listing, which has every photo.

Group titles go above each gallery as a heading in Fraunces 23px, weight 600, in the section's dark color, underlined 2px in its accent (`#5F8C3E` for Etsy, `#6489C4` for events).

### Booth photo mosaic

Use a Gallery with the first booth photo large and four small (Carrd's gallery has no mixed-size layout, so the closest match is two galleries side by side in a two-column container: one image at 2/3 width, a 2×2 grid at 1/3). Max width 720px, 8px gaps, 20px radius on the large tile and 14px on the small ones, lightbox on. Put the caption under it in 13px `#7C6C52`.

### Event cards

One container per event with background `#FBF7EE`, 20px radius, the soft shadow, and padding 14px × 20px; place them in a row of up to 4 columns (about 220px each), wrapping on phones.

| Part | Style |
| --- | --- |
| Name | 14px `#1E170D`, underlined and linked when the event has a link |
| Location | 13px `#7C6C52` under the name |
| Date | 13px `#7C6C52`, right-aligned, one line |

### Chips

A Buttons element with several small buttons: fill the section's tint (`#CFDBEA` or `#DCE8CB`), text its dark color (`#1E3350` or `#2E4620`), pill radius, padding 6px × 14px, 13px. Link each to its group heading's ID (for example `#etsy-bookmarks`).

### "More … in Etsy Items" card

Where a hand-made group shares its name with an Etsy group (Bookmarks, Hair Clips), end its row with a small container: background `#DCE8CB` at 45%, 1px border `#C4DBA5`, 20px radius, centered text "More Bookmarks in Etsy Items" in Fraunces 14px `#2E4620`, linked to the Etsy group's ID.

## Content workflow and limitations

In Carrd, every product change is a manual edit and republish; nothing reads `boo.json` or Etsy. With 116 products today (99 Etsy, 17 hand-made), budget an afternoon for the first build and a few minutes per listing change after that.

| Today (11ty + admin) | In Carrd |
| --- | --- |
| "Check Etsy for changes" adds, removes and re-photographs Etsy listings | Add or remove gallery images and links by hand when the Etsy shop changes |
| Admin tool edits sections, groups, events and products, then Publish site | Edit in the Carrd builder, then Publish |
| Show/hide toggles on sections, groups, events and items | Delete the element or move it off-page; Carrd has no hide toggle per gallery image |
| Popup carousel with every photo, thumbnails and a purchase button | One lightbox image per thumbnail, caption only |
| Responsive image sizes built at deploy (240/480/720px WebP) | Carrd resizes uploads itself |
| Netlify deploy from GitHub, free | Carrd Pro Standard, $19/year, plus the domain |
| Right-click/drag deterrent on product photos | Not available without custom code (Embed) |

A middle path: keep the Etsy Items section short in Carrd (one featured gallery per group plus the "Visit shop on Etsy" button) and let Etsy be the full catalog. That cuts the upkeep to the In Person Events section, which changes rarely.

**Open question:** confirm in the builder whether Fraunces is in Carrd's font list; if not, Pro Standard allows uploading local fonts.

## Sources

- Colors, type, spacing and structure: this repo's `web/css/tokens.css`, `web/css/app.css`, `web/index.html` and `web/content/boo.json`.
- Carrd's docs at [carrd.com/docs](https://carrd.com/docs) could not be opened when this guide was written, so Carrd menu names and element options here follow Carrd's builder as generally documented; check each against the docs before building.
- Plan prices and features (Pro Lite $9, Pro Standard $19, Pro Plus $49 a year): search-result summaries of [Carrd pricing (Landingi)](https://landingi.com/carrd/pricing/) and [Carrd pricing (Secret)](https://www.joinsecret.com/carrd/pricing), not opened; confirm at carrd.co/pro.
