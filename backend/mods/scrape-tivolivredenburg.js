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
      errorAfterSeconds(15000),
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

      fs.writeFile(longTextPath, pageInfo.longTextHTML, "utf-8", () => {});
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
      const pageInfoError = new Error(`unclear why failure at: ${
        firstMusicEvent.title
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
        document.querySelector(".price .amount")?.textContent.trim() ?? null;
      res.priceContexttext =
        document.querySelector(".event-content")?.textContent.trim() ?? null;
      res.longTextHTML =
        document.querySelector(".the_content")?.innerHTML ?? null;

      const startDateMatch = document.location.href.match(/\d\d-\d\d-\d\d\d\d/); //

      if (startDateMatch && startDateMatch.length) {
        res.startDate = startDateMatch[0].split("-").reverse().join("-");
      }

      if (!!res.startDate) {
        const infoInner = Array.from(
          document.querySelectorAll(".info-block--times .info-inner")
        );
        res.startTime =
          infoInner
            .find((row) => row.innerHTML.includes("aanvang"))
            ?.querySelector(".label")
            ?.textContent.trim() ?? null;
        res.openDoorTime =
          infoInner
            .find((row) => row.innerHTML.includes("open"))
            ?.querySelector(".label")
            ?.textContent.trim() ?? null;
        res.endTime =
          infoInner
            .find((row) => row.innerHTML.includes("eind"))
            ?.querySelector(".label")
            ?.textContent.trim() ?? null;

        res.doorOpenDateTime = res.openDoorTime
          ? new Date(`${res.startDate}T${res.openDoorTime}`).toISOString()
          : null;
        res.startDateTime = res.startTime
          ? new Date(`${res.startDate}T${res.startTime}`).toISOString()
          : null;
        res.endDateTime = res.endTime
          ? new Date(`${res.startDate}T${res.endTime}`).toISOString()
          : null;
      }

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
    return Array.from(document.querySelectorAll(".item--agenda"))
      .filter((eventEl, index) => {
        return index % 4 === workerIndex;
      })
      .map((eventEl) => {
        const res = {};
        res.title = eventEl.querySelector("h3")?.textContent.trim() ?? null;
        res.shortText = eventEl.querySelector("h4")?.textContent.trim() ?? null;
        res.image = eventEl.querySelector("img")?.src ?? null;
        res.venueEventUrl = eventEl.href;
        res.dataIntegrity = 10;
        res.location = "tivolivredenburg";
        return res;
      });
  }, workerIndex);
  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}
