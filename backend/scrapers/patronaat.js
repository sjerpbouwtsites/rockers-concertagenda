import MusicEvent from "../mods/music-event.js";
import { parentPort, workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./abstract-scraper.js";

// SCRAPER CONFIG

const scraperConfig = {
  baseEventTimeout: 30000,
  singlePageTimeout: 15000,
  workerData: Object.assign({}, workerData),
};
const patronaatScraper = new AbstractScraper(scraperConfig);

patronaatScraper.listenToMasterThread();

// MAKE BASE EVENTS

patronaatScraper.makeBaseEventList = async function () {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTimethis} voorbij `
    );
  }, this.maxExecutionTime);

  const page = await this.browser.newPage();
  await page.goto(
    "https://patronaat.nl/programma/?type=event&s=&eventtype%5B%5D=84",
    {
      waitUntil: "load",
    }
  );
  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".overview__list-item--event"))
      .filter((eventEl, index) => {
        return index % 3 === workerIndex;
      })
      .map((eventEl) => {
        const res = {};
        res.image =
          eventEl.querySelector("[class^='event__image'] img")?.src ?? null;
        res.venueEventUrl = eventEl.querySelector("a[href]")?.href ?? null;
        res.title = eventEl.querySelector(".event__name")?.textContent.trim();
        res.location = "patronaat";
        res.shortText = eventEl
          .querySelector(".event__subtitle")
          ?.textContent.trim();
        return res;
      });
  }, workerData.index);

  this.dirtyLog(rawEvents);

  clearTimeout(stopFunctie);

  return rawEvents
    .filter(_t.basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
};

// GET PAGE INFO

patronaatScraper.getPageInfo = async function ({ page, url }) {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `getPageInfo is de max tijd voor zn functie ${this.maxExecutionTimethis} voorbij `
    );
  }, this.maxExecutionTime);

  const pageInfo = await page.evaluate(() => {
    const res = {
      unavailable: "",
      pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
      errorsVoorErrorHandler: [],
    };
    res.priceTextcontent = document
      .querySelector(".event__info-bar--ticket-price")
      ?.textContent.toLowerCase()
      .trim();

    res.startDatum = "";
    try {
      let startDatumMatch = document.location.href.match(
        /(\d\d)\-(\d\d)\-(\d\d)/
      );
      if (startDatumMatch && startDatumMatch.length > 3) {
        const j = `20${startDatumMatch[3]}`;
        const m = startDatumMatch[2];
        const d = startDatumMatch[1];
        res.startDatum = `${j}-${m}-${d}`;
      }
    } catch (error) {
      res.unavailable = `${res.unavailable} mislukt datum te berekenen.`;
      res.errorsVoorErrorHandler.push([
        error,
        `get page info datum berekening`,
      ]);
    }

    res.startDateTime;
    try {
      const startEl = document.querySelector(".event__info-bar--start-time");
      let startTime;
      if (!!startEl && !!startDatum) {
        const match = startEl.textContent.trim().match(/(\d\d)[\:]+(\d\d)/);
        if (match && match.length) {
          res.startTime = match[0];
          res.startDateTime = new Date(
            `${startDatum}T${startTime}:00`
          ).toISOString();
        }
      }
    } catch (error) {
      res.unavailable = `${res.unavailable} \nmislukt tijd te berekenen.`;
      res.errorsVoorErrorHandler.push([error, `get page info tijd berekening`]);
    }

    res.doorOpenDateTime;
    try {
      const doorsEl = document.querySelector(".event__info-bar--doors-open");
      let doorsTime;
      if (!!doorsEl) {
        const match = doorsEl.textContent.trim().match(/(\d\d)[\:]+(\d\d)/);
        if (match && match.length) {
          res.doorsTime = match[0];
          res.doorOpenDateTime = new Date(
            `${startDatum}T${doorsTime}:00`
          ).toISOString();
        }
      }
    } catch (error) {
      res.errorsVoorErrorHandler.push([
        error,
        `get page info deur open berekening`,
      ]);
    }

    res.endDateTime;
    try {
      const endEl = document.querySelector(".event__info-bar--end-time");
      let endTime;
      if (!!endEl) {
        const match = endEl.textContent.trim().match(/(\d\d)[\:]+(\d\d)/);
        if (match && match.length) {
          endTime = match[0];
          endDateTime = new Date(`${startDatum}T${endTime}:00`);
          if (endDateTime < startDateTime) {
            endDateTime.setDate(startDateTime.getDate() + 1);
            endDateTime.setHours(startDateTime.getHours());
            endDateTime.setMinutes(startDateTime.getMinutes());
          }
        }
      }
      res.endDateTime = endDateTime.toISOString();
    } catch (error) {
      res.errorsVoorErrorHandler.push([
        error,
        `get page info eind avond berekening`,
      ]);
    }

    res.longTextHTML = document.querySelector(".event__content")?.innerHTML;
    if (!!res.unavailable) {
      res.unavailable = `${res.unavailable}\n${res.pageInfoID}`;
    }
    return res;
  }, null);

  pageInfo.errorsVoorErrorHandler.forEach((errorHandlerMeuk) => {
    _t.handleError(errorHandlerMeuk[0], workerData, errorHandlerMeuk[1]);
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
