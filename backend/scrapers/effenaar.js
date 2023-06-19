import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const effenaarScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 30013,
    },
    singlePage: {
      timeout: 15014
    },
    app: {
      mainPage: {
        url: 'https://www.effenaar.nl/agenda?genres.title=heavy',
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  }
}));

effenaarScraper.listenToMasterThread();

// MAKE BASE EVENTS

effenaarScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }    

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  let rawEvents = await page.evaluate(
    ({workerData}) => {
      return Array.from(
        document.querySelectorAll(".search-and-filter .agenda-card")
      )
        .map((eventEl) => {
          const title = eventEl.querySelector(".card-title")?.textContent.trim();
          const res = {
            pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],          
            title
          }
          res.shortText = eventEl.querySelector(".card-subtitle")?.textContent ?? '';
          res.venueEventUrl = eventEl?.href ?? null;
          res.soldOut = !!eventEl.querySelector('.card-content .card-status')?.innerHTML.match(/uitverkocht|sold\s?out/i) ?? null;
          return res;
        });
    },
    {workerData}
  )
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
  
};

// GET PAGE INFO

effenaarScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()

  await page.waitForSelector(".event-bar-inner-row");

  const pageInfo = await page.evaluate(({months, event}) => {
    const res = {
      pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
      errors: [],
    };
    res.image = document.querySelector(".header-image img")?.src ?? null;
    if (!res.image){
      res.errors.push({
        remarks: `image missing ${res.pageInfo}`
      })
    }  
    res.priceTextcontent = 
      document.querySelector(".tickets-btn")?.textContent ?? '';

    const dateText =
        document.querySelector(".header-meta-date")?.textContent.trim() ?? "";
    if (!dateText) {
      res.errors.push({
        remarks: `geen datumtext ${res.pageInfo}`,
      })
      res.corrupted = 'geen datum tekst';
    } else {
      const [, dayNumber, monthName, year] = dateText.match(
        /(\d+)\s(\w+)\s(\d\d\d\d)/
      );
      const fixedDay = dayNumber.padStart(2, "0");
      const monthNumber = months[monthName];
      res.startDate = `${year}-${monthNumber}-${fixedDay}`;
    }

    let startTimeAr = [],
      doorTimeAr = [];
    if (res.startDate){
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
      res.startDateTimeString = `${res.startDate}T${res.startTime}:00`;
      res.openDoorDateTimeString = `${res.startDate}T${res.doorTime}:00`;
    }

  
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
        toDebug: {
          ars: `${startTimeAr.join("")} ${doorTimeAr.join("")}`,
          res, event
        }
      });
    }

    res.longTextHTML = document.querySelector(".header ~ .blocks")?.innerHTML ?? '';
    return res;
  },{ months: this.months,event});

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};
