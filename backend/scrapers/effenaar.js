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
          const title = eventEl.querySelector(".card-title")?.textContent.trim();
          const res = {
            unavailable: "",
            pageInfo: `<a href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],          
            title
          }
          res.shortText = eventEl.querySelector(".card-subtitle")?.textContent ?? '';
          res.venueEventUrl = eventEl?.href ?? null;
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

effenaarScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()

  await page.waitForSelector(".event-bar-inner-row");

  const pageInfo = await page.evaluate(({months, event}) => {
    const res = {
      unavailable: event.unavailable,
      pageInfo: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
      errors: [],
    };
    res.image = document.querySelector(".header-image img")?.src ?? null;
    res.priceTextcontent = 
      document.querySelector(".tickets-btn")?.textContent ?? '';

    try {
      const dateText =
        document.querySelector(".header-meta-date")?.textContent.trim() ?? "";
      if (!dateText) {
        res.unavailable += ' geen datumtext';
        return res;
      }
      const [, dayNumber, monthName, year] = dateText.match(
        /(\d+)\s(\w+)\s(\d\d\d\d)/
      );
      const fixedDay = dayNumber.padStart(2, "0");
      const monthNumber = months[monthName];
      res.startDate = `${year}-${monthNumber}-${fixedDay}`;
    } catch (caughtError) {
      res.errors.push({
        error: caughtError,
        remarks: `datumtext naar startDatum faal ${res.pageInfo}`,
      });
      res.unavailable += "datum omzetting faal";
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
    } catch (caughtError) {
      res.errors.push({
        error: caughtError,
        remarks: `date startDateTime etc faal ${res.pageInfo}`,
        //TODO debugger  ${startTimeAr.join( ""          )} ${doorTimeAr.join("")}      
      });
      res.unavailable += "Geen tijd gevonden";
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
    } catch (caughtError) {
      res.errors.push({
        error: caughtError,
        remarks: `omzetten naar Date iso gaat fout ${res.pageInfo}`,
        //TODO debugger ${startTimeAr.join(          ""          )} ${doorTimeAr.join("")}
      });
    }

    res.longTextHTML = document.querySelector(".header ~ .blocks")?.innerHTML ?? '';
    return res;
  },{ months: this.months,event});

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};
