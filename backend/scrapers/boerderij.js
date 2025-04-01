import { workerData } from "worker_threads";
// eslint-disable-next-line import/no-extraneous-dependencies
import axios from "axios";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/boerderij.js";
import getImage from "./gedeeld/image.js";
import debugSettings from "./gedeeld/debug-settings.js";
import workTitleAndSlug from "./gedeeld/slug.js";
import { mapToShortDate } from "./gedeeld/datums.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
    workerData: { ...workerData },

    mainPage: {
        timeout: 30005,
        url: `https://poppodiumboerderij.nl/includes/ajax/events.php?filters=6,7,8&search=&limit=69420&offset=0&lang_id=1&rooms=2,1&month=&year=`
    },
    singlePage: {
        timeout: 10000
    },
    app: {
        harvest: {
            dividers: [`&`],
            dividerRex: "[&]",
            artistsIn: ["title", "shortText"]
        },
        mainPage: {
            requiredProperties: ["venueEventUrl", "title"],
            asyncCheckFuncs: [
                "refused",
                "allowedEvent",
                "forbiddenTerms",
                "spotifyConfirmation",
                "metalEncyclopediaConfirmation"
            ]
        },
        singlePage: {
            requiredProperties: ["venueEventUrl", "title", "start"],
            asyncCheckFuncs: [
                "ifNotAllowedRefuse",
                "refused",
                "saveAllowedEvent",
                "harvestArtists"
            ]
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

    const { stopFunctie } = await this.mainPageStart();

    let rawEvents = await axios
        .get(this._s.mainPage.url)
        .then((response) => response.data);

    if (rawEvents.length) {
        rawEvents = rawEvents
            .map((event) => {
                const m = {
                    venueEventUrl: `https://poppodiumboerderij.nl/programma/${event.seo_slug}`,
                    shortText: event.subtitle,
                    title: `${event.title}`,
                    eventId: event.id
                };
                // tijdelijk ivm date in async
                m.startDate = event.event_date;
                m.startDateTime = `${m.startDate}T00:00:00`;
                const e = Object.assign(event, m);
                return e;
            })
            .map(mapToShortDate)
            .map((re) =>
                workTitleAndSlug(re, this._s.app.harvest.possiblePrefix)
            )
            .map(this.isMusicEventCorruptedMapper);
    }

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
// #endregion                         SINGLE PAGE

scraper.boerderijCustomPrice = async function (testText, pi, title) {
    const priceRes = {
        price: null,
        errors: []
    };
    if (!testText) {
        priceRes.errors.push({
            error: new Error("geen test text boerderij custom price")
        });
        return priceRes;
    }

    if (testText.match(/start/i)) {
        priceRes.price = null;
        if (debugSettings.debugPrice) {
            this.dirtyDebug({
                title,
                price: priceRes.price,
                type: "NOG ONBEKEND"
            });
        }
        return priceRes;
    }

    if (testText.match(/gratis|free/i)) {
        priceRes.price = 0;
        if (debugSettings.debugPrice) {
            this.dirtyDebug({
                title,
                price: priceRes.price,
                type: "GRATIS"
            });
        }
        return priceRes;
    }

    if (testText.match(/uitverkocht|sold\sout/i)) {
        priceRes.price = null;
        if (debugSettings.debugPrice) {
            this.dirtyDebug({
                title,
                price: priceRes.price,
                type: "UITVERKOCHT"
            });
        }
        return priceRes;
    }

    const priceMatch = testText
        .replaceAll(/[\s\r\t ]/g, "")
        .match(/(?<euros>\d+)(?<scheiding>[,.]?)(?<centen>\d\d|-)/);

    const priceMatchEuros = testText.replaceAll(/[\s\r\t ]/g, "").match(/\d+/);

    if (!Array.isArray(priceMatch) && !Array.isArray(priceMatchEuros)) {
        priceRes.errors.push({
            error: new Error(`geen match met ${pi}`)
        });
        return priceRes;
    }

    if (!Array.isArray(priceMatch) && Array.isArray(priceMatchEuros)) {
        priceRes.price = Number(priceMatchEuros[0]);
        if (Number.isNaN(priceRes.price)) {
            if (debugSettings.debugPrice) {
                this.dirtyDebug({
                    title,
                    price: priceRes.price
                });
            }
            return false;
        }

        return priceRes;
    }

    if (priceMatch.groups?.centen && priceMatch.groups?.centen.includes("-")) {
        priceMatch.groups.centen = "00";
    }

    try {
        if (priceMatch.groups.scheiding) {
            if (priceMatch.groups.euros && priceMatch.groups.centen) {
                priceRes.price =
                    (Number(priceMatch.groups.euros) * 100 +
                        Number(priceMatch.groups.centen)) /
                    100;
            }
            if (priceMatch.groups.euros) {
                priceRes.price = Number(priceMatch.groups.euros);
            }
        } else {
            priceRes.price = Number(priceMatch.groups.euros);
        }
        priceRes.price = Number(priceMatchEuros[0]);
        if (Number.isNaN(priceRes.price)) {
            if (debugSettings.debugPrice) {
                this.dirtyDebug({
                    title,
                    price: priceRes.price
                });
            }
            return false;
        }

        return priceRes;
    } catch (priceCalcErr) {
        priceRes.push({
            error: priceCalcErr,
            remarks: `price calc err ${pi}`,
            toDebug: { testText, priceMatch, priceRes }
        });
        return priceRes;
    }
};
