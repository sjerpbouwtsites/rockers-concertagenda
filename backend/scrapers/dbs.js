import MusicEvent from "../mods/music-event.js";
import { parentPort, workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./abstract-scraper.js";
import { dbsMonths } from "../mods/months.js";

// SCRAPER CONFIG

const scraperConfig = {
  baseEventTimeout: 15000,
  singlePageTimeout: 30000,
  maxExecutionTime: 60000,
  puppeteerConfig: {
    singlePage: {
      waitUntil: "domcontentloaded", // @TODO overal invoeren
      timeout: 25000,
    },
  },
  workerData: Object.assign({}, workerData),
};
const dbsScraper = new AbstractScraper(scraperConfig);

dbsScraper.listenToMasterThread();

// MAKE BASE EVENTS

dbsScraper.makeBaseEventList = async function () {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);
  const page = await this.browser.newPage();

  await page.goto("https://www.dbstudio.nl/agenda/", {
    waitUntil: "load",
  });

  const rawEvents = await page.evaluate(
    ({ months, workerIndex }) => {
      return Array.from(document.querySelectorAll(".fusion-events-post"))
        .filter((eventEl, index) => {
          return index % 4 === workerIndex;
        })
        .map((eventEl) => {
          const res = {};
          const titleLinkEl = eventEl.querySelector(".fusion-events-meta .url");
          res.title = titleLinkEl ? titleLinkEl.textContent.trim() : "";
          res.venueEventUrl = titleLinkEl ? titleLinkEl.href : "";
          res.location = "dbs";
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
    { months: dbsMonths, workerIndex: workerData.index }
  );
  clearTimeout(stopFunctie);
  !page.isClosed() && page.close();

  this.dirtyLog(rawEvents);

  return rawEvents
    .map((event) => {
      (!event.venueEventUrl || !event.title) &&
        parentPort.postMessage(
          this.qwm.messageRoll(
            `Red het niet: <a href='${event.venueEventUrl}'>${event.title}</a> ongeldig.`
          )
        );
      return event;
    })
    .filter(_t.basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
};

// GET PAGE INFO

dbsScraper.getPageInfo = async function ({ page, url }) {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `getPageInfo is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);
  const pageInfo = await page.evaluate(() => {
    const res = {
      unavailable: "",
      pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
      errorsVoorErrorHandler: [],
    };
    res.longTextHTML =
      document.querySelector(".tribe-events-single-event-description")
        ?.innerHTML ?? null;
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

    return res;
  }, null);
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
  this.dirtyLog(pageInfo, "log");
  return pageInfo;
};
