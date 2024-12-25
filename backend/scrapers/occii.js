/* global document */
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/occii.js";
import getImage from "./gedeeld/image.js";
import {
    mapToStartDate,
    mapToShortDate,
    mapToStartTime
} from "./gedeeld/datums.js";
import workTitleAndSlug from "./gedeeld/slug.js";
import terms from "../artist-db/store/terms.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
    workerData: { ...workerData },

    mainPage: {
        timeout: 90000,
        url: "https://occii.org/events/categories/rock/"
    },
    singlePage: {
        timeout: 45000
    },
    app: {
        harvest: {
            dividers: [`+`],
            dividerRex: "[\\+]",
            artistsIn: ["title"]
        },
        mainPage: {
            requiredProperties: ["venueEventUrl"],
            asyncCheckFuncs: [
                "refused",
                "allowedEvent",
                "forbiddenTerms",
                "hasGoodTerms",
                "hasAllowedArtist",
                "success"
            ]
        },
        singlePage: {
            requiredProperties: ["venueEventUrl", "title", "price", "start"],
            asyncCheckFuncs: ["forbiddenTerms", "success"]
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

    await page.evaluate(() => {
        document.querySelectorAll(".occii-event-times").forEach((t) => {
            const tt = t.textContent;
            const st = tt
                .split(",")
                .splice(1, 10)
                .map((a) => a.trim())
                .join(" ")
                .toLowerCase();
            // eslint-disable-next-line no-param-reassign
            t.textContent = st;
        });
    });

    await page.evaluate((months) => {
        document
            .querySelectorAll(".occii-event-times")
            .forEach((eventTimeEl) => {
                const eventTimeText = eventTimeEl.textContent;
                Object.entries(months).forEach(([monthName, monthNumber]) => {
                    if (eventTimeText.includes(monthName)) {
                        eventTimeEl.setAttribute("data-month", monthNumber);
                        const strippedT = eventTimeText
                            .replace(monthName, "")
                            .trim();
                        const dagM = strippedT.match(/\d+/);
                        if (Array.isArray(dagM)) {
                            const dagNaam = `${dagM}`.padStart(2, "0");
                            eventTimeEl.setAttribute("data-day", dagNaam);
                        }
                    }
                });
            });
    }, this.months);

    let rawEvents = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ workerData, unavailabiltyTerms }) => {
            // al geweest
            const rm = document.querySelector(
                "h1 ~ h1 + .occii-events-display-container"
            );
            rm.parentNode.removeChild(rm);

            return Array.from(
                document.querySelectorAll(
                    ".occii-events-display-container .occii-event-display"
                )
            ).map((occiiEvent) => {
                const firstAnchor = occiiEvent.querySelector("a");
                const { title } = firstAnchor;
                const res = {
                    anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
                    errors: [],
                    title
                };
                const oet = occiiEvent.querySelector(".occii-event-times");
                if (
                    !oet ||
                    !oet.hasAttribute("data-month") ||
                    !oet.hasAttribute("data-day")
                ) {
                    res.corrupt = true;
                    return res;
                }
                const month = oet.getAttribute("data-month");
                const day = oet.getAttribute("data-day");
                res.mapToStartDate = `${day} ${month}`;
                const eventText = occiiEvent.textContent.toLowerCase();
                const uaRex = new RegExp(unavailabiltyTerms.join("|"), "gi");
                res.unavailable = !!occiiEvent.textContent.match(uaRex);
                res.soldOut =
                    !!eventText.match(/uitverkocht|sold\s?out/i) ?? false;
                res.venueEventUrl = firstAnchor.href;
                res.shortText =
                    occiiEvent.querySelector(".occii-events-description")
                        ?.textContent ?? null;
                return res;
            });
        },
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

            res.mapToStartTime = document.querySelector(
                ".occii-event-details"
            ).textContent;

            res.genres = Array.from(
                document.querySelectorAll(
                    '.event-categories [href*="events/categories"]'
                )
            ).map((cats) => cats.textContent.toLowerCase().trim());

            if (res.genres.includes("electronic")) {
                res.genres.push("VERBODENGENRE");
            }

            return res;
        },
        { months: this.month, event }
    );

    pageInfo.startDate = event.startDate;
    pageInfo = mapToStartTime(pageInfo);
    pageInfo.start = `${pageInfo.startDate}T${pageInfo.startTime}`;

    const imageRes = await getImage({
        _this: this,
        page,
        workerData,
        event,
        pageInfo,
        selectors: [".wp-post-image"],
        mode: "image-src"
    });
    pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
    pageInfo.image = imageRes.image;

    await page.evaluate(() => {
        const t =
            document.querySelector(".occii-single-event, .occii-event-details")
                ?.textContent ?? "";
        const priceM = t.match(/€.*/);
        if (priceM) {
            let p = priceM[0];
            if (!p.match(/\d+,\d/) && p.match(/\d+-\d/)) {
                p = p.replace(/-\d/, "");
            }
            const priceEl = document.createElement("div");
            priceEl.id = "occii-temp-price";
            priceEl.innerHTML = p;
            document.body.appendChild(priceEl);
        }
    });

    const priceRes = await this.getPriceFromHTML({
        page,
        event,
        pageInfo,
        selectors: [
            "#occii-temp-price",
            ".occii-single-event",
            ".occii-event-details"
        ]
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
