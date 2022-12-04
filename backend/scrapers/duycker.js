import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import { duyckerMonths } from "../mods/months.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const duyckerScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    singlePage: {
      timeout: 10000,
    },
    mainPage: {
      waitUntil: 'load'
    },
    app: {
      mainPage: {
        url: "https://www.duycker.nl/agenda/?music_genre=metal-punk",
        requiredProperties: ['venueEventUrl', 'title', 'startDateTime']
      }
    }
  }
}
));

duyckerScraper.listenToMasterThread();

// MAKE BASE EVENTS

duyckerScraper.makeBaseEventList = async function () {

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  await page.waitForSelector(".duycker.agenda .item-container", {
    timeout: 2000,
  });

  await _t.waitFor(50);

  let rawEvents = await page.evaluate(
    ({ months }) => {
      return Array.from(
        document.querySelectorAll(".duycker.agenda .item-container")
      ).map((rawEvent) => {
        const anchor = rawEvent.querySelector('[itemprop="url"]') ?? null;
        const title =
          rawEvent.querySelector('[itemprop="name"]')?.textContent ?? null;
        const shortText = _t.killWhitespaceExcess(
          rawEvent.querySelector('[itemprop="name"] + p')?.textContent ?? '');
        const venueEventUrl = anchor?.dataset.href ?? null;
        const image = anchor?.querySelector("img")?.src ?? null;
        const startDateMatch = rawEvent
          .querySelector(".event-date")
          ?.textContent.toLowerCase()
          .trim()
          .match(/(\d{1,2})\s(\w+)/);
        let startDate;

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

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
  
};
// GET PAGE INFO

duyckerScraper.getPageInfo = async function ({ page }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  await page.waitForSelector("#container .content.event", {
    timeout: 7500,
  });

  const pageInfo = await page.evaluate(() => {
    const res = {};
    const contentBox = document.querySelector(".the_content") ?? null;
    if (contentBox) {
      res.longTextHTML = _t.killWhitespaceExcess(contentBox.innerHTML);
    }

    res.priceTextcontent = _t.killWhitespaceExcess(
      document.querySelector(".event-info .content-info")?.textContent.trim() ??
      "" );

    return res;
  }, null);

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
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
