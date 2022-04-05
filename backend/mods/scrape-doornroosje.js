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

letScraperListenToMasterMessageAndInit(scrapeDoornroosje);

async function scrapeDoornroosje(workerIndex) {
  const browser = await puppeteer.launch();
  const months = {
    januari: "01",
    februari: "02",
    maart: "03",
    april: "04",
    mei: "05",
    juni: "06",
    juli: "07",
    augustus: "08",
    september: "09",
    oktober: "10",
    november: "11",
    december: "12",
  };
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
  parentPort.postMessage({
    status: "todo",
    message: baseMusicEvents.length,
  });

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
    EventsList.save("doornroosje", workerIndex);
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

  const months = {
    januari: "01",
    februari: "02",
    maart: "03",
    april: "04",
    mei: "05",
    juni: "06",
    juli: "07",
    augustus: "08",
    september: "09",
    oktober: "10",
    november: "11",
    december: "12",
  };

  try {
    pageInfo = await page.evaluate((months) => {
      const res = {};
      res.cancelReason = "";
      res.image =
        document.querySelector(".c-header-event__image img")?.src ?? null;
      res.priceTextcontent =
        document.querySelector(".c-btn__price")?.textContent.trim() ?? null;
      res.longTextHTML =
        document.querySelector(".s-event__container")?.innerHTML ?? null;

      const embeds = document.querySelectorAll(".c-embed");
      if (embeds && embeds.length) {
        res.longTextHTML = res.longTextHTML + embeds.innerHTML;
      }

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
      } catch (error) {}

      return res;
    }, months);
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
        res.dataIntegrity = 10;
        res.location = "doornroosje";
        return res;
      });
  }, workerIndex);
  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}
