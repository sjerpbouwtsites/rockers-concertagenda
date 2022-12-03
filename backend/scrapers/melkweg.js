import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const melkwegScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 60000,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 30000,
      waitUntil: 'load'
    },
    singlepage: {
      timeout: 20000
    },
    app: {
      mainPage: {
        url: "https://www.melkweg.nl/nl/agenda",
        requiredProperties: ['venueEventUrl', 'title']
      }
    }
  }
}));

melkwegScraper.listenToMasterThread();

// MAKE BASE EVENTS

melkwegScraper.makeBaseEventList = async function () {

  const {stopFunctie, page} = this.makeBaseEventListStart()

  await _t.autoScroll(page);
  await _t.autoScroll(page);
  await _t.autoScroll(page);
  await _t.autoScroll(page);

  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll("[data-element='agenda'] li"))
      .filter((eventEl) => {
        const tags =
          eventEl
            .querySelector('[class*="styles_tags-list"]')
            ?.textContent.toLowerCase() ?? "";
        return tags.includes("metal") || tags.includes("punk");
      })
      .filter((eventEl, eventIndex) => {
        return eventIndex % 3 === workerIndex;
      })
      .map((eventEl) => {
        const res = {};
        const anchor = eventEl.querySelector("a");
        res.shortText =
          eventEl.querySelector('[class*="subtitle"]')?.textContent ?? "";
        res.title =
          eventEl.querySelector('h3[class*="title"]')?.textContent ?? "";
        res.venueEventUrl = anchor.href;
        res.location = "melkweg";
        return res;
      });
  }, workerData.index);

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
  
};

melkwegScraper.getPageInfo = async function ({ page, url }) {
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
    try {
      res.startDateTime = new Date(
        document
          .querySelector('[class*="styles_event-header"] time')
          ?.getAttribute("datetime") ?? null
      ).toISOString();
    } catch (error) {
      res.unavailable = "geen startDateTime";
      res.errorsVoorErrorHandler.push({
        error,
        remarks: `start date time ${
          document.querySelector('[class*="styles_event-header"] time')
            ?.outerHTML
        }`,
      });
    }
    res.priceTextcontent =
      document.querySelector('[class*="styles_ticket-prices"]')?.textContent ??
      null;
    res.longTextHTML =
      document.querySelector('[class*="styles_event-info"]')?.innerHTML ?? null;
    res.image =
      document.querySelector('[class*="styles_event-header__figure"] img')
        ?.src ?? null;
    if (res.unavailable !== "") {
      res.unavailable = `${res.unavailable}\n${res.pageInfoID}`;
    }
    return res;
  });

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
