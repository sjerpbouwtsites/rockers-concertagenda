import { workerData} from "worker_threads";
//import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const melkwegScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 60075,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 25076,
      waitUntil: 'load'
    },
    singlePage: {
      timeout: 20077
    },
    app: {
      mainPage: {
        url: "https://www.groene-engel.nl/programma/?filter=concert",
        requiredProperties: ['venueEventUrl', 'title', 'startDateTime']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  }
}));

melkwegScraper.listenToMasterThread();

// MAKE BASE EVENTS

melkwegScraper.makeBaseEventList = async function () {

  const availableBaseEvent = await this.checkBaseEventAvailable(workerData.name);
  if (availableBaseEvent){
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: availableBaseEvent}
    );    
  }  

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
        const title = eventEl.querySelector('h2')?.textContent ?? "";
        const res = {
          unavailable: "",
          pageInfo: `<a href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],          
          title
        }   
        
        res.venueEventUrl = eventEl.querySelector("a")?.href ?? null;

        try {
          const startDateMatch = eventEl.querySelector('.date-label')?.textContent.toLowerCase().match(/(\d+)\s+(\w+)\s+(\d+)/)
          if (startDateMatch && startDateMatch.length > 3){
            const day = startDateMatch[1].padStart(2, '0');
            const month = months[startDateMatch[2]];
            const year = startDateMatch[3];
            // PAS IN PAGE INFO TIJD AAN.
            res.startDateTime = new Date(`${year}-${month}-${day}T12:00:00`).toISOString(); 
          }          
        } catch (caughtError) {
          res.errors.push({
            error: caughtError,remarks: `startDate main fout ${res.pageInfo}`,
            toDebug: res
          })
        }
        return res;
      });
  }, {workerData, months: this.months });

  this.saveBaseEventlist(workerData.family, rawEvents)

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
  
};

melkwegScraper.getPageInfo = async function ({ page, event }) {

  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(({event}) => {
    const res = {
      unavailable: event.unavailable,
      pageInfo: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
      errors: [],
    };
    const mainTicketInfo =  document.querySelector('.main-ticket-info') ?? null;
    try {
      const timeText = mainTicketInfo?.textContent.toLowerCase().split('tijden')[1] ?? null;
      if (!timeText){
        res.errors.push({
          remarks: `geen timeText gevonden ${res.pageInfo}`,
          toDebug: {
            mainTicketInfoTextContent: mainTicketInfo?.textContent,
            res, event
          }
        })
        return res;
      }
      const timesMatches = timeText.match(/(\d\d:\d\d).*(\d\d:\d\d)/);
      const startTime = timesMatches[1]
      const openTime = timesMatches[2]
      const startDate = event.startDateTime.split('T')[0]
      res.startDateTime = new Date(`${startDate}T${startTime}:00`).toISOString();
      res.doorOpenDateTime = new Date(`${startDate}T${openTime}:00`).toISOString();
    } catch (caughtError) {
      res.errors.push({
        error: caughtError,
        remarks: `time fouten ${res.pageInfo}`,
        toDebug: {res, event}
      });
      return res;
    }
    res.priceTextcontent = mainTicketInfo?.textContent ?? '';
    res.longTextHTML = Array.from(document.querySelectorAll('.main-content .production-title-wrapper ~ *')).reduce((prev, next) =>{return prev + next.outerHTML}, '');

    res.image = document.querySelector('.img-wrapper img')?.getAttribute('data-lazy-src') ?? null;
    if (!res.image){
      res.errors.push({
        remarks: `image missing ${res.pageInfo}`
      })
    }
  
    return res;
  }, {event});

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})

};
