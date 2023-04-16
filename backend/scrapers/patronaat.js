import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";
// SCRAPER CONFIG

const patronaatScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 20000,
    },
    singlePage: {
      timeout: 15000,
    },
    app: {
      mainPage: {
        url: "https://patronaat.nl/programma/?type=event&s=&eventtype%5B%5D=157",
        requiredProperties: ['venueEventUrl', 'title']
      }
    }
  },
}));

patronaatScraper.listenToMasterThread();

// MAKE BASE EVENTS

patronaatScraper.makeBaseEventList = async function () {

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  const rawEvents = await page.evaluate(({workerData}) => {
    return Array.from(document.querySelectorAll(".overview__list-item--event"))
      .filter((eventEl, index) =>index % workerData.workerCount === workerData.index)
      .map((eventEl) => {
        const title = eventEl.querySelector(".event__name")?.textContent.trim();
        const res = {
          unavailable: '',
          pageInfo: `<a href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title
        };
        res.image =
          eventEl.querySelector("[class^='event__image'] img")?.src ?? null;
        res.venueEventUrl = eventEl.querySelector("a[href]")?.href ?? null;
        res.shortText = eventEl
          .querySelector(".event__subtitle")
          ?.textContent.trim() ?? '';
        res.soldOut = !!(eventEl.querySelector('.event__tags-item--sold-out') ?? null)
        return res;
      });
  }, {workerData});

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
};

// GET PAGE INFO

patronaatScraper.getPageInfo = async function ({ page, event }) {
 
  const {stopFunctie} =  await this.getPageInfoStart()

  const pageInfo = await page.evaluate(({months, event}) => {
    const res = {
      unavailable: event.unavailable,
      pageInfo: `<a href='${event.venueEventUrl}'>${event.title}</a>`,
      errors: [],
    };
    res.priceTextcontent = document
      .querySelector(".event__info-bar--ticket-price")
      ?.textContent.toLowerCase()
      .trim();

    try {
      res.startDatumM = document
        .querySelector(".event__info-bar--star-date")
        ?.textContent.toLowerCase()
        .match(/(\d{1,2})\s+(\w{3,4})\s+(\d\d\d\d)/);
      if (Array.isArray(res.startDatumM) && res.startDatumM.length >= 4) {
        let day = res.startDatumM[1].padStart(2, "0");
        let month = months[res.startDatumM[2]];
        let year = res.startDatumM[3];
        res.startDatum = `${year}-${month}-${day}`;
      }

      if (res.startDatum) {
        [
          ["doorOpenTime", ".event__info-bar--doors-open"],
          ["startTime", ".event__info-bar--start-time"],
          ["endTime", ".event__info-bar--end-time"],
        ].forEach((timeField) => {
          const [timeName, selector] = timeField;

          const mmm = document
            .querySelector(selector)
            ?.textContent.match(/\d\d:\d\d/);
          if (Array.isArray(mmm) && mmm.length === 1) {
            res[timeName] = mmm[0];
          }
        });

        if (!res.startTime) {
          res.startTime = res.doorOpenTime;
        }

        if (res.doorOpenTime) {
          res.doorOpenDateTime = new Date(
            `${res.startDatum}T${res.doorOpenTime}:00`
          ).toISOString();
        }
        if (res.startTime) {
          res.startDateTime = new Date(
            `${res.startDatum}T${res.startTime}:00`
          ).toISOString();
        }
        if (res.endTime) {
          res.endDateTime = new Date(
            `${res.startDatum}T${res.endTime}:00`
          ).toISOString();
        }
      }
    } catch (caughtError) { //TODO opsplitsen
      res.errors.push({
        error: caughtError,
        remarks: `Datum error patronaat.`,
      });
    }

    if (!res.startDateTime) {
      res.unavailable += "Geen starttijd gevonden.";
    }

    res.longTextHTML = document.querySelector(".event__content")?.innerHTML;
    if (res.unavailable !== "") {
      res.unavailable = `${res.unavailable}\n${res.pageInfo}`; //TODO naar alles doorzetten
    }
    return res;
  }, {months: this.months, event});

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};
