import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const dehellingScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 30010,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 20011,
    },
    singlePage: {
      timeout: 10012
    },
    app: {
      mainPage: {
        url: "https://dehelling.nl/agenda/?zoeken=&genre%5B%5D=heavy",
        requiredProperties: ['venueEventUrl', 'title', 'startDateTime']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  
  }
}));

dehellingScraper.listenToMasterThread();

// MERGED ASYNC CHECK

dehellingScraper.singleMergedEventCheck = async function (event) {
  const tl = this.cleanupEventTitle(event.title);

  const isRefused = await this.rockRefuseListCheck(event, tl)
  if (isRefused.success) {
    return {
      reason: isRefused.reason,
      event,
      success: false
    }
  }

  const isAllowed = await this.rockAllowListCheck(event, tl)
  if (isAllowed.success) {
    return isAllowed;  
  }

  return {
    event,
    success: true,
    reason: "nothing found currently",
  };
};

// MAKE BASE EVENTS

dehellingScraper.makeBaseEventList = async function () { 

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }   

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  let rawEvents = await page.evaluate(({workerData}) => {
    return Array.from(
      document.querySelectorAll(
        '.c-event-card'
      )
    )
      .filter(eventEl => {
        // TODO naar fatsoenlijke async check
        const tc = eventEl.querySelector('.c-event-card__meta')?.textContent.toLowerCase() ?? '';
        return !tc.includes('experimental') && !tc.includes('hiphop')
      })
      .map((eventEl) => {
      
        const schemaData = JSON.parse(eventEl.querySelector('[type="application/ld+json"]').innerHTML) 
        const title = schemaData?.name

        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title,
        };      

        try {
          res.endDateTime = new Date(schemaData.endDate.replace(' ','T')).toISOString();
        } catch (caughtError) {
          res.errors.push({error: caughtError, remarks: `end date time datestring omzetting ${title} ${res.pageInfo}`,toDebug:res})        
        }
        res.image = schemaData?.image ?? null;
        if (!res.image){
          res.errors.push({
            remarks: `image missing ${res.pageInfo}`
          })
        }
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
        } catch (caughtError) {
          res.errors.push({error: caughtError, remarks: `start date time eruit filteren error \n ${res.endDateTime} \n ${startDateTimeString} ${title} ${res.pageInfo}`,toDebug:res})        
        }

        res.soldOut = !!eventEl.querySelector('.c-event-card__banner--uitverkocht');

        if (!res.startTime && res.endDateTime) {
          res.startDateTime = res.endDateTime;
          res.endDateTime = null;
        } 

        res.venueEventUrl = schemaData.url
        res.shortText = schemaData?.description ?? null;

        return res;
      })},{workerData})

  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
  
};

// GET PAGE INFO

dehellingScraper.getPageInfo = async function ({ page,event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(
    ({event}) => {
      const res = {
        pageInfo: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
        errors: [],
      };
      res.priceTextcontent = document.querySelector('.c-event-meta__table')?.textContent ?? null;
      res.longTextHTML = document.querySelector('.c-event-content')?.innerHTML ?? null
      return res;
    },
    {event}
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
}
