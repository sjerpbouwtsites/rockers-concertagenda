import { parentPort, workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import { kavkaMonths } from "../mods/months.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const kavkaScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 35000,
    },
    singlepage: {
      timeout: 30000
    },
    app: {
      mainPage: {
        url: "https://kavka.be/programma/",
        requiredProperties: ['venueEventUrl', 'title', 'startDateTime']
      }
    }
  }
}));

kavkaScraper.listenToMasterThread();

// MAKE BASE EVENTS

kavkaScraper.makeBaseEventList = async function () {

  const {stopFunctie, page} = this.makeBaseEventListStart()

  let rawEvents = await page.evaluate(
    ({ months }) => {
      return Array.from(document.querySelectorAll(".events-list > a"))
        .filter((rawEvent) => {
          const isMetalOrPunk = Array.from(rawEvent.querySelectorAll(".tags"))
            .map((a) => a.innerHTML.trim())
            .join(" ")
            .toLowerCase()
            .includes("metal");
          const isCancelled = !!rawEvent.querySelector(".cancelled");
          return isMetalOrPunk && !isCancelled;
        })
        .map((rawEvent) => {
          let startTimeM,
            startDateEl,
            startDate,
            startDay,
            startMonthName,
            startMonth,
            startMonthJSNumber,
            refDate,
            startYear;

          const res = {
            unavailable: "",
            pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
            errorsVoorErrorHandler: [],
          };
          try {
            startDateEl = rawEvent.querySelector("date .date") ?? null;
            startDay =
              startDateEl
                .querySelector(".day")
                ?.textContent.trim()
                ?.padStart(2, "0") ?? null;
            startMonthName =
              startDateEl.querySelector(".month")?.textContent.trim() ?? null;
            startMonth = months[startMonthName];
            startMonthJSNumber = Number(startMonth) - 1;
            refDate = new Date();
            startYear = refDate.getFullYear();
            if (startMonthJSNumber < refDate.getMonth()) {
              startYear = startYear + 1;
            }
            startDate = `${startYear}-${startMonth}-${startDay}`;
            startTimeM = rawEvent
              .querySelector(".loc-time time")
              ?.textContent.match(/\d\d:\d\d/);
            if (
              startTimeM &&
              Array.isArray(startTimeM) &&
              startTimeM.length > 0
            ) {
              res.dateStringAttempt = `${startDate}T${startTimeM[0]}:00`;
            } else {
              res.dateStringAttempt = `${startDate}T19:00:00`;
            }
            res.startDateTime = new Date(res.dateStringAttempt).toISOString();
          } catch (error) {
            res.errorsVoorErrorHandler.push({
              error,
              remarks:
                "weer zon gigantische trycatch om alle datum en tijden heen.",
            });
          }

          if (
            startTimeM &&
            Array.isArray(startTimeM) &&
            startTimeM.length > 1
          ) {
            res.dateStringAttempt = `${startDate}T${startTimeM[1]}:00`;
            res.doorOpenDateTime = new Date(
              res.dateStringAttempt
            ).toISOString();
          }

          res.title =
            rawEvent
              .querySelector("article h3:first-child")
              ?.textContent.trim() ?? "";
          res.shortText =
            rawEvent.querySelector("article h3 + p")?.textContent.trim() ?? "";
          res.location = "kavka";
          res.venueEventUrl = rawEvent.href;
          return res;
        });
    },
    { months: kavkaMonths }
  );
  
  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );

};

kavkaScraper.getPageInfo = async function ({ url, page }) {
  parentPort.postMessage(this.qwm.messageRoll(`kavka ga naar ${url}`));

  const stopFunctie = setTimeout(() => {
    throw new Error(
      `getPageInfo is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);
  let pageInfo;

  pageInfo = await page.evaluate(() => {
    const res = {
      unavailable: "",
      pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
      errorsVoorErrorHandler: [],
    };
    try {
      res.image =
        document.querySelector('div.desktop img[src*="kavka.be/wp-content"]')
          ?.src ?? "";
      if (!res.image) {
        res.image =
          document.querySelector('img[src*="kavka.be/wp-content"]')?.src ?? "";
      }

      res.longTextHTML =
        document.querySelector("h2 + .entry-content")?.innerHTML ?? null;

      res.priceTextcontent =
        document.querySelector(".prijzen")?.textContent.trim() ?? null;
      return res;
    } catch (error) {
      res.errorsVoorErrorHandler.push({
        error,
        remarks: `page info top level trycatch`,
      });
    }
  });

  parentPort.postMessage(this.qwm.toConsole(pageInfo));

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
