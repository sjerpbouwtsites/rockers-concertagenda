import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const effenaarScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 30000,
    },
    singlePage: {
      timeout: 15000
    },
    app: {
      mainPage: {
        url: 'https://www.effenaar.nl/agenda?genres.title=heavy',
        requiredProperties: ['venueEventUrl', 'title']
      }
    }
  }
}));

effenaarScraper.listenToMasterThread();

// MAKE BASE EVENTS

effenaarScraper.makeBaseEventList = async function () {

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  const rawEvents = await page.evaluate(
    ({workerData}) => {
      return Array.from(
        document.querySelectorAll(".search-and-filter .agenda-card")
      )
        .filter((eventEl, index) => index % workerData.workerCount === workerData.index)
        .map((eventEl) => {
          const res = {};
          res.title = eventEl.querySelector(".card-title")?.textContent.trim();
          res.shortText = eventEl.querySelector(".card-subtitle")?.textContent ?? '';
          res.venueEventUrl = eventEl?.href;
          res.soldOut = !!(eventEl.querySelector('.card-content .card-status')?.textContent.toLowerCase().includes('uitverkocht') ?? null)
          return res;
        });
    },
    {workerData}
  );

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
  
};

// GET PAGE INFO

effenaarScraper.getPageInfo = async function ({ page }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()

  await page.waitForSelector(".event-bar-inner-row");

  const pageInfo = await page.evaluate(({months}) => {
    const res = {
      unavailable: "",
      pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
      errorsVoorErrorHandler: [],
    };
    res.image = document.querySelector(".header-image img")?.src ?? null;
    res.priceTextcontent = 
      document.querySelector(".tickets-btn")?.textContent ?? '';

    try {
      const dateText =
        document.querySelector(".header-meta-date")?.textContent.trim() ?? "";
      if (!dateText) {
        return null;
      }
      const [, dayNumber, monthName, year] = dateText.match(
        /(\d+)\s(\w+)\s(\d\d\d\d)/
      );
      const fixedDay = dayNumber.padStart(2, "0");
      const monthNumber = months[monthName];
      res.startDate = `${year}-${monthNumber}-${fixedDay}`;
    } catch (error) {
      res.errorsVoorErrorHandler.push({
        error,
        remarks: "bepalen datum get page info",
      });
      res.unavailable = "Geen datum";
    }

    let startTimeAr = [],
      doorTimeAr = [];
    try {
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
    } catch (error) {
      res.errorsVoorErrorHandler.push({
        error,
        remarks: `starttijd & deurtijd ${startTimeAr.join(
          ""
        )} ${doorTimeAr.join("")} get page info`,
      });
      res.unavailable = "Geen tijd";
    }

    res.startDateTimeString = `${res.startDate}T${res.startTime}:00`;
    res.openDoorDateTimeString = `${res.startDate}T${res.doorTime}:00`;

    try {
      if (res.doorTime) {
        res.doorOpenDateTime = new Date(
          `${res.openDoorDateTimeString}`
        ).toISOString();
      }

      if (res.startTime) {
        res.startDateTime = new Date(
          `${res.startDateTimeString}`
        ).toISOString();
      }
    } catch (error) {
      res.errorsVoorErrorHandler.push({
        error,
        remarks: `omzetten naar Date iso gaat fout ${startTimeAr.join(
          ""
        )} ${doorTimeAr.join("")} get page info`,
      });
      res.unavailable = "Geen tijd";
    }

    res.longTextHTML = 
      document.querySelector(".header ~ .blocks")?.innerHTML ?? '';
    if (res.unavailable !== "") {
      res.unavailable = `${res.unavailable}\n${res.pageInfoID}`;
    }
    return res;
  },{ months: this.months});

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};
