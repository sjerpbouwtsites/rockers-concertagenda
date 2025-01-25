/* global document */
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/dbs.js";
import getImage from "./gedeeld/image.js";
import terms from "../artist-db/store/terms.js";
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
const dbsScraper = new AbstractScraper({
    workerData: { ...workerData },

    mainPage: {
        timeout: 60045,
        waitUntil: "domcontentloaded",
        url: "https://www.dbstudio.nl/agenda/"
    },
    singlePage: {
        timeout: 20000
    },
    app: {
        harvest: {
            dividers: [`+`],
            dividerRex: "[+]",
            artistsIn: ["title"]
        },
        mainPage: {
            requiredProperties: ["venueEventUrl", "title", "start"],
            asyncCheckFuncs: ["refused", "allowedEvent", "hasAllowedArtist"]
        },
        singlePage: {
            requiredProperties: ["venueEventUrl", "title", "price", "start"],
            asyncCheckFuncs: [
                "hasAllowedArtist",
                "spotifyConfirmation",
                "hasGoodTerms",
                "forbiddenTerms",
                "goodCategoriesInLongHTML",
                "failure"
            ]
        }
    }
});
// #endregion                          SCRAPER CONFIG

dbsScraper.listenToMasterThread();

// #region       MAIN PAGE
dbsScraper.mainPage = async function () {
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

    await page.waitForSelector(".fusion-events-post");
    await this.waitTime(500);

    let rawEvents = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ workerData, unavailabiltyTerms }) =>
            Array.from(document.querySelectorAll(".fusion-events-post")).map(
                (eventEl) => {
                    let title =
                        eventEl
                            .querySelector(".fusion-events-meta .url")
                            ?.textContent.trim() ?? null;
                    if (title.match(/sold\s?out|uitverkocht/i)) {
                        title = title.replace(
                            /\*?(sold\s?out|uitverkocht)\s?\*?\s?/i,
                            ""
                        );
                    }

                    if (title === "pro- pain") {
                        title = "pro-pain"; // TODO HACK
                    }

                    const res = {
                        anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} - main - ${title}</a>`,
                        errors: [],
                        title
                    };

                    const uaRex = new RegExp(
                        unavailabiltyTerms.join("|"),
                        "gi"
                    );
                    res.unavailable = !!eventEl.textContent.match(uaRex);

                    res.venueEventUrl =
                        eventEl.querySelector(".fusion-events-meta .url")
                            ?.href ?? null;

                    const datumTijdSplit = (
                        eventEl
                            .querySelector(".tribe-event-date-start")
                            ?.textContent.trim() ?? ""
                    ).split("@");
                    res.mapToStartDate = datumTijdSplit[0].trim();
                    res.mapToStartTime =
                        datumTijdSplit.length > 1
                            ? datumTijdSplit[1].trim()
                            : "20:00";
                    res.mapToEndTime =
                        eventEl
                            .querySelector(".tribe-event-time")
                            ?.textContent.trim() ?? "";

                    return res;
                }
            ),
        { workerData, unavailabiltyTerms: terms.unavailability }
    );

    rawEvents = rawEvents
        .map((re) => mapToStartDate(re, "dag-maandNaam", this.months))
        .map(mapToShortDate)
        .map(mapToStartTime)
        .map(mapToEndTime)
        .map(combineStartTimeStartDate)
        .map(combineEndTimeStartDate)
        .map((re) => workTitleAndSlug(re, this._s.app.harvest.possiblePrefix))
        .map(this.isMusicEventCorruptedMapper);

    this.dirtyLog(rawEvents);

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

    return this.mainPageEnd({
        stopFunctie,
        page,
        rawEvents: thisWorkersEvents
    });
};
// #endregion                          MAIN PAGE

// #region      SINGLE PAGE
dbsScraper.singlePage = async function ({ page, event }) {
    const { stopFunctie } = await this.singlePageStart();

    const pageInfo = await page.evaluate(
        () => {
            const res = {
                anker: `<a class='page-info' href='${document.location.href}'>${document.title}</a>`,
                errors: []
            };

            res.shortText =
                document
                    .querySelector(
                        ".tribe-events-single-event-description > p, .tribe-events-single-event-description *:first-child"
                    )
                    ?.textContent.trim() ?? "";
            res.ticketURL =
                document.querySelector(".tribe-events-event-url a")?.href ??
                null;
            if (!res.ticketURL) {
                res.price = "0";
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
        selectors: [".tribe-events-event-image .wp-post-image"],
        mode: "image-src"
    });
    pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
    pageInfo.image = imageRes.image;

    const { mediaForHTML, textForHTML } = await longTextSocialsIframes(
        page,
        event,
        pageInfo
    );
    pageInfo.mediaForHTML = mediaForHTML;

    pageInfo.textForHTML = textForHTML;

    if (pageInfo.ticketURL && !pageInfo.unavailable) {
        if (this.debugPrice)
            this.dirtyTalk(`gaan naar url ${pageInfo.ticketURL}`);
        try {
            await page.goto(pageInfo.ticketURL);
            const html = await page
                .evaluate(() => document.querySelector("body").innerHTML)
                .catch((err) => {
                    this.dirtyDebug({
                        title: "error ticketURL",
                        err
                    });
                });

            const price =
                Number(
                    html
                        .match(/€\d{1,3}[,.]\d\d/)[0]
                        .replace(/€/, "")
                        .replace(/[,.]/, "")
                ) / 100;
            pageInfo.price = price;
        } catch (caughtError) {
            // er is gewoon geen prijs beschikbaar.
            this.dirtyDebug({
                title: "error ticketURL",
                caughtError
            });
        }
    }

    return this.singlePageEnd({
        pageInfo,
        stopFunctie,
        page,
        event
    });
};
// #endregion                         SINGLE PAGE
