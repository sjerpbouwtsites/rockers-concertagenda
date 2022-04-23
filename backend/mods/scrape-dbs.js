import MusicEvent from "./music-event.js";
import puppeteer from "puppeteer";
import { parentPort } from "worker_threads";
import EventsList from "./events-list.js";
import { dbsMonths } from "./months.js";
import {
  handleError,
  log,
  basicMusicEventsFilter,
  postPageInfoProcessing,
} from "./tools.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";

letScraperListenToMasterMessageAndInit(scrapeDbs);
async function scrapeDbs(workerIndex) {
  const browser = await puppeteer.launch({
    headLess: false,
  });

  try {
    const baseMusicEvents = await makeBaseEventList(browser, workerIndex);

    await fillMusicEvents(browser, baseMusicEvents, workerIndex);
  } catch (error) {
    handleError(error);
  }
}

async function fillMusicEvents(browser, baseMusicEvents, workerIndex) {
  const baseMusicEventsCopy = [...baseMusicEvents];

  return processSingleMusicEvent(
    browser,
    baseMusicEventsCopy,
    workerIndex
  ).finally(() => {
    setTimeout(() => {
      browser.close();
    }, 5000);
    parentPort.postMessage({
      status: "done",
    });
    EventsList.save("dbs", workerIndex);
  });
}

async function processSingleMusicEvent(browser, baseMusicEvents, workerIndex) {
  parentPort.postMessage({
    status: "todo",
    message: baseMusicEvents.length,
  });

  const newMusicEvents = [...baseMusicEvents];
  const firstMusicEvent = newMusicEvents.shift();

  if (
    !firstMusicEvent ||
    baseMusicEvents.length === 0 ||
    !firstMusicEvent ||
    !firstMusicEvent.venueEventUrl
  ) {
    return true;
  }

  const page = await browser.newPage();
  await page.goto(firstMusicEvent.venueEventUrl, {
    waitUntil: "load",
  });

  let pageInfo = await getPageInfo(page);
  pageInfo = postPageInfoProcessing(pageInfo);

  firstMusicEvent.merge(pageInfo);
  if (firstMusicEvent.isValid && pageInfo.isMetal) {
    firstMusicEvent.register();
  }

  page.close();

  return newMusicEvents.length
    ? processSingleMusicEvent(browser, newMusicEvents, workerIndex)
    : true;
}

async function getPageInfo(page) {
  const pageInfo = await page.evaluate((dbsMonths) => {
    const res = {};

    res.longTextHTML =
      document.querySelector(".tribe-events-single-event-description")
        ?.innerHTML ?? null;
    res.image =
      document.querySelector(".tribe-events-event-image .wp-post-image")?.src ??
      null;
    let categories =
      document.querySelector(".tribe-events-event-categories")?.textContent ??
      "";
    categories = categories.toLowerCase();
    res.isMetal =
      categories.includes("metal") ||
      categories.includes("punk") ||
      categories.includes("noise") ||
      categories.includes("doom") ||
      categories.includes("industrial");

    return res;
  }, dbsMonths);
  return pageInfo;
}

async function makeBaseEventList(browser, workerIndex) {
  const page = await browser.newPage();
  await page.goto("https://www.dbstudio.nl/agenda/", {
    waitUntil: "load",
  });
  const rawEvents = await page.evaluate(
    ({ dbsMonths, workerIndex }) => {
      return Array.from(document.querySelectorAll(".fusion-events-post"))
        .filter((eventEl, index) => {
          return index % 3 === workerIndex;
        })
        .map((eventEl) => {
          const res = {};
          const titleLinkEl = eventEl.querySelector(".fusion-events-meta .url");
          res.title = titleLinkEl ? titleLinkEl.textContent.trim() : "";
          res.venueEventUrl = titleLinkEl ? titleLinkEl.href : "";
          res.dataIntegrity = 10;
          res.location = "dbs";
          res.error = "geen";
          try {
            const startDateEl = eventEl.querySelector(
              ".tribe-event-date-start"
            );
            res.startTExt = startDateEl?.textContent;

            if (startDateEl?.textContent) {
              const startDateMatch =
                startDateEl.textContent.match(/(\d+)\s+(\w+)\s/);
              const startTimeMatch =
                startDateEl.textContent.match(/@\s*(\d+:\d+)/);

              if (
                Array.isArray(startDateMatch) &&
                startDateMatch.length > 1 &&
                Array.isArray(startTimeMatch) &&
                startTimeMatch.length
              ) {
                const year = new Date().getFullYear();
                const month = dbsMonths[startDateMatch[2]];
                const day = startDateMatch[1].padStart(2, "0");
                res.startDate = `${year}-${month}-${day}`;
                res.startDateTime = new Date(
                  `${year}-${month}-${day}:${startTimeMatch[1]}`
                ).toISOString();
              }
            }
          } catch (error) {
            res.error = error.message;
          }

          try {
            let endDateEl = eventEl.querySelector(".tribe-event-time");
            let endTimeMatch = endDateEl?.textContent.match(/\@\s*(\d+:\d+)/);
            if (
              Array.isArray(endTimeMatch) &&
              endTimeMatch.length === 2 &&
              res.startDate
            ) {
              res.endDateTime = new Date(`${res.startDate}:${endTimeMatch[1]}`);
            } else {
              const endDateEl = eventEl.querySelector(".tribe-event-date-end");
              const endDateMatch =
                endDateEl?.textContent.match(/(\d+)\s+(\w+)\s/) ?? null;
              const endTimeMatch =
                endDateEl?.textContent.match(/\@\s*(\d+:\d+)/) ?? null;
              if (
                Array.isArray(endDateMatch) &&
                Array.isArray(endTimeMatch) &&
                endDateMatch.length === 3 &&
                endTimeMatch.length === 2
              ) {
                const year = new Date().getFullYear();
                const month = dbsMonths[endDateMatch[2]];
                const day = endDateMatch[1].padStart(2, "0");
                res.endDateTime = new Date(
                  `${year}-${month}-${day}:${endTimeMatch[1]}`
                ).toISOString();
              }
            }
          } catch (error) {
            res.error2 = error.message;
          }

          return res;
        });
    },
    { dbsMonths, workerIndex }
  );
  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}
