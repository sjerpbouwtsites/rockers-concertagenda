import MusicEvent from "../mods/music-event.js";
import puppeteer from "puppeteer";
import { parentPort, workerData } from "worker_threads";
import EventsList from "../mods/events-list.js";
import fs, { readdirSync } from "fs";
import crypto from "crypto";
import fsDirections from "../mods/fs-directions.js";
import * as _t from "../mods/tools.js";
import { letScraperListenToMasterMessageAndInit } from "../mods/generic-scraper.js";
import { QuickWorkerMessage } from "../mods/rock-worker.js";
import { dbsMonths } from "../mods/months.js";

const qwm = new QuickWorkerMessage(workerData);
let browser = null;

letScraperListenToMasterMessageAndInit(scrapeInit);

async function scrapeInit() {
  parentPort.postMessage(qwm.workerInitialized());
  browser = await puppeteer.launch();
  Promise.race([makeBaseEventList(), _t.errorAfterSeconds(30000)])
    .then((baseMusicEvents) => {
      parentPort.postMessage(qwm.workerStarted());
      const baseMusicEventsCopy = [...baseMusicEvents];
      return processSingleMusicEvent(baseMusicEventsCopy);
    })
    .then(() => {
      parentPort.postMessage(qwm.workerDone(EventsList.amountOfEvents));
      EventsList.save(workerData.family, workerData.index);
    })
    .catch((error) =>
      _t.handleError(error, workerData, `outer catch scrape ${workerData.family}`)
    )
    .finally(() => {
      browser && browser.hasOwnProperty("close") && browser.close();
    });
}

async function createSinglePage(url) {
  const page = await browser.newPage();
  await page
    .goto(url, {
      waitUntil: "load",
      timeout: 20000,
    })
    .then(() => true)
    .catch((err) => {
      _t.handleError(
        err,
        workerData,
        `${workerData.name} goto single page mislukt:<br><a href='${url}'>${url}</a><br>`
      );
      return false;
    });
  return page;
}

async function processSingleMusicEvent(baseMusicEvents) {
  qwm.todo(baseMusicEvents.length).forEach((JSONblob) => {
    parentPort.postMessage(JSONblob);
  });

  const newMusicEvents = [...baseMusicEvents];
  const firstMusicEvent = newMusicEvents.shift();

  if (!firstMusicEvent || baseMusicEvents.length === 0) {
    return true;
  }

  const singleEventPage = await createSinglePage(firstMusicEvent.venueEventUrl);
  if (!singleEventPage) {
    return newMusicEvents.length
      ? processSingleMusicEvent(newMusicEvents)
      : true;
  }

  try {
    const pageInfo = await Promise.race([
      getPageInfo(singleEventPage, firstMusicEvent.venueEventUrl),
      _t.errorAfterSeconds(15000),
    ]);

    if (pageInfo && pageInfo.priceTextcontent) {
      pageInfo.price = _t.getPriceFromHTML(pageInfo.priceTextcontent);
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
    if (!singleEventPage.isClosed() && singleEventPage.close());
  } catch (pageInfoError) {
    _t.handleError(pageInfoError, workerData, "get page info fail");
  }

  return newMusicEvents.length
    ? processSingleMusicEvent(newMusicEvents)
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

async function makeBaseEventList() {
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
          res.location = "dbs";
          res.error = null;
          const startDateEl = eventEl.querySelector(
            ".tribe-event-date-start"
          ) ?? null;
          if (!startDateEl) return null
          const startTextcontent = eventEl.querySelector('.tribe-event-date-start')?.textContent.toLowerCase() ?? 'LEEG';
          res.eventDateText = startTextcontent;

          try {
            const match1 = startTextcontent.match(/(\d+)\s+(\w+)/);
            res.day = match1[1];
            let monthName = match1[2]
            res.month = dbsMonths[monthName];
            res.day = res.day.padStart(2, '0')
            const yearMatch = startTextcontent.match(/\d{4}/)
            if (!yearMatch || !Array.isArray(yearMatch) || yearMatch.length < 1) {
              res.year = new Date().getFullYear();
            } else {
              res.year = yearMatch[1]
            }
            res.year = res.year || new Date().getFullYear();
             res.time = startTextcontent.match(/\d{1,2}:\d\d/)[0].padStart(5, '0')
             res.startDate = `${res.year}-${res.month}-${res.day}`;
             res.startDateTime = new Date(`${res.startDate}T${res.time}:00Z`).toISOString()
          } catch (error) {
            res.error = error.message;
          }

          if (res.startDate) {
            try {
              const endDateEl = eventEl.querySelector(".tribe-event-time") ?? null;
              if (endDateEl){
                const endDateM = endDateEl.textContent.toLowerCase().match(/\d{1,2}:\d\d/);
                if (Array.isArray(endDateM) && endDateM.length > 0) {
                  res.endTime = endDateM[0].padStart(5, '0')
                  res.endDateTime = new Date(`${res.startDate}T${res.endTime}:00Z`).toISOString()
                  if (res.endDateTime === res.startDateTime) {
                    res.endDateTime = null;
                  }
                }
              }
              
            } catch (error) {
              res.error = error.message;
            }
          }

          return res;
        });
    },
    { dbsMonths, workerIndex: workerData.index }
  );
  rawEvents.forEach(rawEvent => {
    if (rawEvent.error) {
      _t.handleError(
        new Error(rawEvent.error),
        workerData,
        `raw events fail`
      );

    }
  })


  return rawEvents
    .filter(_t.basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}
