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
  waitFor,
  errorAfterSeconds,
  postPageInfoProcessing,
  basicMusicEventsFilter,
} from "../mods/tools.js";
import { letScraperListenToMasterMessageAndInit } from "../mods/generic-scraper.js";
import { QuickWorkerMessage } from "../mods/rock-worker.js";
import { metropoolMonths } from "../mods/months.js";

const qwm = new QuickWorkerMessage(workerData);
let browser = null;

letScraperListenToMasterMessageAndInit(scrapeInit);

async function scrapeInit() {
  parentPort.postMessage(qwm.workerInitialized());
  browser = await puppeteer.launch();
  Promise.race([makeBaseEventList(), errorAfterSeconds(30000)])
    .then((baseMusicEvents) => {
      parentPort.postMessage(qwm.workerStarted());
      const baseMusicEventsCopy = [...baseMusicEvents];
      return processSingleMusicEvent(baseMusicEventsCopy);
    })
    .then(() => {
      parentPort.postMessage(qwm.workerDone(EventsList.amountOfEvents));
    })
    .catch((error) =>
     handleError(error, workerData, `outer catch scrape ${workerData.family}`)
    )
    .finally(() => {
      EventsList.save(workerData.family, workerData.index);
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
    if (!singleEventPage.isClosed() && singleEventPage.close());
  } catch (pageInfoError) {
    handleError(pageInfoError, workerData, "get page info fail");
  }

  return newMusicEvents.length
    ? processSingleMusicEvent(newMusicEvents)
    : true;
}

async function getPageInfo(page, url) {
  const pageResult = await page.evaluate((months) => {
    const res = { error: null };

    res.cancelReason = "";
    res.title = document.querySelector(".event-title-js")?.textContent.trim();

    res.priceTextcontent =
      document.querySelector(".doorPrice")?.textContent.trim() ?? null;

    res.longTextHTML =
      Array.from(document.querySelectorAll(".event-title-wrap ~ div"))
        .map((divEl) => {
          return divEl.outerHTML;
        })
        .join("") ?? null;

    try {
      const startDateRauwMatch = document
        .querySelector(".event-title-wrap")
        ?.innerHTML.match(
          /(\d{1,2})\s*(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)\s*(\d{4})/
        );
      let startDate;
      if (startDateRauwMatch && startDateRauwMatch.length) {
        const day = startDateRauwMatch[1];
        const month = months[startDateRauwMatch[2]];
        const year = startDateRauwMatch[3];
        startDate = `${year}-${month}-${day}`;
      }

      if (startDate) {
        const startTimeMatch = document
          .querySelector(".beginTime")
          ?.innerHTML.match(/\d\d:\d\d/);
        if (startTimeMatch && startTimeMatch.length) {
          res.startDateTime = new Date(
            `${startDate}:${startTimeMatch[0]}`
          ).toISOString();
        }
        const doorTimeMatch = document
          .querySelector(".doorOpen")
          ?.innerHTML.match(/\d\d:\d\d/);
        if (doorTimeMatch && doorTimeMatch.length) {
          res.doorOpenDateTime = new Date(
            `${startDate}:${doorTimeMatch[0]}`
          ).toISOString();
        }
      }
    } catch (error) {
      error.pageInfo = res;
      throw error; // naar then en daar erroren om pageInfo te kunnen zien
    }
    res.image = document.querySelector(".object-fit-cover")
      ? `https://metropool.nl/${
          document.querySelector(".object-fit-cover")?.srcset
        }`
      : null;

    res.location = "metropool";

    return res;
  }, metropoolMonths);
  if (pageResult instanceof Error) {
    handleError(
      pageResult,
      workerData,
      `<a href='${url}'> get page info ${workerData.family}</a><br>`
    );
    (error?.pageInfo ?? null) &&
      parentPort.postMessage(qwm.debugger(pageResult.pageInfo));
    return null;
  }
  return pageResult; // is pageInfo
}

async function makeBaseEventList() {
  const page = await browser.newPage();
  await page.goto("https://metropool.nl/agenda", {
    waitUntil: "load",
  });

  await autoScroll(page);
  await autoScroll(page);
  await autoScroll(page);
  await autoScroll(page);

  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(
      document.querySelectorAll('.card--event')
    )
    .filter(rawEvent => {

      const testText = rawEvent.dataset?.genres || rawEvent.textContent;

      return testText.includes('metal') ||
      testText.includes('punk') || 
      testText.includes('noise') || 
      testText.includes('hardcore') || 
      testText.includes('ska')
    })
      .filter((rawEvent, index) => {
        return index % 4 === workerIndex;
      })
      .map((rawEvent) => {
        return {
          venueEventUrl: rawEvent.href,
        };
      });
  }, workerData.index);
  parentPort.postMessage(qwm.debugger(rawEvents));
  return rawEvents
    //.filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}
