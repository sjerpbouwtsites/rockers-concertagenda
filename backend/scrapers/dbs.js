import { parentPort, workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const dbsScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 60000,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 60000,
      waitUntil: 'domcontentloaded'
    },
    singlePage: {
      timeout: 45000
    },
    app: {
      mainPage: {
        url: "https://www.dbstudio.nl/agenda/",
        requiredProperties: ['venueEventUrl', 'title', 'startDateTime']
      }
    }
  }
}));

dbsScraper.listenToMasterThread();

// MAKE BASE EVENTS

dbsScraper.makeBaseEventList = async function () {

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  await page.waitForSelector('.fusion-events-post')
  await _t.waitFor(100)

  const rawEvents = await page.evaluate(
    ({ months,workerData }) => {
      return Array.from(document.querySelectorAll(".fusion-events-post"))
        .filter((eventEl, index) => index % workerData.workerCount === workerData.index)
        .map((eventEl) => {
          const res = {};
          const titleLinkEl = eventEl.querySelector(".fusion-events-meta .url");
          res.title = titleLinkEl ? titleLinkEl.textContent.trim() : "";
          res.venueEventUrl = titleLinkEl ? titleLinkEl.href : "";
          res.error = null;
          const startDateEl =
            eventEl.querySelector(".tribe-event-date-start") ?? null;
          if (!startDateEl) return null;
          const startTextcontent =
            eventEl
              .querySelector(".tribe-event-date-start")
              ?.textContent.toLowerCase() ?? "LEEG";
          res.eventDateText = startTextcontent;

          try {
            const match1 = startTextcontent.match(/(\d+)\s+(\w+)/);
            res.day = match1[1];
            let monthName = match1[2];
            res.month = months[monthName];
            res.day = res.day.padStart(2, "0");
            const yearMatch = startTextcontent.match(/\d{4}/);
            if (
              !yearMatch ||
              !Array.isArray(yearMatch) ||
              yearMatch.length < 1
            ) {
              res.year = new Date().getFullYear();
            } else {
              res.year = yearMatch[1];
            }
            res.year = res.year || new Date().getFullYear();
            res.time = startTextcontent
              .match(/\d{1,2}:\d\d/)[0]
              .padStart(5, "0");
            res.startDate = `${res.year}-${res.month}-${res.day}`;
            res.startDateTime = new Date(
              `${res.startDate}T${res.time}:00Z`
            ).toISOString();
          } catch (error) {
            res.error = error.message;
          }

          if (res.startDate) {
            try {
              const endDateEl =
                eventEl.querySelector(".tribe-event-time") ?? null;
              if (endDateEl) {
                const endDateM = endDateEl.textContent
                  .toLowerCase()
                  .match(/\d{1,2}:\d\d/);
                if (Array.isArray(endDateM) && endDateM.length > 0) {
                  res.endTime = endDateM[0].padStart(5, "0");
                  res.endDateTime = new Date(
                    `${res.startDate}T${res.endTime}:00Z`
                  ).toISOString();
                  if (res.endDateTime === res.startDateTime) {
                    res.endDateTime = null;
                  }
                }
              }
            } catch (error) {
              res.error = error.message;
            }
          }

          return res;
        });
    },
    { months: this.months,workerData }
  );
 
  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
  
};

// GET PAGE INFO

dbsScraper.getPageInfo = async function ({ page }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(() => {
    const res = {
      unavailable: "",
      pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
      errorsVoorErrorHandler: [],
    };
    res.longTextHTML = 
      document.querySelector(".tribe-events-single-event-description")
        ?.innerHTML ?? '';
    res.image =
      document.querySelector(".tribe-events-event-image .wp-post-image")?.src ??
      null;
    let categories =
      document.querySelector(".tribe-events-event-categories")?.textContent ??
      "";
    categories = categories.toLowerCase();
    res.isMetal =
      categories.includes("metal") ||
      categories.includes("punk") ||
      categories.includes("noise") ||
      categories.includes("doom") ||
      categories.includes("industrial");

    res.ticketURL = document.querySelector('.tribe-events-event-url a')?.href ?? null;
    if (!res.ticketURL){
      res.priceTextcontent = `€0,00`;
    }

    return res;
  }, null);

  if (pageInfo.ticketURL) {
    try {
      await page.goto(pageInfo.ticketURL)
      await page.waitForSelector('[data-testid]', {timeout: 6500})
      await _t.waitFor(250);
      pageInfo.priceTextcontent = await page.evaluate(()=>{
        return document.querySelectorAll('[data-testid]')[1]?.textContent ?? null
      })
    } catch (error) {
      parentPort.postMessage(this.qwm.debugger({
        error, remark: 'prijs ophalen dbs ticketpagina'
      }))
    }
  }

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};
