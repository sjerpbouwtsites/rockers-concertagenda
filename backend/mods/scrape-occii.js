import MusicEvent from "./music-event.js";
import fs from "fs";
import crypto from "crypto";
import puppeteer from "puppeteer";
import { parentPort } from "worker_threads";
import EventsList from "./events-list.js";
import fsDirections from "./fs-directions.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";

letScraperListenToMasterMessageAndInit(scrapeOCCII);

async function scrapeOCCII(workerIndex) {
  const months = {
    January: "01",
    February: "02",
    March: "03",
    April: "04",
    May: "05",
    June: "06",
    July: "07",
    August: "08",
    September: "09",
    October: "10",
    November: "11",
    December: "12",
  };

  const browser = await puppeteer.launch();

  const baseMusicEvents = await getBaseMusicEvents(browser, workerIndex);
  await fillMusicEvents(browser, baseMusicEvents, months, workerIndex);
  parentPort.postMessage({
    status: "done",
    message: `Occii worker-${workerIndex} done.`,
  });
  EventsList.save("occii");
  browser.close();
}

async function fillMusicEvents(browser, baseMusicEvents, months, workerIndex) {
  const baseMusicEventsCopy = [...baseMusicEvents];

  return processSingleMusicEvent(
    browser,
    baseMusicEventsCopy,
    months,
    workerIndex
  );
}

async function getBaseMusicEvents(browser, workerIndex) {
  const page = await browser.newPage();
  await page.goto(`https://occii.org/events/`);

  const eventData = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".occii-event-display")).map(
      (occiiEvent) => {
        const firstAnchor = occiiEvent.querySelector("a");
        const eventDescriptionEl = occiiEvent.querySelector(
          ".occii-events-description"
        );
        return {
          venueEventUrl: firstAnchor.href,
          title: firstAnchor.title,
          shortText: !!eventDescriptionEl ? eventDescriptionEl.textContent : "",
        };
      }
    );
  });

  const baseMusicEvents = eventData
    .map((eventDatum) => {
      const thisMusicEvent = new MusicEvent(eventDatum);
      thisMusicEvent.location = "occii";
      return thisMusicEvent;
    })
    .filter((event, index) => {
      // here divide events over workers.
      return index % 2 === workerIndex;
    });

  page.close();
  return baseMusicEvents;
}

async function processSingleMusicEvent(
  browser,
  baseMusicEvents,
  months,
  workerIndex
) {
  parentPort.postMessage({
    status: "todo",
    message: baseMusicEvents.length,
  });
  const newMusicEvents = [...baseMusicEvents];
  const firstMusicEvent = newMusicEvents.shift();
  const page = await browser.newPage();
  await page.goto(firstMusicEvent.venueEventUrl);

  const pageInfo = await page.evaluate(
    ({ months }) => {
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
    },
    { months }
  );

  let uuid = crypto.randomUUID();
  const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;
  fs.writeFile(longTextPath, pageInfo.longTextHTML, "utf-8", () => {});
  firstMusicEvent.longText = longTextPath;
  firstMusicEvent.dataIntegrity = 10;
  firstMusicEvent.merge(pageInfo);
  firstMusicEvent.register();

  if (newMusicEvents.length) {
    return processSingleMusicEvent(
      browser,
      newMusicEvents,
      months,
      workerIndex
    );
  } else {
    return true;
  }
}
