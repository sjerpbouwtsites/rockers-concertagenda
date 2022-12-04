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
    singlePage: {
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

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  await _t.autoScroll(page);
  await _t.autoScroll(page);
  await _t.autoScroll(page);
  await _t.autoScroll(page);

  const rawEvents = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("[data-element='agenda'] li"))
      .filter((eventEl) => {
        const tags =
          eventEl
            .querySelector('[class*="styles_tags-list"]')
            ?.textContent.toLowerCase() ?? "";
        return tags.includes("metal") || tags.includes("punk");
      })
      .filter((eventEl, index) => index % this.workerData.workerCount === this.workerData.index)
      .map((eventEl) => {
        const res = {};
        const anchor = eventEl.querySelector("a");
        res.shortText = _t.killWhitespaceExcess(
          eventEl.querySelector('[class*="subtitle"]')?.textContent ?? "");
        res.title =
          eventEl.querySelector('h3[class*="title"]')?.textContent ?? "";
        res.venueEventUrl = anchor.href;
        res.location = "melkweg";
        return res;
      });
  }, null);

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
  
};

melkwegScraper.getPageInfo = async function ({ page }) {
 
  const {stopFunctie} =  await this.getPageInfoStart()
  
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
    res.priceTextcontent = _t.killWhitespaceExcess(
      document.querySelector('[class*="styles_ticket-prices"]')?.textContent ??
      '');
    res.longTextHTML = _t.killWhitespaceExcess(
      document.querySelector('[class*="styles_event-info"]')?.innerHTML ?? '');
    res.image =
      document.querySelector('[class*="styles_event-header__figure"] img')
        ?.src ?? null;
    if (res.unavailable !== "") {
      res.unavailable = `${res.unavailable}\n${res.pageInfoID}`;
    }
    return res;
  });

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})

};
