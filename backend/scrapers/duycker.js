import MusicEvent from "../mods/music-event.js";
import { parentPort, workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./abstract-scraper.js";
import { duyckerMonths } from "../mods/months.js";

// SCRAPER CONFIG

const scraperConfig = {
  baseEventTimeout: 15000,
  singlePageTimeout: 20000,
  maxExecutionTime: 30000,
  workerData: Object.assign({}, workerData),
};
const duyckerScraper = new AbstractScraper(scraperConfig);

duyckerScraper.listenToMasterThread();

// MAKE BASE EVENTS

duyckerScraper.makeBaseEventList = async function () {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);
  const page = await this.browser.newPage();
  await page.goto("https://www.duycker.nl/agenda/?music_genre=metal-punk", {
    waitUntil: "load",
  });

  await page.waitForSelector(".duycker.agenda .item-container", {
    timeout: 5000,
  });

  await _t.waitFor(50);

  let rawEvents = await page.evaluate(
    ({ months, workerIndex }) => {
      return Array.from(
        document.querySelectorAll(".duycker.agenda .item-container")
      ).map((rawEvent) => {
        const anchor = rawEvent.querySelector('[itemprop="url"]') ?? null;
        const title =
          rawEvent.querySelector('[itemprop="name"]')?.textContent ?? null;
        const shortText =
          rawEvent.querySelector('[itemprop="name"] + p')?.textContent ?? null;
        const venueEventUrl = anchor?.dataset.href ?? null;
        const image = anchor?.querySelector("img")?.src ?? null;
        const startDateMatch = rawEvent
          .querySelector(".event-date")
          ?.textContent.toLowerCase()
          .trim()
          .match(/(\d{1,2})\s(\w+)/);
        let startDate;
        let error;
        if (
          startDateMatch &&
          Array.isArray(startDateMatch) &&
          startDateMatch.length === 3
        ) {
          const day = startDateMatch[1];
          const month = months[startDateMatch[2]];
          const refDate = new Date();
          let year =
            Number(month) < refDate.getMonth() + 1
              ? refDate.getFullYear() + 1
              : refDate.getFullYear();
          startDate = `${year}-${month}-${day}`;
        }
        const timeMatches = rawEvent
          .querySelector(".titles + .info")
          ?.textContent.match(/\d\d:\d\d/g);
        let startTime, doorTime;
        if (
          timeMatches &&
          Array.isArray(timeMatches) &&
          timeMatches.length >= 1
        ) {
          if (timeMatches.length === 1) {
            startTime = timeMatches[0];
          } else {
            doorTime = timeMatches[0];
            startTime = timeMatches[1];
          }
        }
        let startDateTime;
        let openDoorDateTime;
        try {
          if (startTime && startDate) {
            startDateTime = new Date(
              `${startDate}T${startTime}:00`
            ).toISOString();
          }
          if (doorTime && startDate) {
            openDoorDateTime = new Date(
              `${startDate}T${doorTime}:00`
            ).toISOString();
          }
        } catch (error) {
          _t.handleError(
            `invalid times ${startDate} ${startTime} ${doorTime}`,
            "Duycker"
          );
        }

        return {
          venueEventUrl,
          startDate,
          startDateTime,
          openDoorDateTime,
          shortText,
          location: "duycker",
          title,
          image,
        };
      });
    },
    { months: duyckerMonths, workerIndex: workerData.index }
  );

  clearTimeout(stopFunctie);
  !page.isClosed() && page.close();

  return rawEvents
    .map((event) => {
      (!event.venueEventUrl || !event.title || !event.startDateTime) &&
        parentPort.postMessage(
          this.this.qwm.messageRoll(
            `Red het niet: <a href='${event.venueEventUrl}'>${event.title}</a> ongeldig.`
          )
        );
      return event;
    })
    .filter(_t.basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
};
// GET PAGE INFO

duyckerScraper.getPageInfo = async function ({ url, page }) {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `getPageInfo is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);
  await page.waitForSelector("#container .content.event", {
    timeout: 7500,
  });

  const pageInfo = await page.evaluate(() => {
    const res = {};
    const contentBox = document.querySelector(".the_content") ?? null;
    if (contentBox) {
      res.longTextHTML = contentBox.innerHTML;
    }

    res.priceTextcontent =
      document.querySelector(".event-info .content-info")?.textContent.trim() ??
      "";

    return res;
  }, null);

  if (pageInfo.error) {
    _t.handleError(new Error(pageInfo.error, workerData, `get page info fail`));
  }
  pageInfo?.errorsVoorErrorHandler?.forEach((errorHandlerMeuk) => {
    _t.handleError(
      errorHandlerMeuk.error,
      workerData,
      errorHandlerMeuk.remarks
    );
  });

  clearTimeout(stopFunctie);
  !page.isClosed() && page.close();

  if (!pageInfo) {
    return {
      unavailable: `Geen resultaat <a href="${url}">van pageInfo</a>`,
    };
  }
  return pageInfo;
};

// SINGLE EVENT CHECK

duyckerScraper.singleEventCheck = async function (event) {
  const firstCheckText = `${event?.title ?? ""} ${event?.shortText ?? ""}`;
  if (
    firstCheckText.includes("indie") ||
    firstCheckText.includes("dromerig") ||
    firstCheckText.includes("shoegaze") ||
    firstCheckText.includes("alternatieve rock")
  ) {
    return {
      event,
      success: false,
      reason: "verboden genres gevonden in title+shortText",
    };
  }

  return {
    event,
    success: true,
    reason: "verboden genres niet gevonden.",
  };
};
