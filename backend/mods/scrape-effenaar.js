import MusicEvent from "./music-event.js";
import puppeteer from "puppeteer";
import { parentPort, workerData } from "worker_threads";
import EventsList from "./events-list.js";
import fs from "fs";
import crypto from "crypto";
import fsDirections from "./fs-directions.js";
import { effenaarMonths } from "./months.js";
import {
  getPriceFromHTML,
  handleError,
  basicMusicEventsFilter,
  errorAfterSeconds,
  log,
} from "./tools.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";
import { QuickWorkerMessage } from "./rock-worker.js";

letScraperListenToMasterMessageAndInit(scrapeEffenaar);
async function scrapeEffenaar() {
  const qwm = new QuickWorkerMessage(workerData);
  parentPort.postMessage(qwm.workerInitialized());
  const browser = await puppeteer.launch();
  Promise.race([
    makeBaseEventList(browser, qwm, effenaarMonths),
    errorAfterSeconds(15000),
  ])
    .then((baseMusicEvents) => {
      parentPort.postMessage(qwm.workerStarted());
      const baseMusicEventsCopy = [...baseMusicEvents];
      return processSingleMusicEvent(browser, baseMusicEventsCopy, qwm);
    })
    .then((browser) => {
      parentPort.postMessage(qwm.workerDone(EventsList.amountOfEvents));
      EventsList.save(workerData.family, workerData.index);
      browser && browser.hasOwnProperty("close") && browser.close();
    })
    .catch((error) =>
      handleError(error, workerData, "outer catch scrape effenaar")
    );
}

async function processSingleMusicEvent(browser, baseMusicEvents, qwm) {
  qwm.todo(baseMusicEvents.length).forEach((JSONblob) => {
    parentPort.postMessage(JSONblob);
  });

  const newMusicEvents = [...baseMusicEvents];
  const firstMusicEvent = newMusicEvents.shift();

  if (!firstMusicEvent || baseMusicEvents.length === 0) {
    return browser;
  }
  const page = await browser.newPage();

  if (
    !(await page
      .goto(firstMusicEvent.venueEventUrl, {
        timeout: 20000,
      })
      .then(() => true)
      .catch((err) => {
        handleError(
          err,
          workerData,
          `Effenaar goto single page mislukt:<br><a href='${firstMusicEvent.venueEventUrl}'>${firstMusicEvent.title}</a><br>`
        );
      }))
  ) {
    return newMusicEvents.length
      ? processSingleMusicEvent(browser, newMusicEvents, qwm)
      : browser;
  }

  try {
    const pageInfo = await Promise.race([
      getPageInfo(page, effenaarMonths, qwm),
      errorAfterSeconds(15000),
    ]);

    if (pageInfo && pageInfo.priceTextcontent) {
      pageInfo.price = getPriceFromHTML(pageInfo.priceTextcontent);
    }

    if (pageInfo && pageInfo.longTextHTML) {
      let uuid = crypto.randomUUID();
      const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;

      fs.writeFile(longTextPath, pageInfo.longTextHTML, "utf-8", () => {});
      pageInfo.longText = longTextPath;
    }

    // no date no registration.
    if (pageInfo) {
      firstMusicEvent.merge(pageInfo);
    }
    firstMusicEvent.registerIfValid();
    if (!page.isClosed() && page.close());
  } catch (error) {
    handleError(pageInfoError, workerData, "get page info fail");
  }

  return newMusicEvents.length
    ? processSingleMusicEvent(browser, newMusicEvents, qwm)
    : browser;
}

async function getPageInfo(page, effenaarMonths, qwm) {
  let pageInfo = {};
  pageInfo.cancelReason = "";

  await page.waitForSelector(".event-bar-inner-row");

  pageInfo = await page.evaluate((effenaarMonths) => {
    const image = document.querySelector(".header-image img")?.src ?? null;
    const priceTextcontent =
      document.querySelector(".tickets-btn")?.textContent ?? null;
    let startDate, doorTime, startTime, doorOpenDateTime, startDateTime;

    try {
      const dateText =
        document.querySelector(".header-meta-date")?.textContent.trim() ?? "";
      if (!dateText) {
        return null;
      }
      const [, dayNumber, monthName, year] = dateText.match(
        /(\d+)\s(\w+)\s(\d\d\d\d)/
      );
      const fixedDay = dayNumber.padStart(2, "0");
      const monthNumber = effenaarMonths[monthName];
      startDate = `${year}-${monthNumber}-${fixedDay}`;
    } catch (error) {
      return {
        error: error.message,
      };
    }

    try {
      const startTimeAr = document
        .querySelector(".time-start-end")
        ?.textContent.match(/\d\d:\d\d/);
      if (Array.isArray(startTimeAr) && startTimeAr.length) {
        startTime = startTimeAr[0];
      }
      const doorTimeAr = document
        .querySelector(".time-open")
        ?.textContent.match(/\d\d:\d\d/);
      if (Array.isArray(doorTimeAr) && doorTimeAr.length) {
        doorTime = doorTimeAr[0];
      }
    } catch (error) {
      return {
        error: `${error.message}\n${startTime}\n${doorTime}`,
      };
    }

    try {
      if (doorTime) {
        doorOpenDateTime = new Date(
          `${startDate}T${doorTime}:00`
        ).toISOString();
      }

      if (startTime) {
        startDateTime = new Date(`${startDate}T${startTime}:00`).toISOString();
      }
    } catch (error) {
      return {
        error: error.message,
      };
    }

    const longTextHTML =
      document.querySelector(".header ~ .blocks")?.innerHTML ?? null;

    return {
      priceTextcontent,
      doorOpenDateTime,
      startDateTime,
      image,
      longTextHTML,
      doorTime,
      startTime,
    };
  }, effenaarMonths);
  if (pageInfo.error) {
    handleError(pageInfo.error, workerData, `Effenaar pageinfo `);
  }
  return pageInfo;
}

async function makeBaseEventList(browser, qwm, effenaarMonths) {
  const page = await browser.newPage();
  await page.goto("https://www.effenaar.nl/agenda?genres.title=heavy", {
    waitUntil: "load",
  });

  return page
    .evaluate(
      ({ workerIndex, months }) => {
        return Array.from(
          document.querySelectorAll(".search-and-filter .agenda-card")
        )
          .filter((eventEl, index) => {
            return index % 4 === workerIndex;
          })
          .map((eventEl, index) => {
            const res = {};
            res.title = "";
            const titleEl = eventEl.querySelector(".card-title");
            if (!!titleEl) {
              res.title = titleEl.textContent.trim();
            }
            res.shortText =
              eventEl.querySelector(".card-subtitle")?.textContent;

            res.venueEventUrl = eventEl?.href;

            res.location = "effenaar";
            return res;
          });
      },
      { workerIndex: workerData.index, months: effenaarMonths }
    )
    .then((rawEvents) => {
      return rawEvents
        .filter(basicMusicEventsFilter)
        .map((event) => new MusicEvent(event));
    })
    .catch((err) => {
      handleError(err, workerData, "make base event list");
    });
}
