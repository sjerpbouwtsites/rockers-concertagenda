/* global document */
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/groeneengel.js";
import getImage from "./gedeeld/image.js";
import {
    mapToShortDate,
    mapToStartDate,
    mapToStartTime,
    combineStartTimeStartDate,
    mapToDoorTime,
    combineDoorTimeStartDate
} from "./gedeeld/datums.js";
import workTitleAndSlug from "./gedeeld/slug.js";
import terms from "../artist-db/store/terms.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
    workerData: { ...workerData },

    mainPage: {
        timeout: 25076,
        waitUntil: "load",
        url: "https://www.groene-engel.nl/programma/?filter=concert"
    },
    singlePage: {
        timeout: 10000
    },
    app: {
        harvest: {
            dividers: [`+`],
            dividerRex: "[\\+]",
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
        },
        singlePage: {
            requiredProperties: ["venueEventUrl", "title", "price", "start"],
            asyncCheckFuncs: ["success"]
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

    let baseEvents = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ workerData, unavailabiltyTerms, months }) =>
            Array.from(
                document.querySelectorAll(".collection-wrapper .event-part")
            ).map((eventEl) => {
                const title =
                    eventEl.querySelector(".part-title")?.textContent ?? null;
                const res = {
                    anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
                    errors: [],
                    title
                };
                res.venueEventUrl =
                    eventEl.querySelector(".left-side")?.href ?? "";
                const uaRex = new RegExp(unavailabiltyTerms.join("|"), "gi");
                res.unavailable = !!eventEl.textContent.match(uaRex);
                res.soldOut =
                    !!eventEl
                        .querySelector(".bottom-bar")
                        ?.textContent.match(/uitverkocht|sold\s?out/i) ?? null;

                res.mapToStartDate = document
                    .querySelector(".date-label")
                    ?.textContent.trim()
                    .toLowerCase();

                return res;
            }),
        {
            workerData,
            unavailabiltyTerms: terms.unavailability,
            months: this.months
        }
    );

    baseEvents = baseEvents
        .map((event) => mapToStartDate(event, "dag-maandNaam", this.months))
        .map(mapToShortDate)
        .map(this.isMusicEventCorruptedMapper)
        .map((re) => workTitleAndSlug(re, this._s.app.harvest.possiblePrefix));

    const eventGen = this.eventGenerator(baseEvents);
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
                anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
                errors: []
            };

            document.querySelectorAll(".half-half .label").forEach((l) => {
                const tt = l.textContent.trim().toLowerCase();
                l.className = `${l.className} ${tt}`;
            });

            res.mapToStartTime =
                document
                    .querySelector(".label.aanvang + .value")
                    ?.textContent.trim()
                    .toLowerCase() ?? "";
            res.mapToDoorTime =
                document
                    .querySelector(".label.open + .value")
                    ?.textContent.trim()
                    .toLowerCase() ?? "";

            return res;
        },
        { event }
    );

    pageInfo.startDate = event.startDate;
    pageInfo = mapToStartTime(pageInfo);
    pageInfo = mapToDoorTime(pageInfo);
    pageInfo = combineStartTimeStartDate(pageInfo);
    pageInfo = combineDoorTimeStartDate(pageInfo);

    const imageRes = await getImage({
        _this: this,
        page,
        workerData,
        event,
        pageInfo,
        selectors: [".img-wrapper img"],
        mode: "image-src"
    });
    pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
    pageInfo.image = imageRes.image;

    const priceRes = await this.getPriceFromHTML({
        page,
        event,
        pageInfo,
        selectors: [".main-ticket-info"]
    });
    pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
    pageInfo.price = priceRes.price;

    const { mediaForHTML, socialsForHTML, textForHTML } =
        await longTextSocialsIframes(page, event, pageInfo);
    pageInfo.mediaForHTML = mediaForHTML;
    pageInfo.socialsForHTML = socialsForHTML;
    pageInfo.textForHTML = textForHTML;
    return this.singlePageEnd({
        pageInfo,
        stopFunctie,
        page,
        event
    });
};
// #endregion                         SINGLE PAGE
