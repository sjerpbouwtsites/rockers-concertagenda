import MusicEvent from "./music-event.js";
import puppeteer from "puppeteer";
import { parentPort } from "worker_threads";
import EventsList from "./events-list.js";
import fs from "fs";
import crypto from "crypto";
import fsDirections from "./fs-directions.js";
import {
  getPriceFromHTML,
  handleError,
  errorAfterSeconds,
  basicMusicEventsFilter,
  log,
} from "./tools.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";

letScraperListenToMasterMessageAndInit(scrapeTivolivredenburg);

async function scrapeTivolivredenburg(workerIndex) {
  const browser = await puppeteer.launch();

  try {
    const baseMusicEvents = await Promise.race([
      makeBaseEventList(browser, workerIndex),
      errorAfterSeconds(30000),
    ]);
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
    EventsList.save("tivolivredenburg", workerIndex);
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

  try {
    const pageInfo = await Promise.race([
      getPageInfo(page),
      errorAfterSeconds(15000),
    ]);

    if (pageInfo && (pageInfo.priceTextContent || pageInfo.priceContexttext)) {
      firstMusicEvent.price = getPriceFromHTML(
        pageInfo.price,
        pageInfo.priceContexttext
      );
    }

    if (pageInfo && pageInfo.longTextHTML) {
      let uuid = crypto.randomUUID();
      const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;

      fs.writeFile(longTextPath, pageInfo.longTextHTML, "utf-8", () => { });
      pageInfo.longText = longTextPath;
    }

    // no date no registration.
    if (pageInfo) {
      delete pageInfo.cancelReason;
      firstMusicEvent.merge(pageInfo);
    } else if (pageInfo.cancelReason !== "") {
      parentPort.postMessage({
        status: "console",
        message: `Incomplete info for ${firstMusicEvent.title}`,
      });
    } else {
      const pageInfoError = new Error(`unclear why failure at: ${firstMusicEvent.title
        }
      ${JSON.stringify(pageInfo)}
       ${JSON.stringify(firstMusicEvent)}`);
      handleError(pageInfoError);
    }
    firstMusicEvent.register();

    page.close();
  } catch (error) {
    handleError(error);
  }

  if (newMusicEvents.length) {
    return processSingleMusicEvent(browser, newMusicEvents, workerIndex);
  } else {
    return true;
  }
}

async function getPageInfo(page) {
  let pageInfo;
  try {
    pageInfo = await page.evaluate(() => {
      const res = {};
      res.cancelReason = "";
      res.priceTextcontent =
        document.querySelector(".btn-group__price")?.textContent.trim() ?? null;
      res.priceContexttext =
        document.querySelector(".event-cta")?.textContent.trim() ?? null;
      res.longTextHTML =
        document.querySelector(".event__text")?.innerHTML ?? null;

      const startDateMatch = document.location.href.match(/\d\d-\d\d-\d\d\d\d/); //

      if (startDateMatch && startDateMatch.length) {
        res.startDate = startDateMatch[0].split("-").reverse().join("-");
      }

      if (!!res.startDate) {
        const eventInfoDtDD = Array.from(
          document.querySelector(".event__info .description-list").children
        );
        res.startTime = null;
        res.openDoorTime = null;
        res.endTime = null;
        eventInfoDtDD.forEach((eventInfoDtDDItem, index) => {
          if (eventInfoDtDDItem.textContent.toLowerCase().includes("aanvang")) {
            res.startTime = eventInfoDtDD[index + 1].textContent
          }
          if (eventInfoDtDDItem.textContent.toLowerCase().includes("open")) {
            res.openDoorTime = eventInfoDtDD[index + 1].textContent
          }
          if (eventInfoDtDDItem.textContent.toLowerCase().includes("eind")) {
            res.endTime = eventInfoDtDD[index + 1].textContent
          }
        })
      }

      res.doorOpenDateTime = res.openDoorTime
        ? new Date(`${res.startDate}T${res.openDoorTime}`).toISOString()
        : null;
      res.startDateTime = res.startTime
        ? new Date(`${res.startDate}T${res.startTime}`).toISOString()
        : null;
      res.endDateTime = res.endTime
        ? new Date(`${res.startDate}T${res.endTime}`).toISOString()
        : null;


      return res;
    }, null);
    return pageInfo;
  } catch (error) {
    handleError(error);
    handleError(pageInfo);
    return pageInfo;
  }
}

async function makeBaseEventList(browser, workerIndex) {
  const page = await browser.newPage();
  await page.goto(
    "https://www.tivolivredenburg.nl/agenda/?event_category=metal-punk-heavy",
    {
      waitUntil: "load",
    }
  );
  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".agenda-list-item"))
      .filter((eventEl, index) => {
        return index % 4 === workerIndex;
      })
      .map((eventEl) => {
        const res = {};
        res.title = eventEl.querySelector(".agenda-list-item__title")?.textContent.trim() ?? null;
        res.shortText = eventEl.querySelector(".agenda-list-item__text")?.textContent.trim() ?? null;
        res.image = eventEl.querySelector(".agenda-list-item__figure img")?.src.replace(/-\d\d\dx\d\d\d.jpg/, '.jpg') ?? null;
        res.venueEventUrl = eventEl.querySelector('.agenda-list-item__title-link').href;
        res.location = "tivolivredenburg";
        return res;
      });
  }, workerIndex);


  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}
