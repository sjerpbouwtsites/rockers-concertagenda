/* global document */
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/metropool.js";
import getImage from "./gedeeld/image.js";
import {
    mapToStartDate,
    mapToShortDate,
    mapToStartTime,
    combineStartTimeStartDate
} from "./gedeeld/datums.js";
import workTitleAndSlug from "./gedeeld/slug.js";
import terms from "../artist-db/store/terms.js";

// #region        SCRAPER CONFIG
const metropoolScraper = new AbstractScraper({
    workerData: { ...workerData },

    mainPage: {
        timeout: 60000,
        waitUntil: "load",
        url: "https://metropool.nl/agenda?genre=metal&genre=rock&filter=open"
    },
    singlePage: {
        timeout: 10000
    },
    app: {
        harvest: {
            dividers: [`+`, "&"],
            dividerRex: "[\\+&]",
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

metropoolScraper.listenToMasterThread();

// #region       MAIN PAGE
metropoolScraper.mainPage = async function () {
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

    await this.autoScroll(page);

    // await page.evaluate(() => {
    //   document.querySelectorAll('.card__date--day span:first-child').forEach((dagSpan) => {
    //     dagSpan.parentNode.removeChild(dagSpan);
    //   });
    // });

    let rawEvents = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ workerData, unavailabiltyTerms }) =>
            Array.from(document.querySelectorAll(".paging-container")).map(
                (eventEl) => {
                    const title =
                        eventEl.querySelector(".event-title")?.textContent ??
                        null;
                    const res = {
                        anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
                        errors: [],
                        title
                    };

                    res.venueEventUrl =
                        eventEl.querySelector("a.ticket-row")?.href ?? "";
                    res.shortText =
                        eventEl
                            .querySelector(".event-subtitle")
                            ?.textContent.trim() ?? "";
                    const uaRex = new RegExp(
                        unavailabiltyTerms.join("|"),
                        "gi"
                    );
                    res.unavailable = !!eventEl.textContent.match(uaRex);

                    res.mapToStartDate =
                        eventEl
                            .querySelector(".event-date")
                            ?.textContent.trim() ?? "";
                    res.mapToStartTime =
                        eventEl
                            .querySelector(".event-time")
                            ?.textContent.trim() ?? "";

                    res.soldOut =
                        !!eventEl
                            .querySelector(".event-content .tag")
                            ?.textContent.match(/uitverkocht|sold\s?out/i) ??
                        null;
                    return res;
                }
            ),
        { workerData, unavailabiltyTerms: terms.unavailability }
    );

    rawEvents = rawEvents
        .map((event) => mapToStartDate(event, "dag-maandNaam", this.months))
        .map(mapToShortDate)
        .map(mapToStartTime)
        .map(combineStartTimeStartDate)
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
metropoolScraper.singlePage = async function ({ page, event }) {
    const { stopFunctie } = await this.singlePageStart();

    const pageInfo = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ event }) => {
            const res = {
                anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
                errors: []
            };

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
        selectors: ["picture.header-image img"],
        mode: "image-src"
    });
    pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
    pageInfo.image = imageRes.image;

    const priceRes = await this.getPriceFromHTML({
        page,
        event,
        pageInfo,
        selectors: [".event-description .no-bullets"]
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
