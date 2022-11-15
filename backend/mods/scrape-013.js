import MusicEvent from "./music-event.js";
import puppeteer from "puppeteer";
import { parentPort, workerData } from "worker_threads";
import EventsList from "./events-list.js";
import fs from "fs";
import crypto from "crypto";
import fsDirections from "./fs-directions.js";
import {
  handleError,
  errorAfterSeconds,
  basicMusicEventsFilter,
  getPriceFromHTML,
} from "./tools.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";

import { QuickWorkerMessage } from "./rock-worker.js";

letScraperListenToMasterMessageAndInit(scrape013);

async function scrape013() {
  const qwm = new QuickWorkerMessage(workerData);
  parentPort.postMessage(qwm.workerInitialized());
  const browser = await puppeteer.launch();

  Promise.race([makeBaseEventList(browser), errorAfterSeconds(15000)])
    .then((baseMusicEvents) => {
      return fillMusicEvents(browser, baseMusicEvents, qwm);
    })
    .then((browser) => {
      parentPort.postMessage(qwm.workerDone(EventsList.amountOfEvents));
      EventsList.save(workerData.family, workerData.index);
      browser && browser.hasOwnProperty("close") && browser.close();
    })
    .catch((error) => handleError(error, workerData, "outer catch scrape 013"));
}

async function fillMusicEvents(browser, baseMusicEvents, qwm) {
  const baseMusicEventsCopy = [...baseMusicEvents];
  return processSingleMusicEvent(browser, baseMusicEventsCopy, qwm);
}

async function processSingleMusicEvent(browser, baseMusicEvents, qwm) {
  qwm.todo(baseMusicEvents.length).forEach((JSONblob) => {
    parentPort.postMessage(JSONblob);
  });

  const newMusicEvents = [...baseMusicEvents];
  const firstMusicEvent = newMusicEvents.shift();

  if (
    !firstMusicEvent ||
    baseMusicEvents.length === 0 ||
    !firstMusicEvent ||
    typeof firstMusicEvent === "undefined"
  ) {
    return browser;
  }

  const page = await browser.newPage();
  await page.goto(firstMusicEvent.venueEventUrl, {
    waitUntil: "load",
    timeout: 0,
  });

  try {
    const pageInfo = await Promise.race([
      getPageInfo(page),
      errorAfterSeconds(15000),
    ]);

    if (pageInfo && (pageInfo.priceTextcontent || pageInfo.priceContextText)) {
      pageInfo.price = getPriceFromHTML(
        pageInfo.priceTextcontent,
        pageInfo.priceContextText
      );
    }

    if (pageInfo && pageInfo.longTextHTML) {
      let uuid = crypto.randomUUID();
      const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;

      fs.writeFile(longTextPath, pageInfo.longTextHTML, "utf-8", () => {});
      pageInfo.longText = longTextPath;
    }

    // no date no registration.
    if (pageInfo && !pageInfo.cancelReason) {
      delete pageInfo.cancelReason;
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

async function getPageInfo(page, months) {
  let pageInfo = {};
  pageInfo.cancelReason = "";
  try {
    pageInfo = await page.evaluate(
      ({ months }) => {
        let image = "";
        const imageEl = document.querySelector(".event-spotlight__image");
        if (!!imageEl) {
          image = imageEl.src;
        }

        let priceTextcontent =
          document.querySelector(".practical-information tr:first-child dd")
            ?.textContent ?? null;
        let priceContextText =
          document.querySelector(".practical-information")?.textContent ?? null;

        const doorOpenEl = document.querySelector(
          ".timetable__times dl:first-child time"
        );
        let doorOpenDateTime;
        if (!!doorOpenEl) {
          doorOpenDateTime = new Date(
            doorOpenEl.getAttribute("datetime")
          ).toISOString();
        }

        const longTextHTMLEl = document.querySelector(
          ".event-detail header + div"
        );
        let longTextHTML = null;
        if (longTextHTMLEl) {
          longTextHTML = longTextHTMLEl.innerHTML;
        }

        return {
          image,
          priceTextcontent,
          priceContextText,
          doorOpenDateTime,
          longTextHTML,
        };
      },
      { months }
    );
    return pageInfo;
  } catch (error) {
    handleError(error, workerdata, "page evaluate fail");
    return pageInfo;
  }
}

async function makeBaseEventList(browser) {
  const page = await browser.newPage();
  await page.goto("https://www.013.nl/programma/heavy", {
    waitUntil: "load",
  });
  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".event-list-item"))
      .filter((eventEl, index) => {
        return index % 4 === workerIndex;
      })
      .map((eventEl) => {
        const res = {};
        res.title = "";

        const linkEl = eventEl.querySelector(".event-list-item__link");

        if (!!linkEl) {
          res.venueEventUrl = linkEl.href;
        }
        const titleEl = eventEl.querySelector(".event-list-item__title");
        if (!!titleEl) {
          res.title = titleEl.textContent.trim();
        }
        const datumEl = eventEl.querySelector(".event-list-item__date");
        if (!!datumEl) {
          res.startDateTime = new Date(
            datumEl.getAttribute("datetime")
          ).toISOString();
        }
        res.location = "013";
        const subtitleEl = eventEl.querySelector(".event-list-item__subtitle");
        if (!!subtitleEl) {
          res.shortText = subtitleEl.textContent.trim();
        }
        return res;
      });
  }, workerData.index);
  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}
