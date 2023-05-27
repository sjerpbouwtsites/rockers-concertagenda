import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const kavkaScraper = new AbstractScraper(
  makeScraperConfig({
    workerData: Object.assign({}, workerData),
    puppeteerConfig: {
      mainPage: {
        timeout: 35015,
      },
      singlePage: {
        timeout: 30016,
      },
      app: {
        mainPage: {
          url: "https://kavka.be/programma/",
          requiredProperties: ["venueEventUrl", "title", "startDateTime"],
        },
        singlePage: {
          requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
        }
      },
    },
  })
);

kavkaScraper.listenToMasterThread();

// MAKE BASE EVENTS

kavkaScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }  

  const { stopFunctie, page } = await this.makeBaseEventListStart();

  let rawEvents = await page.evaluate(
    ({ months, workerData }) => {
      return Array.from(document.querySelectorAll(".events-list > a"))
        .filter((rawEvent) => {
          return Array.from(rawEvent.querySelectorAll(".tags"))
            .map((a) => a.textContent.trim().toLowerCase())
            .join(' ').includes("metal");
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
            pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
            title,
          };
          if (rawEvent.querySelector(".cancelled")) {
            res.unavailable = 'cancelled'
          }

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
              toDebug: res
            });
          }

          try {
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
          } catch (error) {
            res.errors.push({
              remarks: `openDoorDateTime faal ${res.pageInfo}`,
              toDebug: res
            })
          }

          res.soldOut = !!rawEvent.querySelector(".badge")?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;

          res.shortText =
            rawEvent.querySelector("article h3 + p")?.textContent.trim() ?? "";
          res.venueEventUrl = rawEvent?.href ?? null;

          return res;
        });
    },
    { months: this.months, workerData }
  );

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
};

kavkaScraper.getPageInfo = async function ({ page, event }) {
  const { stopFunctie } = await this.getPageInfoStart();

  await page.waitForSelector('img[src*="kavka.be/wp-content"].lazyloaded',{
    timeout: 1500,
  }).catch(err => {
    // niets doen.
  })

  const pageInfo = await page.evaluate(({event}) => {
    const res = {
      unavailable: event.unavailable,
      pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
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

      if (!res.image){
        res.errors.push({
          remarks: `image missing ${res.pageInfo}`
        })
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
        toDebug: {res,event}
      });
    }
  }, {event});

  return await this.getPageInfoEnd({ pageInfo, stopFunctie, page });
};
