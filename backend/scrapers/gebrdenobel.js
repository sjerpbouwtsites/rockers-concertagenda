import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";
import { gebrdenobelMonths } from "../mods/months.js";

// SCRAPER CONFIG

const gebrdenobelScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 15000,
    },
    singlePage: {
      timeout: 20000
    },
    app: {
      mainPage: {
        url: "https://gebrdenobel.nl/programma/",
        requiredProperties: ['venueEventUrl', 'title']
      }
    }
  }
}));

gebrdenobelScraper.listenToMasterThread();

// MAKE BASE EVENTS

gebrdenobelScraper.makeBaseEventList = async function () {

  const {stopFunctie, page} =await this.makeBaseEventListStart()

  await _t.autoScroll(page);
  await _t.autoScroll(page);
  await _t.autoScroll(page);

  const rawEvents = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".event-item"))
      .filter((eventEl) => {
        const tags =
          eventEl.querySelector(".meta-tag")?.textContent.toLowerCase() ?? "";
        return (
          tags.includes("metal") ||
          tags.includes("punk") ||
          tags.includes("rock")
        );
      })
      .map((eventEl) => {
        const res = {};
        res.venueEventUrl =
          eventEl
            .querySelector(".jq-modal-trigger")
            ?.getAttribute("data-url") ?? "";

        res.title =
          eventEl.querySelector(".media-heading")?.textContent ?? null;
        res.location = "gebrdenobel";
        return res;
      });
  }, workerData.index);

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
  
};

// GET PAGE INFO

gebrdenobelScraper.getPageInfo = async function ({ page, url }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()

  const pageInfo = await page.evaluate(
    ({ months }) => {
      const res = {
        unavailable: "",
        pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
        errorsVoorErrorHandler: [],
      };
      const eventDataRows = Array.from(
        document.querySelectorAll(".event-table tr")
      );
      const dateRow = eventDataRows.find((row) =>
        row.textContent.toLowerCase().includes("datum")
      );
      const timeRow = eventDataRows.find(
        (row) =>
          row.textContent.toLowerCase().includes("open") ||
          row.textContent.toLowerCase().includes("aanvang")
      );
      const priceRow = eventDataRows.find((row) =>
        row.textContent.toLowerCase().includes("prijs")
      );
      if (dateRow) {
        const startDateMatch = dateRow.textContent.match(
          /(\d+)\s?(\w+)\s?(\d{4})/
        );
        if (Array.isArray(startDateMatch) && startDateMatch.length === 4) {
          const day = startDateMatch[1].padStart(2, "0");
          const month = months[startDateMatch[2]];
          const year = startDateMatch[3];
          res.month = startDateMatch[2];
          res.startDate = `${year}-${month}-${day}`;
        }

        if (!timeRow) {
          res.startDateTime = new Date(
            `${res.startDate}T00:00:00`
          ).toISOString();
        } else {
          const timeMatch = timeRow.textContent.match(/\d\d:\d\d/);
          if (Array.isArray(timeMatch) && timeMatch.length) {
            res.startDateTime = new Date(
              `${res.startDate}T${timeMatch[0]}:00`
            ).toISOString();
          } else {
            res.startDateTime = new Date(
              `${res.startDate}T00:00:00`
            ).toISOString();
          }
        }
      }

      if (priceRow) {
        res.priceTextcontent = _t.killWhitespaceExcess(priceRow.textContent);
      }
      res.shortText = _t.killWhitespaceExcess(
        document.querySelector(".hero-cta_left__text p")?.textContent ?? '');
      res.longTextHTML = _t.killWhitespaceExcess(
        document.querySelector(".js-contentBlocks")?.innerHTML ?? '');
      res.image = document.querySelector(".hero img")?.src ?? null;

      return res;
    },
    { months: gebrdenobelMonths }
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};
