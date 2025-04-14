/* global document */
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/dehelling.js";
import getImage from "./gedeeld/image.js";
import {
    combineStartTimeStartDate,
    mapToStartTime,
    mapToEndTime,
    mapToShortDate,
    mapToStartDate,
    combineEndTimeStartDate
} from "./gedeeld/datums.js";
import workTitleAndSlug from "./gedeeld/slug.js";

// #region        SCRAPER CONFIG
const dehellingScraper = new AbstractScraper({
    workerData: { ...workerData },

    mainPage: {
        timeout: 30011,
        url: "https://dehelling.nl/agenda/?zoeken=&genre%5B%5D=heavy"
    },
    singlePage: {
        timeout: 10012
    },
    app: {
        harvest: {
            dividers: [`\\+`],
            dividerRex: "[+]",
            artistsIn: ["title"]
        },
        mainPage: {
            requiredProperties: ["venueEventUrl", "title", "start"],
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

dehellingScraper.listenToMasterThread();

// #region       MAIN PAGE
dehellingScraper.mainPage = async function () {
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
            Array.from(document.querySelectorAll(".c-event-card")).map(
                (eventEl) => {
                    const title =
                        eventEl
                            .querySelector(".c-event-card__title")
                            ?.textContent.trim() ?? "";

                    const res = {
                        anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
                        errors: [],
                        title
                    };

                    res.venueEventUrl = eventEl.querySelector(
                        ".c-event-card__link"
                    ).href;

                    res.startDate = res.venueEventUrl
                        .substring(
                            res.venueEventUrl.length - 11,
                            res.venueEventUrl.length - 1
                        )
                        .split("-")
                        .reverse()
                        .join("-");
                    const tijdenMatch =
                        document
                            .querySelector(".c-event-card__meta")
                            ?.textContent.match(
                                /(\d{1,2}:\d\d)\s?-\s?(\d{1,2}:\d\d)/
                            ) ?? [];

                    if (Array.isArray(tijdenMatch)) {
                        res.mapToStartTime = tijdenMatch[1];
                        if (tijdenMatch.length === 3) {
                            res.mapToEndTime = tijdenMatch[2];
                        }
                    }

                    res.shortText =
                        eventEl
                            .querySelector(".c-event-card__subtitle")
                            ?.textContent.trim() ?? "";

                    return res;
                }
            ),
        { workerData }
    );

    rawEvents = rawEvents
        .map(mapToShortDate)
        .map(mapToStartTime)
        .map(mapToEndTime)
        .map(combineStartTimeStartDate)
        .map(combineEndTimeStartDate)
        .map((re) => workTitleAndSlug(re, this._s.app.harvest.possiblePrefix))
        .map(this.isMusicEventCorruptedMapper);
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
dehellingScraper.singlePage = async function ({ page, event }) {
    const { stopFunctie } = await this.singlePageStart();

    const pageInfo = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ event }) => {
            const res = {
                anker: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
                errors: []
            };

            const shareEl = document.querySelector(".c-event-content__sharer"); // TODO is dit legacy?
            if (shareEl) {
                shareEl.parentNode.removeChild(shareEl);
            }

            return res;
        },
        { event }
    );

    const imageRes = await getImage({
        _this: this,
        page,
        workerData,
        event,
        pageInfo,
        selectors: [".img--cover img", ".u-section__inner img"],
        mode: "image-src"
    });
    pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
    pageInfo.image = imageRes.image;

    const priceRes = await this.getPriceFromHTML({
        page,
        event,
        pageInfo,
        selectors: [".c-event-meta__table"]
    });
    pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
    pageInfo.price = priceRes.price;

    const { mediaForHTML, textForHTML } = await longTextSocialsIframes(
        page,
        event,
        pageInfo
    );
    pageInfo.mediaForHTML = mediaForHTML;

    pageInfo.textForHTML = textForHTML;

    const singlePageHTML = await page.evaluate(() => {
        return document.body.parentNode.outerHTML;
    });

    return this.singlePageEnd({
        pageInfo,
        stopFunctie,
        page,
        event,
        singlePageHTML
    });
};
// #endregion                         SINGLE PAGE
