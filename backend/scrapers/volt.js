import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const voltScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),

  puppeteerConfig: {
    mainPage: {
      waitUntil: 'load'
    },
    app: {
      mainPage: {
        url: "https://www.poppodium-volt.nl/",
        requiredProperties: ['venueEventUrl', 'title']
      }
    }    
  }  
}));

voltScraper.listenToMasterThread();

// MAKE BASE EVENTS

voltScraper.makeBaseEventList = async function () {
  
  const {stopFunctie, page} = await this.makeBaseEventListStart()

  try {
    await page.waitForSelector(".row.event", {
      timeout: 1250,
    });
    await page.waitForSelector(".row.event .card-social", {
      timeout: 1250,
    });
  } catch (error) {
    _t.handleError(error, workerData, "Volt wacht op laden eventlijst");
  }

  let rawEvents = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".row.event .card"))
      .filter((rawEvent) => {
        const hasGenreName =
          rawEvent
            .querySelector(".card-location")
            ?.textContent.toLowerCase()
            .trim() ?? "";
        return hasGenreName.includes("metal") || hasGenreName.includes("punk");
      })
      .map((rawEvent) => {
        const anchor = rawEvent.querySelector('h3 [href*="programma"]') ?? null;
        const title = anchor?.textContent.trim() ?? "";
        const venueEventUrl = anchor.hasAttribute("href") ? anchor.href : null;
        const image = rawEvent.querySelector("img")?.src ?? null;
        const soldOut = !!(rawEvent.querySelector(".card-content")?.textContent.toLowerCase().includes('uitverkocht') ?? null)
        return {
          venueEventUrl,
          title,
          image,
          soldOut,
        };
      });
  }, null);

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
  
};

// GET PAGE INFO

voltScraper.getPageInfo = async function ({ page, url}) {

  const {stopFunctie} =  await this.getPageInfoStart()

  try {
    await page.waitForSelector("#main .content-block", {
      timeout: 7500,
    });
  } catch (error) {
    _t.handleError(error, this.workerData, "Volt wacht op laden single pagina");
  }

  const pageInfo = await page.evaluate(
    ({ months }) => {
      const res = {
        unavailable: null,
        pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
      };
      const curMonthNumber = new Date().getMonth() + 1;
      const curYear = new Date().getFullYear();

      const contentBox =
        document.querySelector("#main .aside + div > .content-block") ?? null;
      if (contentBox) {
        res.longTextHTML = contentBox.innerHTML;
      }
      const unstyledListsInAside = document.querySelectorAll(
        "#main .aside .list-unstyled"
      ) ?? [null];
      const startDateMatch =
        unstyledListsInAside[0].textContent
          .trim()
          .toLowerCase()
          .match(/(\d{1,2})\s+(\w+)/) ?? null;
      let startDate;

      if (
        startDateMatch &&
        Array.isArray(startDateMatch) &&
        startDateMatch.length === 3
      ) {
        const day = startDateMatch[1].padStart(2, "0");
        const month = months[startDateMatch[2]];
        const year = Number(month) >= curMonthNumber ? curYear : curYear + 1;
        startDate = `${year}-${month}-${day}`;
        res.startDate = startDate;
      }

      const timesList = document.querySelector(
        "#main .aside .prices ~ .list-unstyled"
      );
      const timesMatch =
        timesList?.textContent.toLowerCase().match(/(\d\d:\d\d)/g) ?? null;
      if (timesMatch && Array.isArray(timesMatch) && timesMatch.length >= 1) {
        let startTime, doorTime, endTime;
        if (timesMatch.length === 1) {
          startTime = timesMatch[0];
        } else if (timesMatch.length === 2) {
          doorTime = timesMatch[0];
          startTime = timesMatch[1];
        } else {
          doorTime = timesMatch[0];
          startTime = timesMatch[1];
          endTime = timesMatch[2];
        }
        try {
          if (startTime) {
            res.startDateTime = new Date(
              `${startDate}T${startTime}:00`
            ).toISOString();
          }
          if (doorTime) {
            res.doorOpenDateTime = new Date(
              `${startDate}T${doorTime}:00`
            ).toISOString();
          }
          if (endTime) {
            res.endDateTime = new Date(
              `${startDate}T${endTime}:00`
            ).toISOString();
          }
        } catch (error) {
          res.error = `ongeldige tijden: ${timesMatch.join(" ")}\n${
            error.message
          }`;
        }
      }
      res.priceTextcontent =
        document.querySelector("#main .aside .list-unstyled.prices")
          ?.textContent ?? ''
      ;
      return res;
    },
    { months: this.months, url }
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
};







