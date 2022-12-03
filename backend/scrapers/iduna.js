import { idunaMonths } from "../mods/months.js"; // @TODO fatsoenlijke months mechanisme invoeren.
import MusicEvent from "../mods/music-event.js";
import { parentPort, workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./abstract-scraper.js";

// SCRAPER CONFIG

const scraperConfig = {
  baseEventTimeout: 15000,
  singlePageTimeout: 20000,
  maxExecutionTime: 30000,
  workerData: Object.assign({}, workerData),
};
const idunaScraper = new AbstractScraper(scraperConfig);

idunaScraper.listenToMasterThread();

// MAKE BASE EVENTS

idunaScraper.makeBaseEventList = async function () {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);
  const page = await this.browser.newPage();
  await page.goto("https://iduna.nl/", {
    waitUntil: "load",
  });

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
      // HACK VAN DE SITE ZELF
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

  clearTimeout(stopFunctie);
  !page.isClosed() && page.close();

  return metalEvents
    .map((event) => {
      (!event.venueEventUrl || !event.title) &&
        parentPort.postMessage(
          this.this.qwm.messageRoll(
            `Red het niet: <a href='${event.venueEventUrl}'>${event.title}</a> ongeldig.`
          )
        );
      return event;
    })
    .filter(_t.basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
};

// GET PAGE INFO

idunaScraper.getPageInfo = async function ({ page, url }) {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `getPageInfo is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);
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

      res.longTextHTML =
        document.querySelector("#postcontenttext")?.innerHTML ?? null;

      res.priceTextcontent =
        document.querySelector("#sideinfo")?.textContent.trim() ?? null;
      return res;
    },
    { months: idunaMonths }
  );
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
