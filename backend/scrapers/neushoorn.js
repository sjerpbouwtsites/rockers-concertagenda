/* global document */
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/neushoorn.js";
import getImage from "./gedeeld/image.js";
import {
    mapToStartDate,
    combineDoorTimeStartDate,
    mapToDoorTime,
    mapToShortDate,
    mapToStartTime,
    combineStartTimeStartDate
} from "./gedeeld/datums.js";
import workTitleAndSlug from "./gedeeld/slug.js";
import terms from "../artist-db/store/terms.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
    workerData: { ...workerData },
    mainPage: {
        url: "https://neushoorn.nl/#/search?category=Heavy"
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
            requiredProperties: ["venueEventUrl", "title", "start"],
            asyncCheckFuncs: ["success"]
        }
    }
});
// #endregion

scraper.listenToMasterThread();

// #region       MAIN PAGE
scraper.mainPage = async function () {
    const availableBaseEvents = await this.checkBaseEventAvailable(
        workerData.family
    );

    this.dirtyTalk(`${availableBaseEvents ? `🟩 JA baselists` : `🟥 nee`}`);

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

    try {
        await page.waitForSelector(".productions__item", {
            timeout: this.singlePageTimeout
        });
        await this.waitTime(50);
    } catch (caughtError) {
        this.handleError(
            caughtError,
            "Laad en klikwachten timeout neushoorn",
            "close-thread",
            null
        );
        return this.mainPageEnd({ stopFunctie, page, rawEvents: [] });
    }

    let rawEvents = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ workerData, unavailabiltyTerms }) =>
            Array.from(document.querySelectorAll(".productions__item")).map(
                (eventEl) => {
                    const title = eventEl.querySelector(
                        ".productions__item__content span:first-child"
                    ).textContent;
                    const res = {
                        anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
                        errors: [],
                        title
                    };
                    res.shortText =
                        eventEl.querySelector(".productions__item__subtitle")
                            ?.textContent ?? "";
                    res.venueEventUrl = eventEl.href;
                    const uaRex = new RegExp(
                        unavailabiltyTerms.join("|"),
                        "gi"
                    );
                    res.mapToStartDate =
                        eventEl
                            .querySelector(".date-label__day-month")
                            ?.textContent.trim()
                            .toLowerCase()
                            .replace("-", " ") ?? "";
                    res.unavailable = !!eventEl.textContent.match(uaRex);
                    res.soldOut =
                        !!eventEl
                            .querySelector(".chip")
                            ?.textContent.match(/uitverkocht|sold\s?out/i) ??
                        false;
                    return res;
                }
            ),
        { workerData, unavailabiltyTerms: terms.unavailability }
    );

    rawEvents = rawEvents
        .map((event) => mapToStartDate(event, "dag-maandNummer", this.months))
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
                anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
                errors: []
            };

            res.startDate = event.startDate;
            res.mapToStartTime =
                document
                    .querySelector(
                        ".summary .summary__item .start, .summary .summary__item + .summary__item"
                    )
                    ?.textContent.trim()
                    .toLowerCase() ?? "";
            res.mapToDoorTime =
                document
                    .querySelector(".summary .summary__item .deur")
                    ?.textContent.trim()
                    .toLowerCase() ?? "";

            return res;
        },
        { months: this.months, event }
    );

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
        selectors: [".header--theatre"],
        mode: "background-src"
    });
    pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
    pageInfo.image = imageRes.image;

    const priceRes = await this.getPriceFromHTML({
        page,
        event,
        pageInfo,
        selectors: [
            ".prices__item__price",
            ".prices",
            "sidebar .tickets-button"
        ]
    });
    const isGratis = await page.evaluate(
        () =>
            !!document
                .querySelector(".tickets-button")
                ?.textContent.match(/gratis/i) ?? null
    );
    if (pageInfo.errors.length && isGratis) {
        pageInfo.price = 0;
    } else {
        pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
        pageInfo.price = priceRes.price;
    }

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
