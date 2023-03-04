
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const nuldertienScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    app: {
      mainPage: {
        url: "https://www.013.nl/programma/heavy",
        requiredProperties: ['venueEventUrl', 'title']
      }
    }
  }
}));

nuldertienScraper.listenToMasterThread();

// MAKE BASE EVENTS

nuldertienScraper.makeBaseEventList = async function () {
  
  const {stopFunctie, page} =  await this.makeBaseEventListStart()

  const rawEvents = await page.evaluate(({workerData}) => {
    return Array.from(document.querySelectorAll(".event-list-item"))
      .filter((eventEl, index) => index % workerData.workerCount === workerData.index)
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
        if (datumEl) {
          res.startDateTime = new Date(
            datumEl.getAttribute("datetime")
          ).toISOString();
        } else {
          res.unavailable = "geen datum gevonden";
        }
        res.shortText = eventEl
          .querySelector(".event-list-item__subtitle")
          ?.textContent.trim() ?? '';
        if (res.unavailable) {
          res.unavailable = `${res.unavailable}\n${res.pageInfoID}`;
        }
        return res;
      });
  }, {workerData});

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
};

// GET PAGE INFO

nuldertienScraper.getPageInfo = async function ({ page }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()

  const pageInfo = await page.evaluate(() => {
    const res = {
      pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
      errorsVoorErrorHandler: [],
    };
    res.image = document.querySelector(".event-spotlight__image")?.src;
    res.priceTextcontent = 
      document.querySelector(".practical-information tr:first-child dd")
        ?.textContent ?? '';
    res.priceContextText =
      document.querySelector(".practical-information")?.textContent ?? '';

    const doorOpenEl = document.querySelector(
      ".timetable__times dl:first-child time"
    );

    try {
      if (doorOpenEl) {
        res.doorOpenDateTime = new Date(
          doorOpenEl.getAttribute("datetime")
        ).toISOString();
      }
    } catch (error) {
      res.errorsVoorErrorHandler.push({
        error,
        remarks: "deur open tijd fout",
      });
    }
    res.soldOut = !!(document.querySelector('.order-tickets button[disabled]') ?? null)
    res.longTextHTML = 
      document.querySelector(
        ".event-detail header + div"
      )?.innerHTML ?? '';
    if (res.unavailable) {
      res.unavailable = `${res.unavailable}\n${res.pageInfoID}`;
    }
    return res;
  }, workerData);

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})

};
