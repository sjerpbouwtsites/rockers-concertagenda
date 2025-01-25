/* eslint-disable no-await-in-loop */
/* global document */
import { workerData } from "worker_threads";
import longTextSocialsIframes from "./longtext/gebrdenobel.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import getImage from "./gedeeld/image.js";
import terms from "../artist-db/store/terms.js";
import { mapToShortDate } from "./gedeeld/datums.js";
import workTitleAndSlug from "./gedeeld/slug.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
    workerData: { ...workerData },

    mainPage: {
        timeout: 31005,
        url: "https://nobel.nl/agenda?genre[20]=20"
    },
    singlePage: {
        timeout: 15004
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
                "hasAllowedArtist",
                "allowedEvent",
                "forbiddenTerms",
                "spotifyConfirmation"
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

    await this.autoScroll(page);
    await this.autoScroll(page);

    let rawEvents = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ workerData, unavailabiltyTerms }) =>
            Array.from(document.querySelectorAll(".event-teaser")).map(
                (eventEl) => {
                    const title =
                        eventEl.querySelector("a.event .content h3")
                            ?.textContent ?? null;
                    const res = {
                        anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
                        errors: [],
                        title
                    };

                    // dit is een verkeerde waarde. De datetime geeft altijd kwart over 6 aan.
                    res.start = eventEl
                        .querySelector("time")
                        .getAttribute("datetime");
                    res.startDate = res.start.substring(0, 10);

                    res.venueEventUrl =
                        eventEl.querySelector("a.event")?.href ?? "";

                    const uaRex = new RegExp(
                        unavailabiltyTerms.join("|"),
                        "gi"
                    );
                    res.unavailable = !!eventEl.textContent.match(uaRex);
                    res.soldOut =
                        !!eventEl
                            .querySelector(".special-label")
                            ?.textContent.match(/uitverkocht|sold\s?out/i) ??
                        null;

                    res.shortText =
                        eventEl.querySelector("h3 ~ p")?.textContent ?? "";

                    return res;
                }
            ),
        { workerData, unavailabiltyTerms: terms.unavailability }
    ); // page.evaluate

    rawEvents = rawEvents
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

    const pageInfo = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ event }) => {
            const res = {
                anker: `<a class='page-info' href='${document.location.href}'>${document.title}</a>`,
                errors: []
            };

            const startTijdText =
                document.querySelector(".info--tags")?.textContent ?? "";
            const startTijdM = startTijdText.match(/\d\d:\d\d/);
            if (Array.isArray(startTijdM)) {
                res.start = event.start.replace(/\d\d:\d\d/, startTijdM[0]);
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
        selectors: [".event-page figure img"],
        mode: "image-src"
    });
    pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
    pageInfo.image = imageRes.image;

    const priceRes = await this.getPriceFromHTML({
        page,
        event,
        pageInfo,
        selectors: [".tickets"]
    });
    pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
    pageInfo.price = priceRes.price;

    const { mediaForHTML, socialsForHTML, textForHTML } =
        await longTextSocialsIframes(page, event, pageInfo);
    pageInfo.mediaForHTML = mediaForHTML;
    pageInfo.socialsForHTML = socialsForHTML;
    pageInfo.textForHTML = textForHTML;

    this.dirtyLog(pageInfo.mediaForHTML);

    return this.singlePageEnd({
        pageInfo,
        stopFunctie,
        page,
        event
    });
};
// #endregion                         SINGLE PAGE
