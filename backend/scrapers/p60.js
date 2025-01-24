/* global document */
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/p60.js";
import getImage from "./gedeeld/image.js";
import { mapToShortDate } from "./gedeeld/datums.js";
import workTitleAndSlug from "./gedeeld/slug.js";
import terms from "../artist-db/store/terms.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
    workerData: { ...workerData },

    mainPage: {
        timeout: 60020,
        url: "https://p60.nl/agenda"
    },
    singlePage: {
        timeout: 10000
    },
    app: {
        harvest: {
            dividers: [`,`, `&`],
            dividerRex: "[,&]",
            artistsIn: ["title", "shortText"]
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

    let rawEvents = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ workerData, unavailabiltyTerms }) =>
            Array.from(
                document.querySelectorAll(
                    ".views-infinite-scroll-content-wrapper > .p60-list__item-container"
                )
            )
                .filter(
                    (itemEl) => !!itemEl.querySelector("[href*=ticketmaster]")
                )
                .map((itemEl) => {
                    const title =
                        itemEl
                            .querySelector(".p60-list__item__title")
                            ?.textContent.trim() ?? "";

                    const res = {
                        anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
                        errors: [],
                        title
                    };

                    const uaRex = new RegExp(
                        unavailabiltyTerms.join("|"),
                        "gi"
                    );
                    res.unavailable = !!itemEl.textContent.match(uaRex);
                    res.soldOut =
                        itemEl?.textContent.match(/uitverkocht|sold\s?out/i) ??
                        false;

                    res.venueEventUrl =
                        itemEl.querySelector(".field-group-link")?.href;

                    const doorB = itemEl
                        .querySelector(".p60-list__item__date time")
                        ?.getAttribute("datetime");
                    try {
                        res.door = doorB;
                    } catch (caughtError) {
                        res.errors.push({
                            error: caughtError,
                            remarks: `openDoorDateTime omzetten ${doorB}`
                        });
                    }

                    const startTime = itemEl
                        .querySelector(".field--name-field-aanvang")
                        ?.textContent.trim();
                    let startB;
                    if (res.door) {
                        startB = doorB.replace(/T\d\d:\d\d/, `T${startTime}`);
                        try {
                            res.start = startB;
                        } catch (caughtError) {
                            res.errors.push({
                                error: caughtError,
                                remarks: `start omzetten ${startB}`
                            });
                        }
                    }
                    res.startDate = res.start.split("T")[0];

                    res.shortText =
                        itemEl
                            .querySelector(".p60-list__item__description")
                            ?.textContent.trim() ?? "";
                    return res;
                }),
        { workerData, unavailabiltyTerms: terms.unavailability }
    );

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

    if (event.unavailable) {
        return this.singlePageEnd({ pageInfo: {}, stopFunctie, page });
    }

    const pageInfo = await page.evaluate(() => {
        const res = {
            anker: `<a class='page-info' href='${document.location.href}'>${document.title}</a>`,
            errors: []
        };

        return res;
    }, null);

    const imageRes = await getImage({
        _this: this,
        page,
        workerData,
        event,
        pageInfo,
        selectors: ["[property='og:image']"],
        mode: "weird-attr"
    });
    pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
    pageInfo.image = imageRes.image;

    const priceRes = await this.getPriceFromHTML({
        page,
        event,
        pageInfo,
        selectors: [".event-info__price", ".content-section__event-info"]
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
