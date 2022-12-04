import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const afasliveScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 40000,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 60000,
    },
    singlePage: {
      timeout: 20000
    },
    app: {
      mainPage: {
        url: "https://www.afaslive.nl/agenda"
      }
    }
  }
}));

afasliveScraper.singleEventCheck = afasliveScraper.isRock;

afasliveScraper.listenToMasterThread();

// MAKE BASE EVENTS

afasliveScraper.makeBaseEventList = async function () {
  
  const {stopFunctie, page} = await this.makeBaseEventListStart()

  await _t.autoScroll(page);
  await _t.waitFor(750);
  
  await _t.autoScroll(page);
  await _t.waitFor(750);

  await _t.autoScroll(page);
  await _t.waitFor(750);

  await _t.autoScroll(page);
  await _t.waitFor(750);

  await _t.autoScroll(page);
  await _t.waitFor(750);
  
  await _t.autoScroll(page);

  const rawEvents = await page.evaluate(({workerData}) => {
    return Array.from(document.querySelectorAll(".agenda__item__block "))
      .filter((event, index) => index % workerData.workerCount === workerData.index)
      .map((agendaBlock) => {
        const res = {};
        res.venueEventUrl = agendaBlock.querySelector("a")?.href ?? null;
        res.image = agendaBlock.querySelector("img")?.src ?? null;
        res.title = agendaBlock.querySelector(".eventTitle")?.textContent ?? "";
        res.location = "afaslive";
        return res;
      });
  }, {workerData});

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
};

afasliveScraper.getPageInfo = async function ({ page }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(
    ({ months }) => {
      const res = {
        unavailable: "",
        pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
        errorsVoorErrorHandler: [],
      };

      const startDateMatch =
        document
          .querySelector(".eventTitle")
          ?.parentNode.querySelector("time")
          ?.textContent.match(/(\d+)\s+(\w+)\s+(\d\d\d\d)/) ?? null;
      if (
        startDateMatch &&
        Array.isArray(startDateMatch) &&
        startDateMatch.length > 3
      ) {
        res.startDate = `${startDateMatch[3]}-${months[startDateMatch[2]]}-${
          startDateMatch[1]
        }`;
      }

      const startEl = document.querySelector(
        ".eventInfo .tickets ~ p.align-mid ~ p.align-mid"
      );
      if (startEl) {
        const startmatch = startEl.textContent.match(/\d\d:\d\d/);
        if (startmatch) {
          res.startTime = startmatch[0];
        }
      }

      const doorEl = document.querySelector(
        ".eventInfo .tickets ~ p.align-mid"
      );
      if (doorEl) {
        const doormatch = doorEl.textContent.match(/\d\d:\d\d/);
        if (doormatch) {
          res.doorTime = doormatch[0];
        }
      }

      try {
        if (res.startTime) {
          res.startDateTime = new Date(
            `${res.startDate}T${res.startTime}:00`
          ).toISOString();
        }

        if (res.doorTime) {
          res.doorOpenDateTime = new Date(
            `${res.startDate}T${res.doorTime}:00`
          ).toISOString();
        }
      } catch (error) {
        res.errorsVoorErrorHandler.push({
          error,
          remarks: `error samen time en date ${res.startDate}T${res.startTime}:00 ${res.startDate}T${res.doorTime}:00`,
        });
      }
      if (!res.startDateTime) {
        res.unavailable += " geen startDateTime";
      }

      res.longTextHTML = 
        document.querySelector("article .wysiwyg")?.innerHTML ?? '';

      res.priceTextcontent = 
        document.querySelector("#tickets")?.textContent.trim() ?? '';
      return res;
    },
    { months: this.months }
  );
  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
};
