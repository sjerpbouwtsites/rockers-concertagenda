/* global document */
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/effenaar.js";
import getImage from "./gedeeld/image.js";
import { mapToShortDate, mapToStartDate } from "./gedeeld/datums.js";
import workTitleAndSlug from "./gedeeld/slug.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
    workerData: { ...workerData },

    mainPage: {
        timeout: 30013,
        url: "https://www.effenaar.nl/agenda?genres.title=heavy"
    },
    singlePage: {
        timeout: 15014
    },
    app: {
        harvest: {
            dividers: [`+`, ":", ",", "&"],
            dividerRex: "[\\+:,&]",
            artistsIn: ["title", "shortText"]
        },
        mainPage: {
            requiredProperties: ["venueEventUrl", "title"],
            asyncCheckFuncs: [
                "refused",
                "allowedEvent",
                "hasAllowedArtist",
                "forbiddenTerms"
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

    let rawEvents = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ workerData }) =>
            Array.from(
                document.querySelectorAll(".search-and-filter .agenda-card")
            ).map((eventEl) => {
                const title = eventEl
                    .querySelector(".card-title")
                    ?.textContent.trim();
                const res = {
                    anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
                    errors: [],
                    title
                };
                res.shortText =
                    eventEl.querySelector(".card-subtitle")?.textContent ?? "";
                res.venueEventUrl = eventEl?.href ?? null;
                res.mapToStartDate =
                    eventEl.querySelector(".card-info-date")?.textContent ?? "";
                res.soldOut =
                    !!eventEl
                        .querySelector(".card-content .card-status")
                        ?.innerHTML.match(/uitverkocht|sold\s?out/i) ?? null;
                return res;
            }),
        { workerData }
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

    await page.waitForSelector(".event-bar-inner-row");

    const pageInfo = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ months, event }) => {
            const res = {
                anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
                errors: []
            };

            const dateText =
                document
                    .querySelector(".header-meta-date")
                    ?.textContent.trim() ?? "";
            if (!dateText) {
                res.errors.push({
                    error: new Error(`geen datumtext ${res.anker}`)
                });
                res.corrupted = "geen datum tekst";
            } else {
                const [, dayNumber, monthName, year] = dateText.match(
                    /(\d+)\s(\w+)\s(\d\d\d\d)/
                );
                const fixedDay = dayNumber.padStart(2, "0");
                const monthNumber = months[monthName];
                res.startDate = `${year}-${monthNumber}-${fixedDay}`;
            }

            let startTimeAr = [];
            let doorTimeAr = [];
            if (res.startDate) {
                startTimeAr = document
                    .querySelector(".time-start-end")
                    ?.textContent.match(/\d\d:\d\d/);
                if (Array.isArray(startTimeAr) && startTimeAr.length) {
                    res.startTime = startTimeAr[0];
                }
                doorTimeAr = document
                    .querySelector(".time-open")
                    ?.textContent.match(/\d\d:\d\d/);
                if (Array.isArray(doorTimeAr) && doorTimeAr.length) {
                    res.doorTime = doorTimeAr[0];
                }
                res.startString = `${res.startDate}T${res.startTime}:00`;
                res.openDoorDateTimeString = `${res.startDate}T${res.doorTime}:00`;
            }

            try {
                if (res.doorTime) {
                    res.door = `${res.openDoorDateTimeString}`;
                }

                if (res.startTime) {
                    res.start = `${res.startString}`;
                }
            } catch (caughtError) {
                res.errors.push({
                    error: caughtError,
                    remarks: `omzetten naar Date iso gaat fout ${res.anker}`,
                    toDebug: {
                        ars: `${startTimeAr.join("")} ${doorTimeAr.join("")}`,
                        res,
                        event
                    }
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
        selectors: [".header-image img"],
        mode: "image-src"
    });
    pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
    pageInfo.image = imageRes.image;

    const priceRes = await this.getPriceFromHTML({
        page,
        event,
        pageInfo,
        selectors: [".tickets-btn", ".tickets-dropdown"]
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
