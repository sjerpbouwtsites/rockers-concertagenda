import fs from 'fs';
// import path from "path";

function slugify(str) {
  return String(str)
    .normalize('NFKD') // split accented characters into their base characters and diacritical marks
    .replace(/[\u0300-\u036f]/g, '') // remove all the accents, which happen to be all in the \u03xx UNICODE block.
    .trim() // trim leading or trailing whitespace
    .toLowerCase() // convert to lowercase
    .replace(/[^a-z0-9 -]/g, '') // remove non-alphanumeric characters
    .replace(/\s+/g, '') // replace spaces with hyphens
    .replace(/-+/g, '-'); // remove consecutive hyphens
}

const oudeEvents = JSON.parse(fs.readFileSync('../store/OUD-rock-events.json'));

const nieuweEvents = {};
const dateToday = 240203;
const dateTodayString = `${dateToday}`;

Object.entries(oudeEvents).forEach(([key, val]) => {
  let key2;
  if (key.length < 12) {
    key2 = key + dateTodayString;
  } else {
    key2 = key;
  }
  if (key2.length < 12) return; // geen halfgare records
  
  if (nieuweEvents[key2]) return;
  nieuweEvents[key2] = [0, null, dateToday];
  let slug = slugify(key2);
  if (slug.length < 12) {
    slug += dateTodayString;
  } 
  nieuweEvents[slug] = [1, null, dateToday];
});

const nieuweJSON = JSON.stringify(nieuweEvents).replaceAll(/],/g, `],
`);
fs.writeFileSync('../store/allowed-events.json', nieuweJSON);
