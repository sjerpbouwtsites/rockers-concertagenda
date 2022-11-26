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
const nuldertienScraper = new AbstractScraper(scraperConfig);

nuldertienScraper.listenToMasterThread();

// MAKE BASE EVENTS

nuldertienScraper.makeBaseEventList = async function () {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `getPageInfo is de max tijd voor zn functie ${this.maxExecutionTimethis} voorbij `
    );
  }, this.maxExecutionTime);

  const page = await this.browser.newPage();
  await page.goto("https://www.013.nl/programma/heavy", {
    waitUntil: "load",
  });
  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".event-list-item"))
      .filter((eventEl, index) => {
        return index % 4 === workerIndex;
      })
      .map((eventEl) => {
        const res = {
          pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
          unavailable: null,
        };
        res.venueEventUrl = eventEl.querySelector(
          ".event-list-item__link"
        )?.href;
        res.title = eventEl
          .querySelector(".event-list-item__title")
          ?.textContent.trim();

        const datumEl = eventEl.querySelector(".event-list-item__date");
        if (!!datumEl) {
          res.startDateTime = new Date(
            datumEl.getAttribute("datetime")
          ).toISOString();
        } else {
          res.unavailable = "geen datum gevonden";
        }
        res.location = "013";
        res.shortText = eventEl
          .querySelector(".event-list-item__subtitle")
          ?.textContent.trim();
        if (!!res.unavailable) {
          res.unavailable = `${res.unavailable}\n${res.pageInfoID}`;
        }
        return res;
      });
  }, workerData.index);

  !page.isClosed() && page.close();
  clearTimeout(stopFunctie);
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

nuldertienScraper.getPageInfo = async function () {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `getPageInfo is de max tijd voor zn functie ${this.maxExecutionTimethis} voorbij `
    );
  }, this.maxExecutionTime);

  const page = await this.browser.newPage();

  const pageInfo = await page.evaluate(() => {
    const res = {
      pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
      errorsVoorErrorHandler: [],
    };
    res.image = document.querySelector(".event-spotlight__image")?.src;
    res.priceTextcontent =
      document.querySelector(".practical-information tr:first-child dd")
        ?.textContent ?? null;
    res.priceContextText =
      document.querySelector(".practical-information")?.textContent ?? null;

    const doorOpenEl = document.querySelector(
      ".timetable__times dl:first-child time"
    );

    try {
      if (!!doorOpenEl) {
        res.doorOpenDateTime = new Date(
          doorOpenEl.getAttribute("datetime")
        ).toISOString();
      }
    } catch (error) {
      errorsVoorErrorHandler.push({
        error,
        remarks: "deur open tijd fout",
      });
    }
    res.longTextHTML = document.querySelector(
      ".event-detail header + div"
    )?.innerHTML;
    if (!!res.unavailable) {
      res.unavailable = `${res.unavailable}\n${res.pageInfoID}`;
    }
    return res;
  }, null);

  pageInfo?.errorsVoorErrorHandler?.forEach((errorHandlerMeuk) => {
    _t.handleError(
      errorHandlerMeuk.error,
      workerData,
      errorHandlerMeuk.remarks
    );
  });

  if (!pageInfo) {
    return {
      unavailable: `Geen resultaat <a href="${url}">van pageInfo</a>`,
    };
  }

  !page.isClosed() && page.close();
  clearTimeout(stopFunctie);
  return pageInfo;
};
