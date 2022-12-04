import { idunaMonths } from "../mods/months.js"; // @TODO fatsoenlijke months mechanisme invoeren.
import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const idunaScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    singlePage: {
      timeout: 20000
    },
    mainPage: {
      waitUntil: 'load'
    },
    app: {
      mainPage: {
        url: "https://iduna.nl/",
        requiredProperties: ['venueEventUrl', 'title']
      }
    }
  }
}));

idunaScraper.listenToMasterThread();

// MAKE BASE EVENTS

idunaScraper.makeBaseEventList = async function () {

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  let metalEvents = await page
    .evaluate(() => {
      loadposts("metal", 1, 50); // eslint-disable-line
      return new Promise((resolve) => {
        setTimeout(() => {
          const metalEvents = Array.from(
            document.querySelectorAll("#gridcontent .griditemanchor")
          ).map((event) => {
            return {
              venueEventUrl: event.href,
              title: event.querySelector(".griditemtitle")?.textContent.trim(),
              location: "iduna",
            };
          });
          resolve(metalEvents);
        }, 2500);
      });
    })
    .then((metalEvents) => metalEvents);

  let punkEvents = await page
    .evaluate(() => {
      // no-eslint
      // hack VAN DE SITE ZELF
      loadposts("punk", 1, 50); // eslint-disable-line

      return new Promise((resolve) => {
        setTimeout(() => {
          const punkEvents = Array.from(
            document.querySelectorAll("#gridcontent .griditemanchor")
          ).map((event) => {
            return {
              venueEventUrl: event.href,
              title: event.querySelector(".griditemtitle")?.textContent.trim(),
              location: "iduna",
            };
          });
          resolve(punkEvents);
        }, 2500);
      });
    })
    .then((punkEvents) => punkEvents);
    
  const metalEventsTitles = metalEvents.map((event) => {
    return event.title;
  });
    
  punkEvents.forEach((punkEvent) => {
    if (!metalEventsTitles.includes(punkEvent)) {
      metalEvents.push(punkEvent);
    }
  });
    
  this.dirtyLog(metalEvents)
  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents: metalEvents}
  );
};

// GET PAGE INFO

idunaScraper.getPageInfo = async function ({ page }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(
    ({ months }) => {
      const res = {
        unavailable: "",
        pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
        errorsVoorErrorHandler: [],
      };
      try {
        const startDateMatch =
          document
            .querySelector("#sideinfo .capitalize")
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

        const startEl = Array.from(
          document.querySelectorAll("#sideinfo h2")
        ).find((h2El) => {
          return h2El.textContent.toLowerCase().includes("aanvang");
        });
        if (startEl) {
          const startmatch = startEl.textContent.match(/\d\d:\d\d/);
          if (startmatch) {
            res.startTime = startmatch[0];
          }
        }

        const doorEl = Array.from(
          document.querySelectorAll("#sideinfo h2")
        ).find((h2El) => {
          return h2El.textContent.toLowerCase().includes("deur");
        });
        if (doorEl) {
          const doormatch = doorEl.textContent.match(/\d\d:\d\d/);
          if (doormatch) {
            res.doorTime = doormatch[0];
          }
        }

        if (res.startTime) {
          res.startDateTime = new Date(
            `${res.startDate}T${res.startTime}:00`
          ).toISOString();
        } else if (res.doorTime) {
          res.startDateTime = new Date(
            `${res.startDate}T${res.doorTime}:00`
          ).toISOString();
        }

        if (res.startTime && res.doorTime) {
          res.doorOpenDateTime = new Date(
            `${res.startDate}T${res.doorTime}:00`
          ).toISOString();
        }
      } catch (error) {
        res.errorsVoorErrorHandler.push({
          error,
          remarks: "verrekte onhandige massa-trycatch",
        });
      }

      if (!res.startDateTime) {
        res.unavailable += " geen startDateTime";
      }

      const imageMatch = document
        .getElementById("photoandinfo")
        .innerHTML.match(/url\('(.*)'\)/);
      if (imageMatch && Array.isArray(imageMatch) && imageMatch.length === 2) {
        res.image = imageMatch[1];
      }

      res.longTextHTML = _t.killWhitespaceExcess(
        document.querySelector("#postcontenttext")?.innerHTML ?? '');

      res.priceTextcontent = _t.killWhitespaceExcess(
        document.querySelector("#sideinfo")?.textContent.trim() ?? '');
      return res;
    },
    { months: idunaMonths }
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};
