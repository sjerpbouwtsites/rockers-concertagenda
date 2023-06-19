import { workerData} from "worker_threads";
//import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const groeneEngelScraper = new AbstractScraper(makeScraperConfig({
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

groeneEngelScraper.listenToMasterThread();

// MERGED ASYNC CHECK

groeneEngelScraper.singleMergedEventCheck = async function (event) {
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

// MAKE BASE EVENT LIST

groeneEngelScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }    

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  let punkMetalRawEvents = await page.evaluate(({workerData, unavailabiltyTerms}) => {
    return Array.from(document.querySelectorAll(".event-item"))
      .filter((eventEl) => {
        const tags =
          eventEl.querySelector(".meta-tag")?.textContent.toLowerCase() ?? "";
        return (
          tags.includes("metal") ||
          tags.includes("punk")
        );
      }).map((eventEl) =>{
        const title = eventEl.querySelector(".media-heading")?.textContent ?? null;
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title
        };
        res.venueEventUrl =
            eventEl
              .querySelector(".jq-modal-trigger")
              ?.getAttribute("data-url") ?? "";
        const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
        res.unavailable = !!eventEl.textContent.match(uaRex);      
        res.soldOut = !!eventEl.querySelector('.meta-info')?.textContent.match(/uitverkocht|sold\s?out/i) ?? null;
        return res;
      })
  }, {workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms})

  punkMetalRawEvents = punkMetalRawEvents.map(this.isMusicEventCorruptedMapper);
  

  let rockRawEvents = await page.evaluate(({workerData}) => {
    return Array.from(document.querySelectorAll(".event-item"))
      .filter((eventEl) => {
        const tags =
          eventEl.querySelector(".meta-tag")?.textContent.toLowerCase() ?? "";
        return (
          tags.includes("rock")
        );
      }).map((eventEl) => {
        const title = eventEl.querySelector(".media-heading")?.textContent ?? null;
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title
        };
        res.venueEventUrl =
            eventEl
              .querySelector(".jq-modal-trigger")
              ?.getAttribute("data-url") ?? "";
      
        res.soldOut = !!(eventEl.querySelector('.meta-info')?.textContent.toLowerCase().includes('uitverkocht') ?? null)
        return res;
      })
  }, {workerData})

  rockRawEvents = rockRawEvents.map(this.isMusicEventCorruptedMapper);

  const checkedRockEvents = [];
  while (rockRawEvents.length){
    const thisRockRawEvent = rockRawEvents.shift();
    const isRockRes = await this.isRock(thisRockRawEvent);
    if (isRockRes.success){
      checkedRockEvents.push(thisRockRawEvent)
    }
  }

  const rawEvents = punkMetalRawEvents.concat(checkedRockEvents)

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
};

// MAKE BASE EVENTS

groeneEngelScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }    

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  let rawEvents = await page.evaluate(({workerData, months, unavailabiltyTerms}) => {
    return Array.from(document.querySelectorAll(".collection-wrapper .event-part"))
      .filter((eventEl) => {
        const titelElText = eventEl
          .querySelector('.part-title')?.textContent.toLowerCase() ?? '';
        return titelElText.includes('ge heavy');
      })
      .map((eventEl) => {
        const title = eventEl.querySelector('h2')?.textContent ?? "";
        const res = {
  
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],          
          title
        }   
        const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
        res.unavailable = !!eventEl.textContent.match(uaRex);        
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
  }, {workerData, months: this.months, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms })
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
  
};

groeneEngelScraper.getPageInfo = async function ({ page, event }) {

  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(({event}) => {
    const res = {
      pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
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
