import fs from "fs";
import shell from "./mods/shell.js";
import fsDirections from "./mods/fs-directions.js";
import { workerNames } from "./mods/worker-config.js";

/**
 * singlePageCacheCleanup
 *
 * Schoont temp/singlePages/podia op
 * Uit wordt gegaan van de draaiende workers uit worker config.
 * Indien all dan worden de folders geleegd.
 * Indien benaamd dan alleen die specifiek
 * @param {string|bool} cleanInstructions False of "all" of "paradiso%melkweg" etc
 * @returns {array} verwijderd array met strings van welke workerName hoeveel cachepaginas zijn verwijderd.
 */
function singlePageCacheCleanup(cleanInstructions) {
    const pei = fsDirections.singlePagesCache;
    const verwijderd = [];

    workerNames.forEach((workerName) => {
        if (
            cleanInstructions !== "all" &&
            !cleanInstructions.includes(workerName)
        )
            return;
        let teller = 0;
        fs.readdirSync(`${pei}/${workerName}`).forEach((file) => {
            teller = teller + 1;
            fs.rmSync(`${pei}/${workerName}/${file}`);
        });
        verwijderd.push(`${workerName} ${teller} cachepaginas`);
    });

    return verwijderd;
}

/**
 * publicEventImagesCleanup
 *
 * Schoont public/event-images/podia op
 * Uit wordt gegaan van de draaiende workers uit worker config.
 * Indien all dan worden de folders geleegd.
 * Indien benaamd dan alleen die specifiek
 * @param {string|bool} cleanInstructions False of "all" of "paradiso%melkweg" etc
 * @returns {array} verwijderd array met strings van welke workerName hoeveel images zijn verwijderd.
 */
function publicEventImagesCleanup(cleanInstructions) {
    const pei = fsDirections.publicEventImages;
    const verwijderd = [];

    workerNames.forEach((workerName) => {
        if (
            cleanInstructions !== "all" &&
            !cleanInstructions.includes(workerName)
        )
            return;
        let teller = 0;
        fs.readdirSync(`${pei}/${workerName}`).forEach((file) => {
            teller = teller + 1;
            fs.rmSync(`${pei}/${workerName}/${file}`);
        });
        verwijderd.push(`${workerName} ${teller} images`);
    });

    return verwijderd;
}

/**
 * longTextFilesCleanup
 *
 * Schoont public/texts/podia op
 * Uit wordt gegaan van de draaiende workers uit worker config.
 * Indien all dan worden de folders geleegd.
 * Indien benaamd dan alleen die specifiek
 * @param {string|bool} cleanInstructions False of "all" of "paradiso%melkweg" etc
 * @returns {array} verwijderd array met strings van welke workerName hoeveel texts zijn verwijderd.
 */
function longTextFilesCleanup(cleanInstructions) {
    const pei = fsDirections.publicTexts;
    const verwijderd = [];

    workerNames.forEach((workerName) => {
        if (
            cleanInstructions !== "all" &&
            !cleanInstructions.includes(workerName)
        )
            return;
        let teller = 0;
        fs.readdirSync(`${pei}/${workerName}`).forEach((file) => {
            teller = teller + 1;
            fs.rmSync(`${pei}/${workerName}/${file}`);
        });
        verwijderd.push(`${workerName} ${teller} texts`);
    });

    return verwijderd;
}

/**
 * baseEventsCleanup
 *
 * Schoont /temp/base event lists open.
 * Basis is wat gaat draaien volgens worker config.
 * Ten eerste worden oude verwijderd op datum.
 * Ten tweede kan met 'all' of 'paradiso' worden verwijderd.
 * @param {string|bool} cleanInstructions False of "all" of "paradiso%melkweg" etc
 * @param {string} vandaag 20250417
 * @returns {array} verwijderde bestandsnamen
 */
function baseEventsCleanup(cleanInstructions, vandaag) {
    let bestaandeBaseEventLists;
    const verwijderd = [];
    if (cleanInstructions === "all") {
        bestaandeBaseEventLists = fs.readdirSync(fsDirections.baseEventlists);
        workerNames.forEach((actieveWorkerUitConfig) => {
            const verwijder = bestaandeBaseEventLists.find((bel) => {
                return (
                    bel.includes(actieveWorkerUitConfig) ||
                    !bel.includes(vandaag)
                );
            });
            if (verwijder) {
                verwijderd.push(verwijder);
                fs.unlinkSync(`${fsDirections.baseEventlists}/${verwijder}`);
            }
        });
    }
    if (Array.isArray(cleanInstructions)) {
        bestaandeBaseEventLists = fs.readdirSync(fsDirections.baseEventlists);
        cleanInstructions.forEach((verwijderFamily) => {
            const gevonden = bestaandeBaseEventLists.find((bel) => {
                return bel.includes(verwijderFamily) || !bel.includes(vandaag);
            });
            if (gevonden) {
                verwijderd.push(gevonden);
                fs.unlinkSync(`${fsDirections.baseEventlists}/${gevonden}`);
            }
        });
    }
    return verwijderd;
}

/**
 * houseKeeping
 *
 * Kijkt naar de shell commando's zoals removeBaseEvents, removePublicEventImages, removeLongTextFiles,
 * removeSinglePageCache en stuurt dan de relevante cleaners aan.
 *
 * @returns {bool} true
 */
export default async function houseKeeping() {
    const vandaag = new Date()
        .toISOString()
        .substring(0, 10)
        .replaceAll(/-/g, "");

    const houseKeepingResults = [];
    if (shell.removeBaseEvents) {
        const rbc = baseEventsCleanup(shell.removeBaseEvents, vandaag);
        houseKeepingResults.push(rbc);
    }

    if (shell.removePublicEventImages) {
        const rbei = publicEventImagesCleanup(shell.removePublicEventImages);
        houseKeepingResults.push(rbei);
    }

    if (shell.removeLongTextFiles) {
        const rltf = longTextFilesCleanup(shell.removeLongTextFiles);
        houseKeepingResults.push(rltf);
    }

    if (shell.removeSinglePageCache) {
        const rspc = singlePageCacheCleanup(shell.removeSinglePageCache);
        houseKeepingResults.push(rspc);
    }

    console.log(`-------------------------`);
    console.group(`Housekeepings results`);
    console.log("");
    console.log(`remove base events shell: ${shell.removeBaseEvents}`);
    console.log(
        `remove public event images shell: ${shell.removePublicEventImages}`
    );
    console.log(`remove long texts shell: ${shell.removeLongTextFiles}`);
    console.log(`remove single texts shell: ${shell.removeSinglePageCache}`);
    console.log("");
    houseKeepingResults.forEach((hkr) => console.log(hkr));
    console.groupEnd();

    return true;
}
