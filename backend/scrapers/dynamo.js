/* global document */
import { threadId, workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/dynamo.js";
import getImage from "./gedeeld/image.js";
import {
    mapToShortDate,
    combineStartTimeStartDate,
    combineDoorTimeStartDate,
    combineEndTimeStartDate,
    mapToStartDate,
    mapToStartTime,
    mapToDoorTime,
    mapToEndTime
} from "./gedeeld/datums.js";
import workTitleAndSlug from "./gedeeld/slug.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
    workerData: { ...workerData },

    mainPage: {
        timeout: 35060,
        url: "https://www.dynamo-eindhoven.nl/evenementen/?_stroming_id=842"
    },
    singlePage: {
        timeout: 15000
    },
    app: {
        harvest: {
            dividers: [`+`],
            dividerRex: "[\\+]",
            artistsIn: ["title", "shortText"]
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
        },
        singlePage: {
            requiredProperties: ["venueEventUrl", "title", "price", "start"],
            asyncCheckFuncs: ["success"]
            // asyncCheckFuncs: ['goodTerms', 'forbiddenTerms', 'isRock', 'saveRefused', 'emptyFailure'],
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
                document.querySelectorAll(".group.image-border-trigger")
            ).map((baseEvent) => {
                const title = baseEvent.querySelector("h3")?.textContent ?? "";
                const res = {
                    anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
                    errors: [],
                    title
                };

                res.venueEventUrl = baseEvent.querySelector("a")?.href ?? "";
                if (res.venueEventUrl.includes("metalfest")) {
                    res.corrupted = `is metalfest`;
                }

                const dM =
                    baseEvent
                        .querySelector("a + a")
                        ?.textContent.match(/(\d\d-\w\w\w-\d\d\d\d)/) ?? "";
                if (Array.isArray(dM)) {
                    res.mapToStartDate = dM[0];
                }

                res.shortText =
                    baseEvent.querySelector("a + a div:last-child")
                        ?.textContent ?? "";

                res.soldOut = (
                    baseEvent.querySelector("a + a")?.textContent ?? ""
                )
                    .toLowerCase()
                    .includes("uitverkocht");
                return res;
            }),
        { workerData }
    );

    this.dirtyLog(rawEvents);

    rawEvents = rawEvents
        .map((event) =>
            mapToStartDate(event, "dag-maandNaam-jaar", this.months)
        )
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

    return this.mainPageEnd({ stopFunctie, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region      SINGLE PAGE
scraper.singlePage = async function ({ page, event }) {
    const { stopFunctie } = await this.singlePageStart();
    let pageInfo = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ event }) => {
            const res = {
                anker: `<a class='page-info' href='${document.location.href}'>${document.title}</a>`,
                errors: []
            };

            const tijdenRijTekst =
                document
                    .querySelector("div[href] .flex.items-center.gap-4 + div")
                    ?.textContent.toLowerCase() ?? "";

            res.startDate = event.startDate;

            if (tijdenRijTekst.includes("doors")) {
                const m = tijdenRijTekst.match(/doors.*(\d\d:\d\d)/);
                if (Array.isArray(m)) {
                    res.mapToDoorTime = m[1];
                }
            }

            if (tijdenRijTekst.includes("show")) {
                const m = tijdenRijTekst.match(/show.*(\d\d:\d\d)/);
                if (Array.isArray(m)) {
                    res.mapToStartTime = m[1];
                }
            } else if (res.mapToDoorTime) {
                res.mapToStartTime = res.mapToDoorTime;
                res.mapToDoorTime = null;
            } else {
                res.corrupt = true;
            }

            if (tijdenRijTekst.includes("curfew")) {
                const m = tijdenRijTekst.match(/curfew.*(\d\d:\d\d)/);
                if (Array.isArray(m)) {
                    res.mapToEndTime = m[1];
                }
            }

            return res;
        },
        { event }
    );

    if (pageInfo.corrupt) {
        return this.singlePageEnd({
            pageInfo,
            stopFunctie,
            page,
            event
        });
    }

    pageInfo = mapToStartTime(pageInfo);
    pageInfo = mapToDoorTime(pageInfo);
    pageInfo = mapToEndTime(pageInfo);
    pageInfo = combineStartTimeStartDate(pageInfo);
    pageInfo = combineDoorTimeStartDate(pageInfo);
    pageInfo = combineEndTimeStartDate(pageInfo);

    const imageRes = await getImage({
        _this: this,
        page,
        workerData,
        event,
        pageInfo,
        selectors: [".wp-block-cover__image-background"],
        mode: "image-src"
    });
    pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
    pageInfo.image = imageRes.image;

    const priceRes = await this.getPriceFromHTML({
        page,
        event,
        pageInfo,
        selectors: ["div[href] .gap-4 + .gap-4 + .gap-4", "div[href]"]
    });
    pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
    pageInfo.price = priceRes.price;

    const { mediaForHTML, textForHTML } = await longTextSocialsIframes(
        page,
        event,
        pageInfo
    );
    if (!textForHTML || typeof textForHTML === "undefined") {
        const eee = new Error(`geen textForHTML bij ${event.title}`);
        this.handleError(eee);
        pageInfo.textForHTML = "";
    } else {
        pageInfo.textForHTML = textForHTML;
    }
    pageInfo.mediaForHTML = mediaForHTML;

    return this.singlePageEnd({
        pageInfo,
        stopFunctie,
        page,
        event
    });
};
// #endregion                         SINGLE PAGE
