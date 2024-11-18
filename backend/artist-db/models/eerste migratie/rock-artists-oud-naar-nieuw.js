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

const oudeEvents = JSON.parse(
    fs.readFileSync("../store/rock-artists-OUD.json")
);
const landcodesMap = JSON.parse(fs.readFileSync("../store/landcodes-map.json"));

const nieuweEvents = {};
const dateToday = 240203;
const dateTodayString = `${dateToday}`;

Object.entries(oudeEvents).forEach(([key, val]) => {
    let kk = controleKaraktersWeg(key);

    if (kk.length < 4) return; // geen halfgare records

    if (nieuweEvents[kk]) return;

    let metalString = null;

    const spotify = controleKaraktersWeg(val?.spotifyId ?? null);
    metalString = encodeURI(kk);
    const matchLanden = kk.match(/(\(\w{2,3}\))/gi);
    if (Array.isArray(matchLanden)) {
        matchLanden.forEach((m) => {
            let land = m.replace(/\W/g, "").toUpperCase();
            if (land in landcodesMap) {
                const repl = RegExp(`\\(${land}\\)`, "gi");

                kk = kk.replaceAll(repl, "").trim();
                if (land.length === 3) {
                    land = landcodesMap[land];
                }
                metalString += `&%C%${land}`;
            }
        });
    }
    metalString = controleKaraktersWeg(metalString);

    nieuweEvents[kk] = [
        0,
        spotify,
        metalString,
        val?.genres ?? [],
        null,
        dateToday
    ];
    let slug = slugify(kk);
    if (slug === kk) return;
    if (nieuweEvents[slug]) return;
    if (slug.length < 10) {
        slug += dateTodayString;
    }
    nieuweEvents[slug] = [
        1,
        spotify,
        metalString,
        val?.genres ?? [],
        null,
        dateToday
    ];
});

const nieuweJSON = JSON.stringify(nieuweEvents).replaceAll(
    /],"/g,
    `],
"`
);

fs.writeFileSync("../store/allowed-artists.json", nieuweJSON, "utf-8");
