// gen.js - updates content/boo.json from the Auntie Boo Crafts Etsy shop, from
// the command line (e.g. for a scheduled run). The work is done by
// lib/etsy.js - see the top of that file for what a refresh does and the API
// key it needs - which the admin page's "Check Etsy for changes" button
// also uses.
//
//   node gen.js               check Etsy for changes and apply them (only new
//                             or changed photos are downloaded)
//   node gen.js --skip-fetch  don't contact Etsy; just re-merge/normalize
//                             the Etsy section of boo.json
//   node gen.js --item <url>  refresh just one listing, re-downloading its
//                             photos (adding it to the top of its category if
//                             it's new)

import { etsyApiKey, rebuildEtsySection, refreshListing, refreshShop } from './lib/etsy.js';

const skipFetch = process.argv.includes('--skip-fetch');
const itemFlag = process.argv.indexOf('--item');
const itemUrl = itemFlag === -1 ? null : process.argv[itemFlag + 1];
if (itemFlag !== -1 && (!itemUrl || itemUrl.startsWith('--'))) {
    console.log('--item needs a listing URL, e.g. node gen.js --item https://www.etsy.com/listing/1234567890/...');
    process.exit(1);
}
if (itemUrl && skipFetch) {
    console.log("--item and --skip-fetch can't be used together");
    process.exit(1);
}

if (skipFetch) {
    console.log('--skip-fetch passed, re-merging the Etsy items already in content/boo.json instead of contacting Etsy');
    rebuildEtsySection();
    process.exit(0);
}

const apiKey = etsyApiKey();
if (!apiKey) {
    console.log('Set ETSY_KEYSTRING and ETSY_SHARED_SECRET (see the top of lib/etsy.js) - or use --skip-fetch.');
    process.exit(1);
}

try {
    if (itemUrl) {
        let result = await refreshListing({apiKey, url: itemUrl});
        if (!result.ok) {
            console.log(`${result.message}\ncontent/boo.json not changed`);
            process.exitCode = 1;
        }
    } else {
        await refreshShop({apiKey});
    }
} catch (e) {
    console.log(`\n${e.message}\ncontent/boo.json not changed`);
    process.exitCode = 1;
}
