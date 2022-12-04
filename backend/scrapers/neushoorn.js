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
  } catch (error) {
    _t.handleError(error, workerData, "Neushoorn wacht op laden agenda pagina");
  }

  await page.click('[href*="Heavy"]');

  try {
    await page.waitForSelector(".productions__item", {
      timeout: this.singlePageTimeout,
    });
  } catch (error) {
    _t.handleError(
      error,
      workerData,
      "Neushoorn wacht op laden resultaten filter"
    );
  }

  await _t.waitFor(50);

  const rawEvents = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".productions__item")).map(
      (itemEl) => {
        const textContent = _t.killWhitespaceExcess(itemEl.textContent.toLowerCase());
        const isRockInText =
          textContent.includes("punk") ||
          textContent.includes("rock") ||
          textContent.includes("metal") ||
          textContent.includes("industrial") ||
          textContent.includes("noise");
        const title = itemEl.querySelector(
          ".productions__item__content span:first-child"
        ).textContent;
        const venueEventUrl = itemEl.href;
        const location = "neushoorn";
        return {
          location,
          venueEventUrl,
          textContent,
          isRockInText,
          title
        };
      }
    );
  }, workerData.index);
  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
};


// @TODO Rock control naar async

// GET PAGE INFO

neushoornScraper.getPageInfo = async function ({ page }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(
    ({ months }) => {
      const res = {
        unavailable: "",
        pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
        errorsVoorErrorHandler: [],
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
        res.startDate = "onbekend";
        res.unavailable += " geen start date";
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
        res.longTextHTML = _t.killWhitespaceExcess(longEl.innerHTML);
      } catch (error) {
        res.errorsVoorErrorHandler.push({
          error,
          remarks: "long text html poging mislukt",
        });
      }

      const imageEl = document.querySelector('[style*="url"]');
      res.imageElLen = imageEl.length;
      if (imageEl) {
        const imageMatch =
          imageEl.style.backgroundImage.match(/https.*jpg/) ?? null;
        if (imageMatch) {
          res.image = imageMatch[1];
        }
      }

      return res;
    },
    { months: neushoornMonths }
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};
