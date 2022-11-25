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
  errorAfterSeconds,
  postPageInfoProcessing,
  basicMusicEventsFilter,
} from "../mods/tools.js";
import { letScraperListenToMasterMessageAndInit } from "../mods/generic-scraper.js";
import { QuickWorkerMessage } from "../mods/rock-worker.js";

import { gebrdenobelMonths } from "../mods/months.js";

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

  if (!firstMusicEvent || baseMusicEvents.length === 0) {
    return true;
  }

  const singleEventPage = await createSinglePage(firstMusicEvent.venueEventUrl);
  if (!singleEventPage) {
    return newMusicEvents.length
      ? processSingleMusicEvent(newMusicEvents)
      : true;
  }

  let pageInfo = await getPageInfo(singleEventPage);
  pageInfo = postPageInfoProcessing(pageInfo);
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

async function makeBaseEventList() {
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
  }, workerData.index);
  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}
