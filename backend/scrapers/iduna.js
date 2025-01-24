/* global document */
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/iduna.js";
import getImage from "./gedeeld/image.js";
import { mapToStartDate, mapToShortDate } from "./gedeeld/datums.js";
import workTitleAndSlug from "./gedeeld/slug.js";
import terms from "../artist-db/store/terms.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
    workerData: { ...workerData },
    mainPage: {
        url: "https://iduna.nl/evenementen/",
        waitUntil: "load"
    },
    singlePage: {
        timeout: 10000
    },
    app: {
        harvest: {
            dividers: [`+`, `•`, `• •`],
            dividerRex: "[\\+•]",
            artistsIn: ["title", "shortText"]
        },
        mainPage: {
            requiredProperties: ["venueEventUrl", "title"],
            asyncCheckFuncs: [
                "refused",
                "allowedEvent",
                "forbiddenTerms",
                "hasGoodTerms",
                "hasAllowedArtist"
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
        return this.mainPageEnd({
            stopFunctie: null,
            rawEvents: availableBaseEvents
        });
    }
    const { stopFunctie, page } = await this.mainPageStart();

    let rawEvents = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ unavailabiltyTerms }) => {
            const events = Array.from(
                document.querySelectorAll(
                    '[data-genre*="metal"], [data-genre*="punk"]'
                )
            ).map((rawEvent) => {
                if (
                    rawEvent
                        .querySelector(".card-titel-container")
                        ?.textContent.includes("•")
                ) {
                    const spans = rawEvent.querySelectorAll(
                        ".card-titel-container span"
                    );
                    if (spans.length && spans.length > 1) {
                        spans[1].textContent = ` • ${spans[1].textContent}`;
                    }
                } // WAT EEN HACK

                const title =
                    rawEvent.querySelector(".card-titel-container")
                        ?.textContent ?? "";
                const venueEventUrl = rawEvent.hasAttribute("data-url")
                    ? rawEvent.getAttribute("data-url")
                    : null;
                const res = {
                    title,
                    venueEventUrl,
                    errors: []
                };
                res.mapToStartDate =
                    rawEvent
                        .querySelector(".card-footer > div:last-child")
                        ?.textContent.trim()
                        .toLowerCase() ?? "";
                res.shortText =
                    rawEvent.querySelector(".card-subtitle")?.textContent ??
                    null;
                res.soldOut = Array.isArray(
                    rawEvent.textContent.match(/uitverkocht|sold\sout/i)
                );
                const uaRex = new RegExp(unavailabiltyTerms.join("|"), "gi");
                res.unavailable = rawEvent.textContent.match(uaRex);
                return res;
            });
            return events;
        },
        { workerData, unavailabiltyTerms: terms.unavailability }
    );

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

    return this.mainPageEnd({ stopFunctie, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region      SINGLE PAGE
scraper.singlePage = async function ({ page, event }) {
    const { stopFunctie } = await this.singlePageStart();

    // cookie accept voor iframes
    await page.evaluate(() => {
        const b = document.querySelector(".cmplz-btn.cmplz-accept");
        if (!b) return;
        b.click();
    });

    const pageInfo = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ event }) => {
            const res = {
                anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
                errors: []
            };

            res.startDate = event.startDate;

            const tijdenEl = document.getElementById("code_block-92-7");
            if (!tijdenEl) {
                res.errors.push({
                    error: new Error("geen tijdenEl"),
                    remarks: "#code_block-92-7 niet gevonden"
                });
                return res;
            }

            if (tijdenEl.textContent.match(/deur:\s?\d\d:\d\d/i)) {
                res.doorTime = tijdenEl.textContent
                    .match(/deur:\s?\d\d:\d\d/i)[0]
                    .match(/\d\d:\d\d/);
                res.door = `${res.startDate}T${res.doorTime}:00`;
            }

            if (tijdenEl.textContent.match(/aanvang:\s?\d\d:\d\d/i)) {
                res.startTime = tijdenEl.textContent
                    .match(/aanvang:\s?\d\d:\d\d/i)[0]
                    .match(/\d\d:\d\d/);
            }

            if (tijdenEl.textContent.match(/eindtijd:\s?\d\d:\d\d/i)) {
                res.endTime = tijdenEl.textContent
                    .match(/eindtijd:\s?\d\d:\d\d/i)[0]
                    .match(/\d\d:\d\d/);
                res.end = `${res.startDate}T${res.endTime}:00`;
            }

            if (!res.startTime && tijdenEl.textContent.match(/\d\d:\d\d/)) {
                res.startTime = tijdenEl.textContent.match(/\d\d:\d\d/)[0];
            }

            if (res.startTime) {
                res.start = `${res.startDate}T${res.startTime}:00`;
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
        selectors: [".event-page-header-image"],
        mode: "background-src"
    });
    pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
    pageInfo.image = imageRes.image;

    const priceRes = await this.getPriceFromHTML({
        page,
        event,
        pageInfo,
        selectors: ["#code_block-92-7"]
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
