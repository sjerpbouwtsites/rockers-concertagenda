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
        url: "https://www.poppodium-volt.nl/programma?f%5B0%5D=activity_itix_genres%3A9&f%5B1%5D=activity_itix_genres%3A30",
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
    await page.waitForSelector(".card-activity", {
      timeout: 1250,
    });

  } catch (error) {
    _t.handleError(error, workerData, "Volt wacht op laden eventlijst", 'close-thread', null);
  }

  let rawEvents = await page.evaluate(({workerData, unavailabiltyTerms}) => {
    return Array.from(document.querySelectorAll(".card-activity"))
      // .filter((rawEvent) => {
      //   const hasGenreName =
      //     rawEvent
      //       .querySelector(".card-activity-list-badge-wrapper")
      //       ?.textContent.toLowerCase()
      //       .trim() ?? "";
      //   return hasGenreName.includes("metal") || hasGenreName.includes("punk");
      // })
      .map((rawEvent) => {
        const anchor = rawEvent.querySelector('.card-activity__title a') ?? null;
        const title = anchor?.textContent.trim() ?? "";
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title
        };        
        res.venueEventUrl = anchor.hasAttribute("href") ? anchor.href : null;
        res.image = rawEvent.querySelector(".card-activity__image img")?.src ?? null;
        if (!res.image){
          res.errors.push({
            remarks: `image missing ${res.pageInfo}`
          })
        }        
        const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
        res.unavailable = !!rawEvent.textContent.match(uaRex);
        res.soldOut = rawEvent?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;
        return res;
      });
  }, {workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms})
    
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);
  
  //this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
  
};

// GET PAGE INFO

voltScraper.getPageInfo = async function ({ page, url, event}) {

  const {stopFunctie} =  await this.getPageInfoStart()

  const pageInfo = await page.evaluate(
    ({ months, event, url }) => {

      let res = {};
      res.unavailable= event.unavailable;
      res.pageInfo= `<a class='page-info' class='page-info' href='${url}'>${event.title}</a>`;
      res.errors = [];

      res.longTextHTML = document.querySelector(".activity-content-wrapper")?.innerHTML ?? null

      const startDateMatch = document.querySelector('.field--name-field-date')?.textContent.match(/(\d+)\s?(\w+)\s?(\d\d\d\d)/);
      if (Array.isArray(startDateMatch) && startDateMatch.length > 2) {
        const dag = startDateMatch[1].padStart(2, '0');
        const maandNaam = startDateMatch[2];
        const maand = months[maandNaam];
        const jaar = startDateMatch[3];
        res.startDate = `${jaar}-${maand}-${dag}`;
      } else {
        res.startDate = null;
      }

      const eersteTijdRij = document.querySelector('.activity-info-row');
      const tweedeTijdRij = document.querySelector('.activity-info-row + .activity-info-row');
      if (!eersteTijdRij && !tweedeTijdRij){
        res.errors.push({
          error: new Error('geen tijdrijen'),
        })
        return res;
      }
      
      const startTimeM = eersteTijdRij.textContent.match(/\d\d\s?:\s?\d\d/);
      const endTimeM = tweedeTijdRij?.textContent.match(/\d\d\s?:\s?\d\d/) ?? null;
      if (!Array.isArray(startTimeM)){
        res.errors.push({
          error: new Error('geen tijdmatch success'),
          toDebug: eersteTijdRij.textContent,
        })
        return res;        
      } 
      res.startTime = startTimeM[0].replaceAll(/\s/g, '');
      if (Array.isArray(endTimeM)){
        res.endTime = endTimeM[0].replaceAll(/\s/g, '');
      }

      try {
        if (res.startTime) {
          res.startDateTime = new Date(
            `${res.startDate}T${res.startTime}:00`
          ).toISOString();
        }
        
        if (res.endTime) {
          res.endDateTime = new Date(
            `${res.startDate}T${res.endTime}:00`
          ).toISOString();
        }
      } catch (error) {
        res.errors.push({
          error,
          remarks: `ongeldige tijden ${res.pageInfo}`,
        });
        return res;
      
      }
      res.priceTextcontent =
        document.querySelector(".activity-price")
          ?.textContent ?? ''
      ;
      return res;
    },
    { months: this.months, url, event}
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
};







