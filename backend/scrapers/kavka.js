import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const kavkaScraper = new AbstractScraper(
  makeScraperConfig({
    workerData: Object.assign({}, workerData),
    puppeteerConfig: {
      mainPage: {
        timeout: 35000,
      },
      singlePage: {
        timeout: 30000,
      },
      app: {
        mainPage: {
          url: "https://kavka.be/programma/",
          requiredProperties: ["venueEventUrl", "title", "startDateTime"],
        },
      },
    },
  })
);

kavkaScraper.listenToMasterThread();

// MAKE BASE EVENTS

kavkaScraper.makeBaseEventList = async function () {
  const { stopFunctie, page } = await this.makeBaseEventListStart();

  let rawEvents = await page.evaluate(
    ({ months, workerData }) => {
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

          const title =
            rawEvent
              .querySelector("article h3:first-child")
              ?.textContent.trim() ?? null;

          const res = {
            unavailable: "",
            pageInfo: `<a href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
            title,
          };

          // TODO BELACHELIJK GROTE TRY CATHC
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
          } catch (caughtError) {
            res.errors.push({
              error: caughtError,
              remarks: `kkgrote trycatch baseEventList iduna ${res.pageInfo}.`,
            });
          }
          if (!res.startDateTime) {
            res.unavailable += " geen startDateTime.";
            return res;
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

          res.shortText =
            rawEvent.querySelector("article h3 + p")?.textContent.trim() ?? "";
          res.venueEventUrl = rawEvent?.href ?? null;

          return res;
        });
    },
    { months: this.months, workerData }
  );

  return await this.makeBaseEventListEnd({
    stopFunctie,
    page,
    rawEvents,
  });
};

kavkaScraper.getPageInfo = async function ({ page, event }) {
  const { stopFunctie } = await this.getPageInfoStart();

  const pageInfo = await page.evaluate(({event}) => {
    const res = {
      unavailable: event.unavailable,
      pageInfo: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
      errors: [],
    };
    try {
      const imageEl =
        document.querySelector('div.desktop img[src*="kavka.be/wp-content"]') ??
        null;
      if (imageEl) { //TODO kan gewoon met selectors
        if (imageEl.hasAttribute("data-lazy-src")) {
          res.image = imageEl.getAttribute("data-lazy-src");
        } else if (imageEl.hasAttribute("src")) {
          res.image = imageEl.getAttribute("src");
        }
      }

      if (!res.image) {
        res.image =
          document.querySelector('img[src*="kavka.be/wp-content"]')?.src ?? "";
      }

      res.longTextHTML =
        document.querySelector("h2 + .entry-content")?.innerHTML ?? "";

      res.priceTextcontent =
        document.querySelector(".prijzen")?.textContent.trim() ?? "";
      return res;
    } catch (caughtError) {
      res.errors.push({
        error:caughtError,
        remarks: `page info top level trycatch ${res.pageInfo}`,
      });
    }
  }, {event});

  return await this.getPageInfoEnd({ pageInfo, stopFunctie, page });
};
