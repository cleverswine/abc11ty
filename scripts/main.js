const fs = require('node:fs');
const path = require('node:path');
const {createInterface} = require('node:readline');

const folderPath = "./testData";
//
// // list files and folders
// fs.readdirSync(folderPath).map(fileName => {
//     console.log(path.join(folderPath, fileName));
// });
//
// list only files
const isFile = fileName => {
    return fs.lstatSync(fileName).isFile();
};
const isNotFile = fileName => {
    return !fs.lstatSync(fileName).isFile();
};
//
fs.readdirSync(folderPath).map(folderName => {
    let sectionPath = path.join(folderPath, folderName);
    console.log("SECTION: " + folderName);
    fs.readdirSync(sectionPath).map(fileName => {
        let itemPath = path.join(sectionPath, fileName);
        console.log("- ITEM: " + itemPath);
        return itemPath;
    }).filter(isFile);
    return sectionPath;
}).filter(isNotFile);
//
// // read contents of file
// try {
//     const data = fs.readFileSync('/Users/joe/test.txt', 'utf8');
//     console.log(data);
// } catch (err) {
//     console.error(err);
// }
//
// // write file
// const content = 'Some content!';
//
// try {
//     fs.writeFileSync('/Users/joe/test.txt', content);
//     // file written successfully
// } catch (err) {
//     console.error(err);
// }
//
//
// // write json file
// const users = require("./users");
//
// let user =
//     {
//         name: "New User",
//         age: 30,
//         language: ["PHP", "Go", "JavaScript"]
//     };
//
// users.push(user);
//
// fs.writeFile(
//     "users.json",
//     JSON.stringify(users),
//     err => {
//         console.error(err);
//         console.log("Done writing");
//     });
//
// // read file line by line
// async function processLineByLine() {
//     const fileStream = createReadStream('input.txt');
//
//     const rl = createInterface({
//         input: fileStream,
//         crlfDelay: Infinity,
//     });
//     // Note: we use the crlfDelay option to recognize all instances of CR LF
//     // ('\r\n') in input.txt as a single line break.
//
//     for await (const line of rl) {
//         // Each line in input.txt will be successively available here as `line`.
//         console.log(`Line from file: ${line}`);
//     }
// }

// split string
var items = [];
const str = "Etsy: https://www.etsy.com/listing/1837178342/highland-cow-bookmark-shepherd-hook-gift";
const key = str.slice(0, str.indexOf(":"));
const value = str.slice(str.indexOf(":") + 1, str.length);
items.push({[key.trim().toLowerCase()]: value.trim()});
console.log(JSON.stringify(items));
