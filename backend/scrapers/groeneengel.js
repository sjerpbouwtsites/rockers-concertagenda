import { workerData} from "worker_threads";
//import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const melkwegScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 60000,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 25000,
      waitUntil: 'load'
    },
    singlePage: {
      timeout: 20000
    },
    app: {
      mainPage: {
        url: "https://www.groene-engel.nl/programma/?filter=concert",
        requiredProperties: ['venueEventUrl', 'title', 'startDateTime']
      }
    }
  }
}));

melkwegScraper.listenToMasterThread();

// MAKE BASE EVENTS

melkwegScraper.makeBaseEventList = async function () {

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  const rawEvents = await page.evaluate(({workerData, months}) => {
    return Array.from(document.querySelectorAll(".collection-wrapper .event-part"))
      .filter((eventEl) => {
        const titelElText = eventEl
          .querySelector('.part-title')?.textContent.toLowerCase() ?? '';
        return titelElText.includes('ge heavy');
      })
      .filter((eventEl, index) => index % workerData.workerCount === workerData.index)
      .map((eventEl) => {
        const res = {
          unavailable: "",
          pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
          errorsVoorErrorHandler: [],
        };
        const anchor = eventEl.querySelector("a");
        res.venueEventUrl = anchor.href;
        res.title = eventEl.querySelector('h2')?.textContent ?? "";
        try {
          const startDateMatch = eventEl.querySelector('.date-label')?.textContent.toLowerCase().match(/(\d+)\s+(\w+)\s+(\d+)/)
          if (startDateMatch && startDateMatch.length > 3){
            const day = startDateMatch[1].padStart(2, '0');
            const month = months[startDateMatch[2]];
            const year = startDateMatch[3];
            // PAS IN PAGE INFO TIJD AAN.
            res.startDateTime = new Date(`${year}-${month}-${day}T12:00:00`).toISOString(); 
          }          
        } catch (error) {
          res.unavailable = "geen startDate";
          res.errorsVoorErrorHandler.push({
            error,remarks: `startDate main fout ${res.title}`
          })
        }
        return res;
      });
  }, {workerData, months: this.months });

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
  
};

melkwegScraper.getPageInfo = async function ({ page, event }) {

  this.dirtyLog(event)

  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(({event}) => {
    const res = {
      unavailable: "",
      pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
      errorsVoorErrorHandler: [],
    };
    const mainTicketInfo =  document.querySelector('.main-ticket-info') ?? null;
    try {
      const timeText = mainTicketInfo?.textContent.toLowerCase().split('tijden')[1] ?? null;
      if (!timeText) {
        throw Error(`geen tijd tekst gevonden in ${mainTicketInfo?.textContent}`)
      }
      const timesMatches = timeText.match(/(\d\d:\d\d).*(\d\d:\d\d)/);
      const startTime = timesMatches[1]
      const openTime = timesMatches[2]
      const startDate = event.startDateTime.split('T')[0]
      res.startDateTime = new Date(`${startDate}T${startTime}:00`).toISOString();
      res.doorOpenDateTime = new Date(`${startDate}T${openTime}:00`).toISOString();
    } catch (error) {
      res.unavailable = "time fouten";
      res.errorsVoorErrorHandler.push({
        error,
        remarks: `time fouten ${event.title} ${error.message}`,
      });
    }
    res.priceTextcontent = mainTicketInfo?.textContent ?? '';
    res.longTextHTML = Array.from(document.querySelectorAll('.main-content .production-title-wrapper ~ *')).reduce((prev, next) =>{return prev + next.outerHTML}, '');
    res.image = document.querySelector('.img-wrapper img')?.getAttribute('data-lazy-src') ?? null;
    if (res.unavailable !== "") {
      res.unavailable = `${res.unavailable}\n${res.pageInfoID}`;
    }
    return res;
  }, {event});

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})

};
