import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const dehellingScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 30000,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 20000,
    },
    singlePage: {
      timeout: 10000
    },
    app: {
      mainPage: {
        url: "https://dehelling.nl/agenda/?zoeken=&genre%5B%5D=heavy",
        requiredProperties: ['venueEventUrl', 'title', 'startDateTime']
      }
    }
  
  }
}));

dehellingScraper.listenToMasterThread();

// MAKE BASE EVENTS

dehellingScraper.makeBaseEventList = async function () { 

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  const rawEvents = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll(
        '.c-event-card'
      )
    ).map((eventEl) => {

      const res = {
        unavailable: "",
        pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
        errorsVoorErrorHandler: [],
      };      



      const schemaData = JSON.parse(eventEl.querySelector('[type="application/ld+json"]').innerHTML) 
      res.title = schemaData?.name
      try {
        res.endDateTime = new Date(schemaData.endDate.replace(' ','T')).toISOString();
      } catch (error) {
        res.errorsVoorErrorHandler.push({error, remarks: 'end date time datestring omzetting'})        
      }
      res.image = schemaData?.image
      let startDateTimeString;
      try {
        const metaEl = eventEl.querySelector('.c-event-card__meta') ?? null;
        if (metaEl) {
          const tijdMatch = metaEl.textContent.match(/(\d\d):(\d\d)/);
          if (tijdMatch && tijdMatch.length > 2) {
            res.startTime = tijdMatch[0]
            const hours = tijdMatch[1];
            const minutes = tijdMatch[2];
            startDateTimeString = res.endDateTime.replace(/T.*/, `T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00`);
            res.startDateTime = new Date(startDateTimeString).toISOString();
          }
        }
      } catch (error) {
        res.errorsVoorErrorHandler.push({error, remarks: `start date time eruit filteren error \n ${res.endDateTime} \n ${startDateTimeString}`})        
      }


      if (!res.startTime) {
        res.startDateTime= res.endDateTime;
        res.endDateTime = null;
      } 
      // else {
      //   try {

      //   } catch (error) {
      //     res.errorsVoorErrorHandler.push({error, remarks: `start date omzetting`})        
      //   }
      // }



      res.venueEventUrl = schemaData.url
      res.shortText = schemaData?.description
      return res;
    });
  });

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
  
};

// GET PAGE INFO

dehellingScraper.getPageInfo = async function ({ page }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(
    () => {
      const res = {
        unavailable: "",
        pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
        errorsVoorErrorHandler: [],
      };

      res.longTextHTML = document.querySelector('.c-event-content')?.innerHTML


      if (res.unavailable !== "") {
        res.unavailable = `${res.unavailable}\n${res.pageInfoID}`;
      }
      return res;
    },
    null
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
}
