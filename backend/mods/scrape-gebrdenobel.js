import MusicEvent from "./music-event.js";
import puppeteer from "puppeteer";
import { parentPort } from "worker_threads";
import EventsList from "./events-list.js";
import {
  handleError,
  basicMusicEventsFilter,
  autoScroll,
  postPageInfoProcessing,
  log,
} from "./tools.js";
import { gebrdenobelMonths } from "./months.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";

letScraperListenToMasterMessageAndInit(scrapeGebrdenobel);

async function scrapeGebrdenobel(workerIndex) {
  const browser = await puppeteer.launch({
    headLess: false,
  });

  setTimeout(() => {
    parentPort.postMessage({
      status: "console",
      message: 'leven is zwaar'
    });
  }, 5000)




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
    EventsList.save("gebrdenobel", workerIndex);
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

  let pageInfo = await getPageInfo(page);
  pageInfo = postPageInfoProcessing(pageInfo);
  firstMusicEvent.merge(pageInfo);
  if (firstMusicEvent.isValid) {
    firstMusicEvent.register();
  }

  page.close();

  return newMusicEvents.length
    ? processSingleMusicEvent(browser, newMusicEvents, workerIndex)
    : true;
}

async function getPageInfo(page) {
  return await page.evaluate((gebrdenobelMonths) => {
    const res = {};
    const eventDataRows = Array.from(
      document.querySelectorAll(".event-table tr")
    );
    const dateRow = eventDataRows.find((row) =>
      row.textContent.toLowerCase().includes("datum")
    );
    const timeRow = eventDataRows.find(
      (row) =>
        row.textContent.toLowerCase().includes("open") ||
        row.textContent.toLowerCase().includes("aanvang")
    );
    const priceRow = eventDataRows.find((row) =>
      row.textContent.toLowerCase().includes("prijs")
    );
    if (dateRow) {
      const startDateMatch = dateRow.textContent.match(
        /(\d+)\s?(\w+)\s?(\d{4})/
      );
      if (Array.isArray(startDateMatch) && startDateMatch.length === 4) {
        const day = startDateMatch[1].padStart(2, "0");
        const month = gebrdenobelMonths[startDateMatch[2]];
        const year = startDateMatch[3];
        res.month = startDateMatch[2];
        res.startDate = `${year}-${month}-${day}`;
      }

      if (!timeRow) {
        res.startDateTime = new Date(`${res.startDate}T00:00:00`).toISOString();
      } else {
        const timeMatch = timeRow.textContent.match(/\d\d:\d\d/);
        if (Array.isArray(timeMatch) && timeMatch.length) {
          res.startDateTime = new Date(
            `${res.startDate}T${timeMatch[0]}:00`
          ).toISOString();
        } else {
          res.startDateTime = new Date(
            `${res.startDate}T00:00:00`
          ).toISOString();
        }
      }
    }

    if (priceRow) {
      res.priceTextcontent = priceRow.textContent;
    }
    res.shortText =
      document.querySelector(".hero-cta_left__text p")?.textContent ?? null;
    res.longTextHTML =
      document.querySelector(".js-contentBlocks")?.innerHTML ?? null;
    res.image = document.querySelector(".hero img")?.src ?? null;

    return res;
  }, gebrdenobelMonths);
}

async function makeBaseEventList(browser, workerIndex) {
  const page = await browser.newPage();
  await page.goto("https://gebrdenobel.nl/programma/", {
    waitUntil: "load",
  });

  await autoScroll(page);
  await autoScroll(page);

  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".event-item"))
      .filter((eventEl) => {
        const tags =
          eventEl.querySelector(".meta-tag")?.textContent.toLowerCase() ?? "";
        return (
          tags.includes("metal") ||
          tags.includes("punk") ||
          tags.includes("rock")
        );
      })
      .map((eventEl) => {
        const link =
          eventEl
            .querySelector(".jq-modal-trigger")
            ?.getAttribute("data-url") ?? "";
        return {
          venueEventUrl: link,
          title:
            eventEl.querySelector(".media-heading")?.textContent.trim() ?? null,
          location: "gebrdenobel",
        };
      });
  }, workerIndex);
  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}
