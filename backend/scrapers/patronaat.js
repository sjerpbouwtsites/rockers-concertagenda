/* global document */
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/patronaat.js";
import getImage from "./gedeeld/image.js";
import { mapToStartDate, mapToShortDate } from "./gedeeld/datums.js";
import workTitleAndSlug from "./gedeeld/slug.js";
import terms from "../artist-db/store/terms.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
    workerData: { ...workerData },

    mainPage: {
        timeout: 60034,
        url: "https://patronaat.nl/programma/?type=event&s=&eventtype%5B%5D=197"
    },
    singlePage: {
        timeout: 45036
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
        ({ workerData, unavailabiltyTerms }) =>
            Array.from(
                document.querySelectorAll(".overview__list-item--event")
            ).map((eventEl) => {
                const title = eventEl
                    .querySelector(".event-program__name")
                    ?.textContent.trim();
                const res = {
                    anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
                    errors: [],
                    title
                };

                res.venueEventUrl =
                    eventEl.querySelector("a[href]")?.href ?? null;
                res.shortText =
                    eventEl
                        .querySelector(".event-program__subtitle")
                        ?.textContent.trim() ?? "";
                res.mapToStartDate =
                    eventEl
                        .querySelector(".event-program__date")
                        .textContent.trim()
                        .toLowerCase() ?? "";
                const uaRex = new RegExp(unavailabiltyTerms.join("|"), "gi");
                res.unavailable = !!eventEl.textContent.match(uaRex);
                res.soldOut = !!(
                    eventEl.querySelector(".event__tags-item--sold-out") ?? null
                );

                return res;
            }),
        { workerData, unavailabiltyTerms: terms.unavailability }
    );
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

    const pageInfo = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ months, event }) => {
            const res = {
                anker: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
                errors: []
            };

            try {
                res.startDatum = event.startDate;
                // res.startDatumM = document
                //   .querySelector('.event__info-bar--star-date')
                //   ?.textContent.toLowerCase()
                //   .match(/(\d{1,2})\s+(\w{3,4})\s+(\d\d\d\d)/);
                // if (Array.isArray(res.startDatumM) && res.startDatumM.length >= 4) {
                //   const day = res.startDatumM[1].padStart(2, '0');
                //   const month = months[res.startDatumM[2]];
                //   const year = res.startDatumM[3];
                //   res.startDatum = `${year}-${month}-${day}`;
                // }

                if (res.startDatum) {
                    [
                        ["doorOpenTime", ".event__info-bar--doors-open"],
                        ["startTime", ".event__info-bar--start-time"],
                        ["endTime", ".event__info-bar--end-time"]
                    ].forEach((timeField) => {
                        const [timeName, selector] = timeField;

                        const mmm = document
                            .querySelector(selector)
                            ?.textContent.match(/\d\d:\d\d/);
                        if (Array.isArray(mmm) && mmm.length === 1) {
                            // eslint-disable-next-line prefer-destructuring
                            res[timeName] = mmm[0];
                        }
                    });

                    if (!res.startTime) {
                        res.startTime = res.doorOpenTime;
                    }
                    if (!res.startTime) {
                        res.errors.push({
                            error: new Error(`geen startTime ${res.anker}`),
                            toDebug: event
                        });
                    }

                    if (res.doorOpenTime) {
                        res.door = `${res.startDatum}T${res.doorOpenTime}:00`;
                    }
                    if (res.startTime) {
                        res.start = `${res.startDatum}T${res.startTime}:00`;
                    }
                    if (res.endTime) {
                        res.end = `${res.startDatum}T${res.endTime}:00`;
                    }
                } else {
                    res.errors.push({
                        error: new Error(`geen startDate ${res.anker}`),
                        toDebug: event
                    });
                    return res;
                }
            } catch (caughtError) {
                // TODO opsplitsen
                res.errors.push({
                    error: caughtError,
                    remarks: `Datum error patronaat ${res.anker}.`,
                    toDebug: event
                });
            }

            return res;
        },
        { months: this.months, event }
    );

    const imageRes = await getImage({
        _this: this,
        page,
        workerData,
        event,
        pageInfo,
        selectors: [".event__visual img"],
        mode: "image-src"
    });
    pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
    pageInfo.image = imageRes.image;

    const priceRes = await this.getPriceFromHTML({
        page,
        event,
        pageInfo,
        selectors: [".event__info-bar--ticket-price"]
    });

    const viaTicketMaster = await page.evaluate(
        () =>
            !!document.querySelector('a.button--tickets[href*="ticketmaster"]')
    );
    if (viaTicketMaster && priceRes.errors.length) {
        pageInfo.price = null;
    } else {
        pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
        pageInfo.price = priceRes.price;
    }

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
