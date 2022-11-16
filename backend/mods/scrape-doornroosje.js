import MusicEvent from "./music-event.js";
import puppeteer from "puppeteer";
import { parentPort, workerData } from "worker_threads";
import EventsList from "./events-list.js";
import fs from "fs";
import crypto from "crypto";
import fsDirections from "./fs-directions.js";
import {
  getPriceFromHTML,
  handleError,
  errorAfterSeconds,
  basicMusicEventsFilter,
} from "./tools.js";
import { doornRoosjeMonths } from "./months.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";
import { QuickWorkerMessage } from "./rock-worker.js";
const qwm = new QuickWorkerMessage(workerData);
let browser = null;

letScraperListenToMasterMessageAndInit(scrapeInit);

async function scrapeInit() {
  parentPort.postMessage(qwm.workerInitialized());
  browser = await puppeteer.launch();
  Promise.race([makeBaseEventList(), errorAfterSeconds(15000)])
    .then((baseMusicEvents) => {
      parentPort.postMessage(qwm.workerStarted());

      const baseMusicEventsCopy = [...baseMusicEvents];
      return processSingleMusicEvent(baseMusicEventsCopy);
    })
    .then(() => {
      parentPort.postMessage(qwm.workerDone(EventsList.amountOfEvents));
      EventsList.save(workerData.family, workerData.index);
      browser && browser.hasOwnProperty("close") && browser.close();
    })
    .catch((error) => handleError(error, workerData, "outer catch scrape 013"));
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
    typeof firstMusicEvent === "undefined"
  ) {
    return true;
  }

  try {
    const pageInfo = await Promise.race([
      getPageInfo(firstMusicEvent.venueEventUrl),
      errorAfterSeconds(15000),
    ]);

    firstMusicEvent.price =
      pageInfo?.priceTextcontent ?? null
        ? getPriceFromHTML(pageInfo.priceTextcontent)
        : null;

    if (pageInfo?.longTextHTML ?? null) {
      let uuid = crypto.randomUUID();
      const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;

      fs.writeFile(longTextPath, pageInfo.longTextHTML, "utf-8", () => {});
      pageInfo.longText = longTextPath;
    }

    // no date no registration.
    if (pageInfo) {
      firstMusicEvent.merge(pageInfo);
      firstMusicEvent.registerIfValid();
    } else {
      parentPort.postMessage(qwm.debugger(firstMusicEvent));
    }
  } catch (error) {
    handleError(error, workerData, "get page info fail");
  }
  return newMusicEvents.length ? processSingleMusicEvent(newMusicEvents) : true;
}

async function getPageInfo(url) {
  const page = await browser.newPage();
  await page.goto(url, {
    waitUntil: "load",
  });

  const pageResult = await page.evaluate((months) => {
    const res = { error: null };
    res.image =
      document.querySelector(".c-header-event__image img")?.src ?? null;
    res.priceTextcontent =
      document.querySelector(".c-btn__price")?.textContent.trim() ?? null;
    res.longTextHTML =
      document.querySelector(".s-event__container")?.innerHTML ?? null;

    const embeds = document.querySelectorAll(".c-embed");
    res.longTextHTML =
      embeds?.length ?? false
        ? res.longTextHTML + embeds.innerHTML
        : res.longTextHTML;

    try {
      const startDateRauwMatch = document
        .querySelector(".c-event-data")
        ?.innerHTML.match(
          /(\d{1,2})\s*(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s*(\d{4})/
        );
      let startDate;
      if (startDateRauwMatch && startDateRauwMatch.length) {
        const day = startDateRauwMatch[1];
        const month = months[startDateRauwMatch[2]];
        const year = startDateRauwMatch[3];
        startDate = `${year}-${month}-${day}`;
      }

      if (startDate) {
        const timeMatches = document
          .querySelector(".c-event-data")
          .innerHTML.match(/\d\d:\d\d/g);

        if (timeMatches && timeMatches.length) {
          if (timeMatches.length == 2) {
            res.startDateTime = new Date(
              `${startDate}:${timeMatches[1]}`
            ).toISOString();
            res.doorOpenDateTime = new Date(
              `${startDate}:${timeMatches[0]}`
            ).toISOString();
          } else if (timeMatches.length == 1) {
            res.startDateTime = new Date(
              `${startDate}:${timeMatches[0]}`
            ).toISOString();
          }
        }
      }
    } catch (error) {
      error.pageInfo = res;
      throw error; // naar then en daar erroren om pageInfo te kunnen zien
    }
    return res;
  }, doornRoosjeMonths);
  if (!page.isClosed() && page.close());
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
  // parentPort.postMessage(qwm.toConsole(pageResult));
  return pageResult; // is pageInfo
}

async function makeBaseEventList() {
  const page = await browser.newPage();
  await page.goto(
    "https://www.doornroosje.nl/?genre=metal%252Cpunk%252Cpost-hardcore%252Cnoise-rock%252Csludge-rock",
    {
      waitUntil: "load",
    }
  );
  await page.waitForTimeout(2500);

  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".c-program__item"))
      .filter((eventEl, index) => {
        return index % 6 === workerIndex;
      })
      .map((eventEl) => {
        const res = {};
        res.title =
          eventEl.querySelector(".c-program__title")?.textContent.trim() ??
          null;
        res.shortText =
          eventEl.querySelector(".c-program__info")?.textContent.trim() ?? null;
        res.venueEventUrl = eventEl.href;
        res.location = "doornroosje";
        return res;
      });
  }, workerData.index);
  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}
