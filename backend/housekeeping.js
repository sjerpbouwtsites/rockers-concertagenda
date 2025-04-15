import fs from "fs";
import shell from "./mods/shell.js";
import fsDirections from "./mods/fs-directions.js";
import { workerNames } from "./mods/worker-config.js";

/**
 * HouseKeeping
 *
 * schoont base events, public event images, html text files en single page cache op.
 *
 */
export default class HouseKeeping {
    vandaag = null;
    houseKeepingResults = [];

    constructor() {
        this.zetVandaag();
    }

    zetVandaag() {
        this.vandaag = new Date()
            .toISOString()
            .substring(0, 10)
            .replaceAll(/-/g, "");
    }

    /**
     * init
     *
     * Gaat door de relevante shell scripts heen en stuurt de relevante cleaners aan.
     */
    init() {
        if (shell.removeBaseEvents) {
            const rbc = this.baseEventsCleanup(shell.removeBaseEvents);
            this.houseKeepingResults.push(rbc);
        }

        if (shell.removePublicEventImages) {
            const rbei = this.publicEventImagesCleanup(
                shell.removePublicEventImages
            );
            this.houseKeepingResults.push(rbei);
        }

        if (shell.removeLongTextFiles) {
            const rltf = this.longTextFilesCleanup(shell.removeLongTextFiles);
            this.houseKeepingResults.push(rltf);
        }

        if (shell.removeSinglePageCache) {
            const rspc = this.singlePageCacheCleanup(
                shell.removeSinglePageCache
            );
            this.houseKeepingResults.push(rspc);
        }
    }

    /**
     * Report
     *
     * consoled de resultaten van de housekeeping.
     */
    report() {
        console.log(`-------------------------`);
        console.group(`Housekeepings results`);
        console.log("");
        console.log(`remove base events shell: ${shell.removeBaseEvents}`);
        console.log(
            `remove public event images shell: ${shell.removePublicEventImages}`
        );
        console.log(`remove long texts shell: ${shell.removeLongTextFiles}`);
        console.log(
            `remove single texts shell: ${shell.removeSinglePageCache}`
        );
        console.log("");
        this.houseKeepingResults.forEach(
            (hkr) => hkr.length && console.log(hkr)
        );
        console.log("TODO: artist-db backups opschonen");
        console.log("------------------------------");
        console.groupEnd();
    }

    /**
     *
     * baseEventsCleanup
     *
     * Schoont /temp/base event lists open.
     * Basis is wat gaat draaien volgens worker config.
     * Ten eerste worden oude verwijderd op datum.
     * Ten tweede kan met 'all' of 'paradiso' worden verwijderd.
     * @param {string|bool} cleanInstructions False of "all" of "paradiso%melkweg" etc
     * @returns {array} verwijderde bestandsnamen
     */
    baseEventsCleanup(cleanInstructions) {
        const bestaandeBaseEventLists = fs.readdirSync(
            fsDirections.baseEventlists
        );
        const verwijderd = [];
        const vv = this.vandaag;
        bestaandeBaseEventLists
            .filter((bel) => {
                return workerNames.find((wn) => bel.includes(wn));
            })
            .forEach((bel) => {
                const condities = [
                    cleanInstructions === "all",
                    Array.isArray(cleanInstructions) &&
                        cleanInstructions.find((ci) => bel.includes(ci)),
                    !bel.includes(vv)
                ];

                if (!condities.includes(true)) return;
                fs.rmSync(`${fsDirections.baseEventlists}/${bel}`);
                verwijderd.push(`${bel.substring(0, 10)}`);
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
    publicEventImagesCleanup(cleanInstructions) {
        const pei = fsDirections.publicEventImages;
        const verwijderd = [];

        workerNames
            .filter((wn) => {
                if (cleanInstructions === "all") return true;
                if (cleanInstructions.includes(wn)) return true;
                return false;
            })
            .forEach((workerName) => {
                console.log(workerName);
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
    longTextFilesCleanup(cleanInstructions) {
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
     * singlePageCacheCleanup
     *
     * Schoont temp/singlePages/podia op
     * Uit wordt gegaan van de draaiende workers uit worker config.
     * Indien all dan worden de folders geleegd.
     * Indien benaamd dan alleen die specifiek
     * @param {string|bool} cleanInstructions False of "all" of "paradiso%melkweg" etc
     * @returns {array} verwijderd array met strings van welke workerName hoeveel cachepaginas zijn verwijderd.
     */
    singlePageCacheCleanup(cleanInstructions) {
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
}
