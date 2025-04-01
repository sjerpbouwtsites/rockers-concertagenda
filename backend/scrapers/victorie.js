/* eslint-disable func-names */
/* global document */
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/victorie.js";
import getImage from "./gedeeld/image.js";
import {
    combineStartTimeStartDate,
    mapToStartDate,
    mapToStartTime,
    mapToDoorTime,
    combineDoorTimeStartDate,
    mapToShortDate
} from "./gedeeld/datums.js";
import workTitleAndSlug from "./gedeeld/slug.js";
import terms from "../artist-db/store/terms.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
    workerData: { ...workerData },
    mainPage: {
        timeout: 45000,
        url: "https://www.podiumvictorie.nl/programma/"
    },
    singlePage: {
        timeout: 10000
    },
    app: {
        harvest: {
            dividers: [`,`, ` en`],
            dividerRex: "[\\,]",
            artistsIn: ["title"]
        },
        mainPage: {
            requiredProperties: ["venueEventUrl", "title"],
            asyncCheckFuncs: [
                "refused",
                "allowedEvent",
                "forbiddenTerms",
                "hasGoodTerms",
                "hasAllowedArtist",
                "spotifyConfirmation",
                "failure"
            ]
            // asyncCheckFuncs: ['allowed', 'event', 'refused', 'forbiddenTerms', 'emptySuccess'],
        },
        singlePage: {
            requiredProperties: ["venueEventUrl", "title", "start"],
            asyncCheckFuncs: ["success"]
            // asyncCheckFuncs: ['goodTerms', 'isRock', 'saveRefused', 'emptyFailure'],
        }
    }
});
// #endregion                          SCRAPER CONFIG

scraper.listenToMasterThread();

// #region       MAIN PAGE
scraper.mainPage = async function () {
    const availableBaseEvents = await this.checkBaseEventAvailable(
        workerData.family
    );

    if (availableBaseEvents) {
        const thisWorkersEvents = availableBaseEvents.filter(
            (eventEl, index) =>
                index % workerData.workerCount === workerData.index
        );

        return this.mainPageEnd({
            stopFunctie: null,
            rawEvents: thisWorkersEvents
        });
    }

    const { stopFunctie, page } = await this.mainPageStart();

    let rawEvents = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ workerData }) =>
            Array.from(
                document.querySelectorAll('.program.row[data-genre*="live"]')
            ).map((eventEl) => {
                const venueEventUrl = eventEl.querySelector("a").href ?? "";
                const title =
                    eventEl
                        .querySelector(".program-desc h4")
                        .textContent.trim() ?? "";
                const res = {
                    title,
                    errors: [],
                    venueEventUrl,
                    anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`
                };
                res.shortText =
                    eventEl.querySelector("h4 + p")?.textContent.trim() ?? "";
                res.soldOut = !!eventEl.querySelector(".uitverkocht");
                res.mapToStartDate = eventEl
                    .querySelector(".program-date h4")
                    ?.innerHTML.replaceAll("<br>", " ")
                    .replaceAll(/\s{2,500}/g, " ")
                    .trim();
                return res;
            }),
        { workerData }
    );

    this.dirtyLog(rawEvents);

    rawEvents = rawEvents
        .map((event) => mapToStartDate(event, "dag-maandNaam", this.months))
        .map(mapToShortDate)
        .map(this.isMusicEventCorruptedMapper)
        .map((re) => workTitleAndSlug(re, this._s.app.harvest.possiblePrefix));

    const eventGen = this.eventGenerator(rawEvents);
    // eslint-disable-next-line no-unused-vars
    const checkedEvents = await this.rawEventsAsyncCheck({
        eventGen,
        checkedEvents: []
    });

    this.saveBaseEventlist(workerData.family, checkedEvents);

    const thisWorkersEvents = checkedEvents.filter(
        (eventEl, index) => index % workerData.workerCount === workerData.index
    );

    return this.mainPageEnd({
        stopFunctie,
        page,
        rawEvents: thisWorkersEvents
    });
};
// #endregion                          MAIN PAGE

// #region      SINGLE PAGE
scraper.singlePage = async function ({ page, event }) {
    const { stopFunctie } = await this.singlePageStart();

    let pageInfo = {
        title: event.title,
        errors: [],
        anker: `<a class='page-info' href='${event.venueEventUrl}'>${workerData.family} single - ${event.title}</a>`
    };

    await page.evaluate(() => {
        const s = document
            .querySelector('header[style*="background"]')
            .getAttribute("style")
            .replace("url('/", "url('https://www.podiumvictorie.nl/");
        document
            .querySelector('header[style*="background"]')
            .setAttribute("style", s);
        return s;
    });

    const imageRes = await getImage({
        _this: this,
        page,
        workerData,
        event,
        pageInfo,
        selectors: ['header[style*="background"]'],
        mode: "background-src"
    });
    pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
    pageInfo.image = imageRes.image;

    const priceRes = await this.getPriceFromHTML({
        page,
        event,
        pageInfo,
        selectors: [".show-info .columns + .columns", ".sidebar"]
    });

    const isGratis = await page.evaluate(() => {
        const heeftEuros =
            !document
                .querySelector(".show-info .columns + .columns")
                ?.textContent.match(/€/i) ?? null;
        const heeftGratis = document
            .querySelector(".sidebar")
            ?.textContent.includes("gratis");
        return !heeftEuros || heeftGratis;
    });
    if (pageInfo.errors.length && isGratis) {
        pageInfo.price = 0;
    } else {
        pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
        pageInfo.price = priceRes.price;
    }

    pageInfo.startDate = event.startDate;
    pageInfo.mapToStartTime = await page.evaluate(() => {
        const r = document
            .querySelector(".show-info")
            ?.textContent.match(/aanvang.*/i);
        if (Array.isArray(r)) return r[0].replace(".", ":");
        return null;
    });
    pageInfo.mapToDoorTime = await page.evaluate(() => {
        const r = document
            .querySelector(".show-info")
            ?.textContent.match(/deur.*/i);
        if (Array.isArray(r)) return r[0].replace(".", ":");
        return null;
    });
    pageInfo = mapToStartTime(pageInfo);
    pageInfo = mapToDoorTime(pageInfo);
    pageInfo = combineStartTimeStartDate(pageInfo);
    pageInfo = combineDoorTimeStartDate(pageInfo);

    const { mediaForHTML, textForHTML } = await longTextSocialsIframes(
        page,
        event,
        pageInfo
    );
    pageInfo.mediaForHTML = mediaForHTML;

    pageInfo.textForHTML = textForHTML;

    return this.singlePageEnd({
        pageInfo,
        stopFunctie,
        page,
        event
    });
};
// #endregion                         SINGLE PAGE
