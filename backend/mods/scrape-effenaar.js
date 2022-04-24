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
  basicMusicEventsFilter,
  errorAfterSeconds,
} from "./tools.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";

letScraperListenToMasterMessageAndInit(scrapeEffenaar);
async function scrapeEffenaar(workerIndex) {
  const browser = await puppeteer.launch();

  try {
    const baseMusicEvents = await Promise.race([
      makeBaseEventList(browser, workerIndex),
      errorAfterSeconds(15000),
    ]);

    const filteredForRock = await filterForRock(
      browser,
      baseMusicEvents,
      [],
      workerIndex
    );

    await fillMusicEvents(browser, filteredForRock, workerIndex);
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
    EventsList.save("effenaar", workerIndex);
  });
}

async function processSingleMusicEvent(browser, baseMusicEvents, workerIndex) {
  parentPort.postMessage({
    status: "todo",
    message: baseMusicEvents.length,
  });

  const newMusicEvents = [...baseMusicEvents];
  const firstMusicEvent = newMusicEvents.shift();

  if (!firstMusicEvent || baseMusicEvents.length === 0) {
    return true;
  }

  if (!firstMusicEvent.venueEventUrl) {
    return true;
  }

  const page = await browser.newPage();
  await page.goto(firstMusicEvent.venueEventUrl);

  try {
    const pageInfo = await Promise.race([
      getPageInfo(page),
      errorAfterSeconds(15000),
    ]);

    if (pageInfo && pageInfo.priceTextcontent) {
      pageInfo.price = getPriceFromHTML(pageInfo.priceTextcontent);
    }

    if (pageInfo && pageInfo.longTextHTML) {
      let uuid = crypto.randomUUID();
      const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;

      fs.writeFile(longTextPath, pageInfo.longTextHTML, "utf-8", () => { });
      pageInfo.longText = longTextPath;
    }

    // @TODO OPEN DOOR TIME OF EFFENAAR DOES NOT COME THROUGH YET
    if (pageInfo && pageInfo.doorOpenTime) {
      const openDoorDateTime = new Date(firstMusicEvent.startDateTime);
      const openDoorTimeSplit = pageInfo.doorOpenTime.split(":");
      if (openDoorTimeSplit.length & (openDoorTimeSplit.length > 1)) {
        const openDoorHours = openDoorTimeSplit[0];
        const openDoorMinutes = openDoorTimeSplit[1];
        openDoorDateTime.setHours(openDoorHours);
        openDoorDateTime.setMinutes(openDoorMinutes);
        firstMusicEvent.openDoorDateTime = openDoorDateTime.toISOString();
      }
    }

    // no date no registration.
    if (pageInfo && !pageInfo.cancelReason) {
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

async function getPageInfo(page, months) {
  let pageInfo = {};
  pageInfo.cancelReason = "";
  try {
    await page.waitForSelector(".js-event-detail-organizer-sidebar");
    pageInfo = await page.evaluate(
      ({ months }) => {
        const imageEl = document.querySelector(".spotlight-image");
        let image = "";
        let doorOpenTime = null;
        let longTextHTML = null;
        if (!!imageEl) {
          image = imageEl.src;
        }

        let priceTextcontent =
          document.querySelector(".js-event-detail-organizer-sidebar")
            ?.textContent ?? null;

        try {
          let doorOpenEl;
          let doorOpenPotentials = Array.from(
            document.querySelectorAll(".js-event-detail-organizer-sidebar dd")
          ).filter((dd) => {
            const m = dd.textContent.trim().match(/(\d\d)[\:]+(\d\d)/);
            return !!m && m.length > 2;
          });
          if (
            doorOpenPotentials &&
            doorOpenPotentials.length &&
            doorOpenPotentials.length > 1
          ) {
            doorOpenEl = doorOpenPotentials[1];
          }
          if (doorOpenEl) {
            doorOpenTime = doorOpenEl.textContent
              .trim()
              .match(/(\d\d)[\:]+(\d\d)/)[0];
          }
        } catch (error) {
          parentPort.postMessage({
            status: "console",
            message: `Error in effenaar door open search of ${document.location}`,
          });
        }

        const longTextHTMLEl = document.querySelector(
          ".js-event-detail-organizer-content"
        );
        if (longTextHTMLEl) {
          longTextHTML = longTextHTMLEl.innerHTML;
        }

        return {
          priceTextcontent,
          image,
          doorOpenTime,
          longTextHTML,
        };
      },
      { months }
    );
    return pageInfo;
  } catch (error) {
    handleError(error);

    return pageInfo;
  }
}

async function makeBaseEventList(browser, workerIndex) {
  const page = await browser.newPage();
  await page.goto("https://www.effenaar.nl/agenda", {
    waitUntil: "load",
  });
  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".overview-list"))
      .filter((eventEl, index) => {
        return index % 3 === workerIndex;
      })
      .map((eventEl) => {
        const res = {};
        res.title = "";
        const titleEl = eventEl.querySelector(".overview-title");
        if (!!titleEl) {
          res.title = titleEl.textContent.trim();
        }
        res.shortText = "";
        if (!!titleEl) {
          res.shortText = titleEl.hasAttribute("data-original-title")
            ? titleEl.gasAttribute("data-original-title")
            : "";
        }


        res.startDateTime = null;
        const dateEl = eventEl.querySelector(".overview-date");
        if (dateEl && dateEl.hasAttribute("datetime")) {
          res.startDateTime = new Date(
            dateEl.getAttribute("datetime")
          ).toISOString();
        }

        if (!!titleEl) {
          res.venueEventUrl = titleEl.href;
        }
        res.location = "effenaar";
        return res;
      });
  }, workerIndex);
  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}

async function filterForRock(
  browser,
  baseMusicEvents,
  filteredEvents,
  workerIndex
) {
  if (!baseMusicEvents.length) return filteredEvents;

  const eventsCopy = [...baseMusicEvents];
  const firstEvent = eventsCopy.shift();

  const page = await browser.newPage();
  await page.goto(
    `https://www.metal-archives.com/search?searchString=${firstEvent.title}&type=band_name`
  );
  let isRockPossible = await page.evaluate(() => {
    const isEmptyEl = document.querySelector(".dataTables_empty");
    return !isEmptyEl;
  });

  if (!isRockPossible) {
    await page.goto(`https://en.wikipedia.org/wiki/${firstEvent.title}`);
    isRockPossible = await page.evaluate(() => {
      const isRock = !!document.querySelector(".infobox a[href*='rock']");
      const isMetal = !!document.querySelector(".infobox a[href*='metal']");
      return isRock || isMetal;
    });
  }

  if (isRockPossible) {
    filteredEvents.push(firstEvent);
  }

  return filterForRock(browser, eventsCopy, filteredEvents, workerIndex);
}
