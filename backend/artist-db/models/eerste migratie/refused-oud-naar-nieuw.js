import fs from "fs";
// import path from "path";

function slugify(str) {
    return String(str)
        .replaceAll(/[ÁÀÂàÂÄÃÅ]/gi, "a")
        .replaceAll(/Ç/gi, "c")
        .replaceAll(/[ÉÈÊË]/gi, "e")
        .replaceAll(/[ÍÌÎÏ]/gi, "i")
        .replaceAll(/Ñ/gi, "n")
        .replaceAll(/[ÓÒÔÖÕØ]/gi, "o")
        .replaceAll(/[ÚÙÛÜ]/gi, "u")
        .trim() // trim leading or trailing whitespace
        .toLowerCase() // convert to lowercase
        .replace(/[^a-z0-9]/g, "") // remove non-alphanumeric characters
        .replace(/\s+/g, "") // replace spaces with nothing
        .replace(/-/g, ""); // remove all hyphens
}

function controleKaraktersWeg(str) {
    if (str === null) return null;
    return str
        .replaceAll(/\u2013/g, "-")
        .replaceAll(/[\u00ad|\u2009|\u200b|\u00a0]/g, "")
        .replaceAll(/[\u2019|\u2018]/g, "'");

    // return str.replace(/[\u{0080}-\u{FFFF}]/gu, "");
}

const oudeEvents = JSON.parse(fs.readFileSync("../store/refused-OUD.json"));
const landcodesMap = JSON.parse(fs.readFileSync("../store/landcodes-map.json"));

const nieuweEvents = {};
const dateToday = 240203;
const dateTodayString = `${dateToday}`;

Object.entries(oudeEvents).forEach(([key, val]) => {
    let key2;
    const kk = controleKaraktersWeg(key);
    if (kk.length < 10) {
        key2 = kk + dateTodayString;
    } else {
        key2 = kk;
    }

    if (key2.length < 10) return; // geen halfgare records

    if (nieuweEvents[key2]) return;
    let spotify = null;

    let metalString = null;
    if (key.length < 31) {
        spotify = val?.spotifyId ?? null;
        metalString = encodeURI(kk);
        const matchLanden = kk.match(/(\(\w{2,3}\))/gi);
        if (Array.isArray(matchLanden)) {
            matchLanden.forEach((m) => {
                let land = m.replace(/\W/g, "").toUpperCase();
                const repl = RegExp(`\\(${land}\\)`, "gi");

                key2 = key2.replaceAll(repl, "").trim();
                if (land in landcodesMap) {
                    if (land.length === 3) {
                        land = landcodesMap[land];
                    }
                    metalString += `&%C%${land}`;
                }
            });
        }
        metalString = controleKaraktersWeg(metalString);
    }

    nieuweEvents[key2] = [0, spotify, metalString, null, dateToday];
    let slug = slugify(key2);
    if (slug === key2) return;
    if (nieuweEvents[slug]) return;
    if (slug.length < 10) {
        slug += dateTodayString;
    }
    nieuweEvents[slug] = [1, spotify, metalString, null, dateToday];
});

const nieuweJSON = controleKaraktersWeg(
    JSON.stringify(nieuweEvents)
).replaceAll(
    /],/g,
    `],
`
);
console.log(nieuweJSON);
fs.writeFileSync("../store/refused.json", nieuweJSON, "utf-8");

// uniqueKey: [isSlug, spotifyId, metalEncycloBandnaamEnCountries, eventDate, creationDate],
