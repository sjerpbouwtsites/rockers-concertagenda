import MusicEvent from "../mods/music-event.js";
import puppeteer from "puppeteer";
import { parentPort, workerData } from "worker_threads";
import EventsList from "../mods/events-list.js";
import fs from "fs";
import crypto from "crypto";
import fsDirections from "../mods/fs-directions.js";
import {
  getPriceFromHTML,
  handleError,
  autoScroll,
  postPageInfoProcessing,
  errorAfterSeconds,
  basicMusicEventsFilter,
} from "../mods/tools.js";
import { letScraperListenToMasterMessageAndInit } from "../mods/generic-scraper.js";
import { QuickWorkerMessage } from "../mods/rock-worker.js";
const qwm = new QuickWorkerMessage(workerData);
let browser = null;

letScraperListenToMasterMessageAndInit(scrapeInit);

async function scrapeInit() {
  parentPort.postMessage(qwm.workerInitialized());
  browser = await puppeteer.launch();
  Promise.race([makeBaseEventList(), errorAfterSeconds(50000)])
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
      handleError(error, workerData, `outer catch scrape ${workerData.family}`)
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
      handleError(
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

  if (
    !firstMusicEvent ||
    baseMusicEvents.length === 0 ||
    !firstMusicEvent ||
    !firstMusicEvent.venueEventUrl
  ) {
    return true;
  }

  const singleEventPage = await createSinglePage(firstMusicEvent.venueEventUrl);
  if (!singleEventPage) {
    return newMusicEvents.length
      ? processSingleMusicEvent(newMusicEvents)
      : true;
  }

  let pageInfo = await Promise.race([
    getPageInfo(singleEventPage, firstMusicEvent.venueEventUrl),
    errorAfterSeconds(15000),
  ]);
  pageInfo = postPageInfoProcessing(pageInfo);
  
  if (pageInfo && pageInfo.longTextHTML) {
    let uuid = crypto.randomUUID();
    const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;
    fs.writeFile(longTextPath, pageInfo.longTextHTML, "utf-8", () => {});
    pageInfo.longText = longTextPath;
  }

  if (pageInfo.error){
    handleError(pageInfo.error, workerData, 'getPageInfo error')
  }

  // no date no registration.
  if (pageInfo) {
    firstMusicEvent.merge(pageInfo);
  }

  firstMusicEvent.registerIfValid();
  if (!singleEventPage.isClosed() && singleEventPage.close());

  return newMusicEvents.length
    ? processSingleMusicEvent(newMusicEvents)
    : true;
}

async function getPageInfo(page) {
  return await page.evaluate(() => {
    const res = {};
    try {
      res.startDateTime = new Date(document.querySelector('[class*="styles_event-header"] time')?.getAttribute('datetime') ?? null).toISOString();
    } catch (error) {
      res.error = error;
    }
    res.priceTextcontent = document.querySelector('[class*="styles_ticket-prices"]')?.textContent ?? null
    res.longTextHTML = document.querySelector('[class*="styles_event-info"]')?.innerHTML ?? null;
    res.image = document.querySelector('[class*="styles_event-header__figure"] img')?.src ?? null;
    return res;
  });
}

async function makeBaseEventList() {
  const page = await browser.newPage();
  await page.goto("https://www.melkweg.nl/nl/agenda", {
    waitUntil: "load",
  });

  await autoScroll(page);
  await autoScroll(page);
  await autoScroll(page);
  await autoScroll(page);

  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll("[data-element='agenda'] li"))
      .filter((eventEl) => {
        const tags = eventEl.querySelector('[class*="styles_tags-list"]')?.textContent.toLowerCase() ?? ''
        return tags.includes("metal") || tags.includes("punk");
      })
      .filter((eventEl, eventIndex) => {
        return eventIndex % 3 === workerIndex;
      })
      .map((eventEl) => {
        const res = {}
        const anchor = eventEl.querySelector('a');
        res.shortText = eventEl.querySelector('[class*="subtitle"]')?.textContent ?? ''
        res.title = eventEl.querySelector('h3[class*="title"]')?.textContent ?? ''
        res.error = null;
        res.venueEventUrl = anchor.href
        res.location = 'melkweg';
         return res;
      });
  }, workerData.index);
  
  return rawEvents
    .map((event) => new MusicEvent(event));
}
