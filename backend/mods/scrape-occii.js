import MusicEvent from "./music-event.js";
import fs from "fs";
import crypto from "crypto";
import puppeteer from "puppeteer";
import { parentPort } from "worker_threads";
import EventsList from "./events-list.js";
import fsDirections from "./fs-directions.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";
import { occiiMonths } from "./months.js";
import { basicMusicEventsFilter, postPageInfoProcessing } from "./tools.js";
letScraperListenToMasterMessageAndInit(scrapeOCCII);

async function scrapeOCCII(workerIndex) {
  const browser = await puppeteer.launch();
  const baseMusicEvents = await getBaseMusicEvents(browser, workerIndex);
  await fillMusicEvents(browser, baseMusicEvents, workerIndex);
  parentPort.postMessage({
    status: "done",
    message: `Occii worker-${workerIndex} done.`,
  });
  EventsList.save("occii", workerIndex);
  browser.close();
}

async function fillMusicEvents(browser, baseMusicEvents, workerIndex) {
  const baseMusicEventsCopy = [...baseMusicEvents];

  return processSingleMusicEvent(browser, baseMusicEventsCopy, workerIndex);
}

async function getBaseMusicEvents(browser, workerIndex) {
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
  }, workerIndex);

  const baseMusicEvents = eventsData
    .filter(basicMusicEventsFilter)
    .map((eventDatum) => {
      const thisMusicEvent = new MusicEvent(eventDatum);
      return thisMusicEvent;
    });

  page.close();
  return baseMusicEvents;
}

async function processSingleMusicEvent(browser, baseMusicEvents, workerIndex) {
  parentPort.postMessage({
    status: "todo",
    message: baseMusicEvents.length,
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
    res.dataIntegrity = 10;
    return res;
  }, occiiMonths);

  pageInfo = postPageInfoProcessing(pageInfo);
  firstMusicEvent.merge(pageInfo);
  if (firstMusicEvent.isValid) {
    firstMusicEvent.register();
  }

  return newMusicEvents.length
    ? processSingleMusicEvent(browser, newMusicEvents, workerIndex)
    : true;
}
