/* global document */
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/willemeen.js";
import getImage from "./gedeeld/image.js";
import { mapToShortDate } from "./gedeeld/datums.js";
import workTitleAndSlug from "./gedeeld/slug.js";
import terms from "../artist-db/store/terms.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
    workerData: { ...workerData },

    mainPage: {
        waitUntil: "load",
        url: "https://www.willemeen.nl/programma/"
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
            requiredProperties: [
                "venueEventUrl",
                "title",
                "shortText",
                "start"
            ],
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
            requiredProperties: [],
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

    // zet date op verschillende items
    await page.evaluate(() => {
        document.querySelectorAll(".we__agenda-row").forEach((row) => {
            const dateText = row.querySelector(
                ".we__agenda-item-date"
            )?.textContent;
            row.querySelectorAll(".we__agenda-item").forEach((rowItem) => {
                rowItem.setAttribute("date-text", dateText);
            });
        });
    });

    let rawEvents = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ workerData, months, unavailabiltyTerms }) =>
            Array.from(document.querySelectorAll(".we__agenda-item")).map(
                (rawEvent) => {
                    const title =
                        rawEvent
                            .querySelector("[data-text]")
                            ?.getAttribute("data-text") ?? "";
                    const res = {
                        anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
                        errors: [],
                        title
                    };
                    res.venueEventUrl =
                        rawEvent.querySelector(".stretched-link")?.href ?? "";
                    res.shortText =
                        rawEvent.querySelector(".we__agenda-item-genre")
                            ?.textContent ?? null;
                    res.startTime =
                        rawEvent.querySelector(".we__agenda-item-info")
                            ?.textContent ?? null;
                    const dateText = rawEvent.getAttribute("date-text") ?? "";
                    const dateM =
                        dateText.match(/(?<day>\d\d)\s+(?<monthletters>\w+)/) ??
                        null;
                    if (Array.isArray(dateM) && dateM.length === 3) {
                        res.month = months[dateM[2]];
                        res.year = new Date().getFullYear();
                        // eslint-disable-next-line prefer-destructuring
                        res.day = dateM[1];
                        const curM = new Date().getMonth() + 1;
                        if (res.month < curM) {
                            res.year += 1;
                        }
                        res.startDate = `${res.year}-${res.month}-${res.day}`;
                        res.start = `${res.startDate}T${res.startTime}:00`;
                    }

                    const uaRex = new RegExp(
                        unavailabiltyTerms.join("|"),
                        "gi"
                    );
                    res.unavailable = !!rawEvent.textContent.match(uaRex);
                    res.soldOut =
                        rawEvent?.textContent.match(
                            /uitverkocht|sold\s?out/i
                        ) ?? false;
                    return res;
                }
            ),
        {
            workerData,
            months: this.months,
            unavailabiltyTerms: terms.unavailability
        }
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

// #region       SINGLE PAGE
scraper.singlePage = async function ({ page, event }) {
    const { stopFunctie } = await this.singlePageStart();

    const pageInfo = {
        title: event.title,
        unavailable: event.unavailable,
        anker: `<a class='page-info' class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
        errors: []
    };

    // image zit in online dienst verstopt die 302 geeft.
    await page.evaluate(() => {
        Array.from(
            document.querySelectorAll(".main-img, .we_program_text_image")
        ).forEach((el) => {
            if (!el.hasAttribute("data-src")) return null;
            const srcM = el.getAttribute("data-src").match(/ret_img\/(.*)/);
            if (srcM) {
                // eslint-disable-next-line
                el.src = srcM[1];
            }
            return true;
        });
    });

    // const imageRes = await getImage({
    //     _this: this,
    //     page,
    //     workerData,
    //     event,
    //     pageInfo,
    //     selectors: [
    //         ".flickity-viewport img",
    //         ".main-img",
    //         ".we_program_text_image"
    //     ],
    //     mode: "image-src"
    // });
    // pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
    pageInfo.image = `../public/location-images/willemeen`;

    const priceRes = await this.getPriceFromHTML({
        page,
        event,
        pageInfo,
        selectors: [".ticket-col"]
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
