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
  autoScroll,
  log,
} from "./tools.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";

letScraperListenToMasterMessageAndInit(scrapeMelkweg);

async function scrapeMelkweg(workerIndex) {
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
    EventsList.save("melkweg", workerIndex);
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

    if (pageInfo && pageInfo.priceTextcontent) {
      firstMusicEvent.price = getPriceFromHTML(pageInfo.priceTextcontent);
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
        document
          .querySelector(".event-meta__total-price")
          ?.textContent.trim() ?? null;

      res.longTextHTML =
        document.querySelector(".body-copy")?.innerHTML ?? null;

      res.image = document.querySelector("figure img")?.src ?? null;

      return res;
    });
    return pageInfo;
  } catch (error) {
    handleError(error);
    handleError(pageInfo);
    return pageInfo;
  }
}

async function makeBaseEventList(browser, workerIndex) {
  const page = await browser.newPage();
  await page.goto("https://www.melkweg.nl/nl/agenda", {
    waitUntil: "load",
  });

  await autoScroll(page);
  await autoScroll(page);

  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".agenda-item"))
      .filter((linkEl) => {
        const tags =
          linkEl.querySelector(".tags")?.textContent.toLowerCase() ?? "";
        return tags.includes("metal") || tags.includes("punk");
      })
      .map((linkEl) => {
        let startDateTime;
        try {
          const startDateMatch = linkEl.href.match(/(\d\d)-(\d\d)-(\d\d\d\d)/);
          if (startDateMatch && startDateMatch.length === 4) {
            const startDate = `${startDateMatch[3]}-${startDateMatch[2]}-${startDateMatch[1]}`;
            const startTime =
              linkEl.querySelector("[datetime]")?.getAttribute("datetime") ??
              null;
            if (startTime) {
              startDateTime = new Date(
                `${startDate}T${startTime}`
              ).toISOString();
            }
          }
        } catch (error) {}

        return {
          venueEventUrl: linkEl.href,
          shortText: linkEl.querySelector(".tags")?.textContent ?? "",
          title: linkEl.querySelector("h1")?.textContent.trim() ?? null,
          startDateTime,
          dataIntegrity: 10,
          location: "melkweg",
        };
      });
  }, workerIndex);
  return rawEvents.map((event) => new MusicEvent(event));
}
