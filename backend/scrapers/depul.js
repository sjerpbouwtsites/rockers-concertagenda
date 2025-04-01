/* global document */
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/depul.js";
import getImage from "./gedeeld/image.js";
import workTitleAndSlug from "./gedeeld/slug.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
    workerData: { ...workerData },

    mainPage: {
        timeout: 35000,
        url: "https://www.livepul.com/agenda/"
    },
    singlePage: {
        timeout: 10000
    },
    app: {
        mainPage: {
            requiredProperties: ["venueEventUrl", "title"],
            asyncCheckFuncs: ["refused", "allowedEvent"]
        },
        singlePage: {
            requiredProperties: ["venueEventUrl", "title", "price", "start"],
            // asyncCheckFuncs: ['goodTerms', 'isRock', 'saveRefused', 'emptyFailure'],
            asyncCheckFuncs: ["hasGoodTerms"]
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
    await this.waitTime(50);
    await this.autoScroll(page);
    await this.waitTime(50);

    let rawEvents = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ months, workerData }) =>
            Array.from(document.querySelectorAll(".agenda-item")).map(
                (rawEvent) => {
                    const title =
                        rawEvent.querySelector("h2")?.textContent.trim() ?? "";
                    const res = {
                        anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} - main - ${title}</a>`,
                        errors: [],
                        title
                    };
                    res.shortText =
                        rawEvent
                            .querySelector(".text-box .desc")
                            ?.textContent.trim() ?? "";

                    res.soldOut = !!rawEvent.querySelector("._soldout");

                    const startDay =
                        rawEvent
                            .querySelector(".time .number")
                            ?.textContent.trim()
                            ?.padStart(2, "0") ?? null;
                    const startMonthName =
                        rawEvent
                            .querySelector(".time .month")
                            ?.textContent.trim() ?? null;
                    const startMonth = months[startMonthName];
                    const startMonthJSNumber = Number(startMonth) - 1;
                    const refDate = new Date();
                    let startYear = refDate.getFullYear();
                    if (startMonthJSNumber < refDate.getMonth()) {
                        startYear += 1;
                    }
                    res.startDate = `${startYear}-${startMonth}-${startDay}`;
                    res.venueEventUrl =
                        rawEvent.querySelector("a")?.href ?? null;
                    return res;
                }
            ),
        { months: this.months, workerData }
    );
    rawEvents = rawEvents
        .map(this.isMusicEventCorruptedMapper)
        .map((re) => workTitleAndSlug(re, this._s.app.harvest.possiblePrefix));

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
                anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
                errors: []
            };

            try {
                const contentBox =
                    document.querySelector("#content-box") ?? null;
                if (contentBox) {
                    [
                        contentBox.querySelector(".item-bottom") ?? null,
                        contentBox.querySelector(".social-content") ?? null,
                        contentBox.querySelector(".facebook-comments") ?? null
                    ].forEach((removeFromContentBox) => {
                        if (removeFromContentBox) {
                            contentBox.removeChild(removeFromContentBox);
                        }
                    });
                }
            } catch (caughtError) {
                res.errors.push({
                    error: caughtError,
                    remarks: `longTextHTML ${res.anker}`,
                    toDebug: res
                });
            }

            const agendaTitleBar =
                document.getElementById("agenda-title-bar") ?? null;
            res.shortText = agendaTitleBar
                ?.querySelector("h3")
                ?.textContent.trim();
            const rightHandDataColumn =
                agendaTitleBar?.querySelector(".column.right") ?? null;
            if (!rightHandDataColumn) {
                return res;
            }

            rightHandDataColumn
                .querySelectorAll("h1 + ul li")
                ?.forEach((columnRow) => {
                    const lowerCaseTextContent =
                        columnRow?.textContent.toLowerCase();
                    if (lowerCaseTextContent.includes("datum")) {
                        try {
                            const startDateMatch = lowerCaseTextContent.match(
                                /(\d\d)\s+(\w{2,3})\s+(\d{4})/
                            );
                            if (
                                startDateMatch &&
                                Array.isArray(startDateMatch) &&
                                startDateMatch.length === 4
                            ) {
                                res.startDate = `${startDateMatch[3]}-${
                                    months[startDateMatch[2]]
                                }-${startDateMatch[1]}`;
                                if (!res.startDate) {
                                    throw Error("geen start date");
                                }
                            }
                        } catch (caughtError) {
                            res.errors.push({
                                error: caughtError,
                                remarks: `startDate mislukt ${event.title} ${res.anker}`,
                                toDebug: res
                            });
                        }
                    } else if (lowerCaseTextContent.includes("aanvang")) {
                        if (!res.startDate) {
                            return res;
                        }
                        try {
                            const startTimeMatch =
                                lowerCaseTextContent.match(/\d\d:\d\d/);
                            if (
                                startTimeMatch &&
                                Array.isArray(startTimeMatch) &&
                                startTimeMatch.length === 1
                            ) {
                                res.start = `${res.startDate}T${startTimeMatch[0]}:00`;
                            }
                        } catch (caughtError) {
                            res.errors.push({
                                error: caughtError,
                                remarks: `start en startDate samenvoegen ${res.anker}`,
                                toDebug: res
                            });
                        }
                    } else if (lowerCaseTextContent.includes("open")) {
                        if (!res.startDate) {
                            return res;
                        }
                        try {
                            const doorTimeMatch =
                                lowerCaseTextContent.match(/\d\d:\d\d/);
                            if (
                                doorTimeMatch &&
                                Array.isArray(doorTimeMatch) &&
                                doorTimeMatch.length === 1
                            ) {
                                res.door = `${res.startDate}T${doorTimeMatch[0]}:00`;
                            }
                        } catch (caughtError) {
                            res.errors.push({
                                error: caughtError,
                                remarks: `doorDateTime en startDate ${res.anker}`,
                                toDebug: res
                            });
                        }
                    }
                    if (!res.start && res.door) {
                        res.start = res.door;
                        res.door = null;
                    }
                    return res;
                });
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
        selectors: ["#content [style*='background']"],
        mode: "background-src"
    });
    pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
    pageInfo.image = imageRes.image;

    await page.evaluate(() => {
        document.querySelectorAll(".column.right li").forEach((listItem) => {
            if (listItem.innerHTML.includes("€")) {
                listItem.classList.add("depul-price-certain");
            }
        });
    });
    const priceRes = await this.getPriceFromHTML({
        page,
        event,
        pageInfo,
        selectors: [".depul-price-certain", ".column.right"]
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

    return this.singlePageEnd({
        pageInfo,
        stopFunctie,
        page,
        event
    });
};
// #endregion                         SINGLE PAGE
