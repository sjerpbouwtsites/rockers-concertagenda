import MusicEvent from "../mods/music-event.js";
import { parentPort, workerData } from "worker_threads";
import { effenaarMonths } from "../mods/months.js";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./abstract-scraper.js";

// SCRAPER CONFIG

const scraperConfig = {
  baseEventTimeout: 30000,
  singlePageTimeout: 15000,
  workerData: Object.assign({}, workerData),
};
const effenaarScraper = new AbstractScraper(scraperConfig);

effenaarScraper.listenToMasterThread();

// MAKE BASE EVENTS

effenaarScraper.makeBaseEventList = async function () {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);

  const page = await this.browser.newPage();
  await page.goto("https://www.effenaar.nl/agenda?genres.title=heavy", {
    waitUntil: "load",
  });

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

  clearTimeout(stopFunctie);
  !page.isClosed() && page.close();

  return rawEvents
    .map((event) => {
      !event.venueEventUrl &&
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
