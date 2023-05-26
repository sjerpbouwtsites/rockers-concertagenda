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
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }    
  }  
}));

voltScraper.listenToMasterThread();

// MAKE BASE EVENTS

voltScraper.makeBaseEventList = async function () {
  
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  } 

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  try {
    await page.waitForSelector(".row.event", {
      timeout: 1250,
    });
    await page.waitForSelector(".row.event .card-social", {
      timeout: 1250,
    });
  } catch (error) {
    _t.handleError(error, workerData, "Volt wacht op laden eventlijst", 'close-thread', null);
  }

  let rawEvents = await page.evaluate(({workerData}) => {
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
        const res = {
          unavailable: '',
          pageInfo: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title
        };        
        res.venueEventUrl = anchor.hasAttribute("href") ? anchor.href : null;
        res.image = rawEvent.querySelector("img")?.src ?? null;
        if (!res.image){
          res.errors.push({
            remarks: `image missing ${res.pageInfo}`
          })
        }        
        res.soldOut = !!(rawEvent.querySelector(".card-content")?.textContent.toLowerCase().includes('uitverkocht') ?? null)
        return res;
      });
  }, {workerData});

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
  
};

// GET PAGE INFO

voltScraper.getPageInfo = async function ({ page, url, event}) {

  const {stopFunctie} =  await this.getPageInfoStart()

  try {
    await page.waitForSelector("#main .content-block", {
      timeout: 7500,
    });
  } catch (error) {
    // TODO WRAPPER ERREOR
    _t.handleError(error, this.workerData, "Volt wacht op laden single pagina", 'notice', event);
  }

  const pageInfo = await page.evaluate(
    ({ months, event, url }) => {

      let res = {};
      res.unavailable= event.unavailable;
      res.pageInfo= `<a class='page-info' class='page-info' href='${url}'>${event.title}</a>`;
      res.errors = [];

      const curMonthNumber = new Date().getMonth() + 1;
      const curYear = new Date().getFullYear();

      res.longTextHTML = document.querySelector("#main .aside + div > .content-block")?.innerHTML ?? null

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
          res.errors.push({
            error,
            remarks: `ongeldige tijden ${res.pageInfo}`,
            toDebug: {
              matches:   timesMatch.join(" "),
              res,event
            }
          });
          return res;
        }
      }
      res.priceTextcontent =
        document.querySelector("#main .aside .list-unstyled.prices")
          ?.textContent ?? ''
      ;
      return res;
    },
    { months: this.months, url, event}
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
};







