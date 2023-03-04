import { workerData } from "worker_threads";
import getVenueMonths from "../mods/months.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const occiiScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 120000,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 90000,
    },
    singlePage: {
      timeout: 45000
    },
    app: {
      mainPage: {
        url: "https://occii.org/events/",
        requiredProperties: ['venueEventUrl']        
      }
    }
  }
}));


occiiScraper.listenToMasterThread();

// MAKE BASE EVENTS

occiiScraper.makeBaseEventList = async function () {

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  const rawEvents = await page.evaluate(({workerData}) => {
    return Array.from(document.querySelectorAll(".occii-event-display"))
      .filter((event, index) => index % workerData.workerCount === workerData.index)
      .map((occiiEvent) => {
        const firstAnchor = occiiEvent.querySelector("a");
        const eventText = occiiEvent.textContent.toLowerCase();
        const soldOut = eventText.includes('uitverkocht') || eventText.includes('sold out');
        return {
          venueEventUrl: firstAnchor.href,
          title: firstAnchor.title,
          soldOut,
          shortText:
            occiiEvent.querySelector(".occii-events-description")
              ?.textContent ?? "",
        };
      });
  }, {workerData});

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
  
};
// GET PAGE INFO

occiiScraper.getPageInfo = async function ({ page }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()

  const pageInfo = await page.evaluate((months) => {
    const res = {
      unavailable: "",
      pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
      errorsVoorErrorHandler: [],
    };

    res.image = document.querySelector(".wp-post-image")?.src ?? null;
    const eventCategoriesEl = document.querySelector(".occii-event-details");
    try {
      const eventDateEl = document.querySelector(".occii-event-date-highlight");
      const eventDateSplit1 = eventDateEl.textContent.trim().split(",");
      const eventYear = eventDateSplit1[2].trim();
      const eventDateSplit2 = eventDateSplit1[1].trim().split(" ");
      const eventMonthEnglish = eventDateSplit2[0].trim();
      const eventDay = eventDateSplit2[1].trim();
      const eventMonth = months[eventMonthEnglish.toLowerCase()];
      const eventDateString = `${eventYear}-${eventMonth}-${eventDay}`;
      const doorsOpenMatch = eventCategoriesEl.textContent.match(
        /Doors\sopen:\s+(\d\d:\d\d)/
      );
      const doorsOpen =
        doorsOpenMatch && doorsOpenMatch.length > 1 ? doorsOpenMatch[1] : null;

      res.doorOpenDateTime = doorsOpen
        ? new Date(`${eventDateString}T${doorsOpen}`).toISOString()
        : new Date(`${eventDateString}T00:00`).toISOString();

      const showtimeMatch = eventCategoriesEl.textContent.match(
        /Showtime:\s+(\d\d:\d\d)/
      );
      const showtime =
        showtimeMatch && showtimeMatch.length > 1 ? doorsOpenMatch[1] : null;

      res.startDateTime = showtime
        ? new Date(`${eventDateString}T${showtime}`).toISOString()
        : new Date(`${eventDateString}T00:00`).toISOString();
    } catch (error) {
      res.errorsVoorErrorHandler.push({
        error,
        remarks: "date time wrap trycatch",
      });
    }

    res.priceTextcontent = document.getElementById('occii-single-event')?.textContent ?? null;

    res.genre =
      document.querySelector('[href*="events/categories"]')?.textContent ??
      null;
    res.longTextHTML = document.querySelector(".occii-event-notes").innerHTML;
    return res;
  }, getVenueMonths('occii'));

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};
