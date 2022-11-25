import MusicEvent from "../mods/music-event.js";
import fs from "fs";
import crypto from "crypto";
import puppeteer from "puppeteer";
import { parentPort, workerData } from "worker_threads";
import EventsList from "../mods/events-list.js";
import fsDirections from "../mods/fs-directions.js";
import * as _t from "../mods/tools.js";
import { letScraperListenToMasterMessageAndInit } from "../mods/generic-scraper.js";
import { occiiMonths } from "../mods/months.js";
import { QuickWorkerMessage } from "../mods/rock-worker.js";
const qwm = new QuickWorkerMessage(workerData);
let browser = null;

letScraperListenToMasterMessageAndInit(scrapeInit);

async function scrapeInit() {
  parentPort.postMessage(qwm.workerInitialized());
  browser = await puppeteer.launch();
  Promise.race([makeBaseEventList(), _t.errorAfterSeconds(30000)])
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
      _t.handleError(error, workerData, `outer catch scrape ${workerData.family}`)
    )
    .finally(() => {
      browser && browser.hasOwnProperty("close") && browser.close();
    });
}

async function makeBaseEventList() {
  const page = await browser.newPage();
  await page.goto(`https://occii.org/events/`);

  const eventsData = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".occii-event-display"))
      .filter((event, index) => {
        // here divide events over workers.
        return index % 2 === workerIndex;
      })
      .map((occiiEvent) => {
        const firstAnchor = occiiEvent.querySelector("a");
        const eventDescriptionEl = occiiEvent.querySelector(
          ".occii-events-description"
        );
        return {
          venueEventUrl: firstAnchor.href,
          title: firstAnchor.title,
          shortText: !!eventDescriptionEl ? eventDescriptionEl.textContent : "",
          location: "occii",
        };
      });
  }, workerData.index);

  const baseMusicEvents = eventsData
    .filter(_t.basicMusicEventsFilter)
    .map((eventDatum) => {
      const thisMusicEvent = new MusicEvent(eventDatum);
      return thisMusicEvent;
    });

    !page.isClosed() && page.close()
  return baseMusicEvents;
}

async function processSingleMusicEvent(baseMusicEvents) {
  qwm.todo(baseMusicEvents.length).forEach((JSONblob) => {
    parentPort.postMessage(JSONblob);
  });
  const newMusicEvents = [...baseMusicEvents];
  const firstMusicEvent = newMusicEvents.shift();
  const page = await browser.newPage();
  await page.goto(firstMusicEvent.venueEventUrl);

  let pageInfo = await page.evaluate((months) => {
    const res = {};
    const imageEl = document.querySelector(".wp-post-image");
    res.image = !!imageEl ? imageEl.src : null;
    const eventDateEl = document.querySelector(".occii-event-date-highlight");
    const eventDateSplit1 = eventDateEl.textContent.trim().split(",");
    const eventYear = eventDateSplit1[2].trim();
    const eventDateSplit2 = eventDateSplit1[1].trim().split(" ");
    const eventMonthEnglish = eventDateSplit2[0].trim();
    const eventDay = eventDateSplit2[1].trim();
    const eventMonth = months[eventMonthEnglish];
    const eventDateString = `${eventYear}-${eventMonth}-${eventDay}`;
    const eventCategoriesEl = document.querySelector(".occii-event-details");
    const doorsOpenMatch = eventCategoriesEl.textContent.match(
      /Doors\sopen\:\s+(\d\d\:\d\d)/
    );
    const doorsOpen =
      doorsOpenMatch && doorsOpenMatch.length > 1 ? doorsOpenMatch[1] : null;
    try {
      res.doorOpenDateTime = doorsOpen
        ? new Date(`${eventDateString}T${doorsOpen}`).toISOString()
        : new Date(`${eventDateString}T00:00`).toISOString();
    } catch (error) {
      res.doorOpenDateTime = null;
    }

    const showtimeMatch = eventCategoriesEl.textContent.match(
      /Showtime\:\s+(\d\d\:\d\d)/
    );
    const showtime =
      showtimeMatch && showtimeMatch.length > 1 ? doorsOpenMatch[1] : null;
    try {
      res.startDateTime = showtime
        ? new Date(`${eventDateString}T${showtime}`).toISOString()
        : new Date(`${eventDateString}T00:00`).toISOString();
    } catch (error) {
      res.startDateTime = null;
    }

    const damageMatch =
      eventCategoriesEl.textContent.match(/Damage\:\s+\D+(\d+)/);
    res.price = damageMatch && damageMatch.length > 1 ? damageMatch[1] : null;
    const genreEl = document.querySelector('[href*="events/categories"]');
    res.genre = !!genreEl ? genreEl.textContent : null;
    res.longTextHTML = document.querySelector(".occii-event-notes").innerHTML;
    return res;
  }, occiiMonths);

  pageInfo = _t.postPageInfoProcessing(pageInfo);
  firstMusicEvent.merge(pageInfo);
  if (firstMusicEvent.isValid) {
    firstMusicEvent.registerIfValid();
  }

  return newMusicEvents.length
    ? processSingleMusicEvent(newMusicEvents)
    : true;
}
