import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import { neushoornMonths } from "../mods/months.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const neushoornScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    singlePage: {
      timeout: 20000
    },
    app: {
      mainPage: {
        url: "https://neushoorn.nl/#/agenda",
        requiredProperties: ['venueEventUrl', 'title']
      }
    }
  }
}));

neushoornScraper.listenToMasterThread();

// MAKE BASE EVENTS

neushoornScraper.makeBaseEventList = async function () {

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  try {
    await page.waitForSelector('[href*="Heavy"]', {
      timeout: this.singlePageTimeout,
    });
    await page.click('[href*="Heavy"]');
    await page.waitForSelector(".productions__item", {
      timeout: this.singlePageTimeout,
    });
    await _t.waitFor(50);
  } catch (caughtError) {
    _t.handleError(caughtError, workerData, `Laad en klikwachten timeout neushoorn`, 'close-thread');
    return await this.makeBaseEventListEnd({
      stopFunctie, page, rawEvents:[]}
    );
  }

  const rawEvents = await page.evaluate(({workerData}) => {
    return Array.from(document.querySelectorAll(".productions__item"))
      .filter(eventEl => {
        const textContent = eventEl.textContent.toLowerCase();
        const isRockInText =
          textContent.includes("punk") ||
          textContent.includes("rock") ||
          textContent.includes("metal") ||
          textContent.includes("industrial") ||
          textContent.includes("noise");        
        return isRockInText;
      })
      .filter((eventEl, index) => index % workerData.workerCount === workerData.index)
      .map(
        (eventEl) => {
        
          const title = eventEl.querySelector(
            ".productions__item__content span:first-child"
          ).textContent;
          const res = {
            unavailable: "",
            pageInfo: `<a href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],          
            title
          }  

          res.venueEventUrl = eventEl.href;
          res.soldOut = !!(eventEl.querySelector(".chip")?.textContent.toLowerCase().includes('uitverkocht') ?? null)
          return res;
        }
      );
  }, {workerData});
  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
};


// @TODO Rock control naar async

// GET PAGE INFO

neushoornScraper.getPageInfo = async function ({ page,event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(
    ({ months, event }) => {
      const res = {
        unavailable: event.unavailable,
        pageInfo: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };

      const dateTextcontent =
        document.querySelector(".summary .summary__item:first-child")
          ?.textContent ?? "";
      const dateTextMatch = dateTextcontent.match(/\w+\s?(\d+)\s?(\w+)/);

      if (dateTextMatch && dateTextMatch.length === 3) {
        const year = "2022";
        const month = months[dateTextMatch[2]];
        const day = dateTextMatch[1].padStart(2, "0");
        res.startDate = `${year}-${month}-${day}`;
      } else {
        res.startDate = null;
        res.unavailable += " geen start date";
        return res;
      }

      const timeTextcontent =
        document.querySelector(".summary .summary__item + .summary__item")
          ?.textContent ?? "";
      const timeTextMatch = timeTextcontent.match(
        /(\d{2}:\d{2}).*(\d{2}:\d{2})/
      );
      if (timeTextMatch && timeTextMatch.length === 3) {
        res.doorOpenDateTime = new Date(
          `${res.startDate}T${timeTextMatch[1]}`
        ).toISOString();
        res.startDateTime = new Date(
          `${res.startDate}T${timeTextMatch[2]}`
        ).toISOString();
      } else {
        res.startDateTime = new Date(
          `${res.startDate}T${timeTextMatch[1]}`
        ).toISOString();
      }

      res.priceTextcontent =
        document.querySelector(".prices__item__price")?.textContent ?? null;
      res.priceContexttext =
        document.querySelector(".prices")?.textContent ?? null;

      try {
        const summaryEl = document.querySelector(".content .summary");
        const longEl = summaryEl.parentNode;
        longEl.removeChild(summaryEl);
        res.longTextHTML = longEl.innerHTML;
      } catch (caughtError) {
        res.errors.push({
          error: caughtError,
          remarks: `longTextHTML faal ${res.pageInfo}`,
        });
      }

      const imageMatch = document
        .querySelector(".header--theatre")
        ?.style.backgroundImage.match(/https.*.png|https.*.jpg/);
      if (imageMatch && imageMatch.length) {
        res.image = imageMatch[0];
      }

      return res;
    },
    { months: neushoornMonths, event }
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};
