import { workerData } from "worker_threads";
import { effenaarMonths } from "../mods/months.js";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const effenaarScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 30000,
    },
    singlepage: {
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
    ({ workerIndex }) => {
      return Array.from(
        document.querySelectorAll(".search-and-filter .agenda-card")
      )
        .filter((eventEl, index) => {
          return index % 4 === workerIndex;
        })
        .map((eventEl) => {
          const res = {};
          res.title = eventEl.querySelector(".card-title")?.textContent.trim();
          res.shortText = eventEl.querySelector(".card-subtitle")?.textContent;
          res.venueEventUrl = eventEl?.href;
          res.location = "effenaar";
          return res;
        });
    },
    { workerIndex: workerData.index }
  );

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
  
};

// GET PAGE INFO

effenaarScraper.getPageInfo = async function ({ page, url }) {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);

  await page.waitForSelector(".event-bar-inner-row");

  const pageInfo = await page.evaluate((effenaarMonths) => {
    const res = {
      unavailable: "",
      pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
      errorsVoorErrorHandler: [],
    };
    res.image = document.querySelector(".header-image img")?.src ?? null;
    res.priceTextcontent =
      document.querySelector(".tickets-btn")?.textContent ?? null;

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
      const monthNumber = effenaarMonths[monthName];
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
      document.querySelector(".header ~ .blocks")?.innerHTML ?? null;
    if (res.unavailable !== "") {
      res.unavailable = `${res.unavailable}\n${res.pageInfoID}`;
    }
    return res;
  }, effenaarMonths);

  pageInfo?.errorsVoorErrorHandler?.forEach((errorHandlerMeuk) => {
    _t.handleError(
      errorHandlerMeuk.error,
      workerData,
      errorHandlerMeuk.remarks
    );
  });
  clearTimeout(stopFunctie);
  !page.isClosed() && page.close();

  if (!pageInfo) {
    return {
      unavailable: `Geen resultaat <a href="${url}">van pageInfo</a>`,
    };
  }
  return pageInfo;
};
