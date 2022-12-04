import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import { doornRoosjeMonths } from "../mods/months.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const doornroosjeScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 35000,
      waitUntil: 'load'
    },
    singlepage: {
      timeout: 25000
    },
    app: {
      mainPage: {
        url: "https://www.doornroosje.nl/?genre=metal%252Cpunk%252Cpost-hardcore%252Cnoise-rock%252Csludge-rock",
        requiredProperties: ['venueEventUrl', 'title']
      }
    }
  }
}));

doornroosjeScraper.listenToMasterThread();

// MAKE BASE EVENTS

doornroosjeScraper.makeBaseEventList = async function () {
  
  const {stopFunctie, page} = await this.makeBaseEventListStart()

  await page.waitForSelector(".c-program__title");
  await _t.waitFor(50);

  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".c-program__item"))
      .filter((eventEl, index) => {
        return index % 3 === workerIndex;
      }) // de deling van die index afhankelijk van workerData.
      .map((eventEl) => {
        const res = {
          unavailable: null,
        };
        res.title =
          eventEl.querySelector(".c-program__title")?.textContent.trim() ??
          eventEl.querySelector("h1,h2,h3")?.textContent.trim();
        null;
        res.shortText =
          eventEl
            .querySelector(".c-program__content")
            ?.textContent.trim()
            .replace(res.title, "") ?? null;
        res.venueEventUrl = eventEl?.href;
        if (!res.title || !res.venueEventUrl) {
          res.unavailable = "title of url ontbreken";
        }
        res.location = "doornroosje";
        return res;
      });
  }, workerData.index);

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );

};

// GET PAGE INFO

doornroosjeScraper.getPageInfo = async function ({ page, url }) {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);

  const pageInfo = await page.evaluate((months) => {
    const res = {
      unavailable: "",
      pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
      errorsVoorErrorHandler: [],
    };
    res.image =
      document.querySelector(".c-header-event__image img")?.src ?? null;
    res.priceTextcontent =
      document.querySelector(".c-btn__price")?.textContent.trim() ?? null;
    res.longTextHTML =
      document.querySelector(".s-event__container")?.innerHTML ?? null;

    const embeds = document.querySelectorAll(".c-embed");
    res.longTextHTML =
      embeds?.length ?? false
        ? res.longTextHTML + embeds.innerHTML
        : res.longTextHTML;

    const startDateRauwMatch = document
      .querySelector(".c-event-data")
      ?.innerHTML.match(
        /(\d{1,2})\s*(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s*(\d{4})/
      ); // welke mongool schrijft zo'n regex
    let startDate;
    if (startDateRauwMatch && startDateRauwMatch.length) {
      const day = startDateRauwMatch[1];
      const month = months[startDateRauwMatch[2]];
      const year = startDateRauwMatch[3];
      startDate = `${year}-${month}-${day}`;
    } else {
      res.unavailable = "geen startdatum gevonden. ";
    }

    if (startDate) {
      const timeMatches = document
        .querySelector(".c-event-data")
        .innerHTML.match(/\d\d:\d\d/g);

      if (timeMatches && timeMatches.length) {
        try {
          if (timeMatches.length == 2) {
            res.startDateTime = new Date(
              `${startDate}:${timeMatches[1]}`
            ).toISOString();
            res.doorOpenDateTime = new Date(
              `${startDate}:${timeMatches[0]}`
            ).toISOString();
          } else if (timeMatches.length == 1) {
            res.startDateTime = new Date(
              `${startDate}:${timeMatches[0]}`
            ).toISOString();
          }
        } catch (error) {
          res.errorsVoorErrorHandler.push({
            error,
            remarks:
              "fout bij tijd of datums. matches: " +
              timeMatches +
              " datum: " +
              startDate,
          });
        }
      } else {
        res.unavailable += `geen tijden gevonden. `;
      }
    }
    if (res.unavailable) {
      res.unavailable += res.pageInfoID;
    }
    return res;
  }, doornRoosjeMonths);

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
