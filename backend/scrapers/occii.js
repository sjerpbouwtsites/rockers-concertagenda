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
        url: "https://occii.org/events/categories/rock/",
        requiredProperties: ['venueEventUrl']        
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  }
}));

occiiScraper.listenToMasterThread();

// SINGLE RAW EVENT CHECK

occiiScraper.singleRawEventCheck = async function(event){
  const tl = this.cleanupEventTitle(event.title);
  const isRefused = await this.rockRefuseListCheck(event, tl)
  if (isRefused.success) {
    return {
      reason: isRefused.reason,
      event,
      success: false
    };
  } 

  const isAllowed = await this.rockAllowListCheck(event, tl)
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  if (hasForbiddenTerms.success) {
    await this.saveRefusedTitle(tl)
    return {
      reason: hasForbiddenTerms.reason,
      success: false,
      event
    }
  }

  await this.saveAllowedTitle(tl)

  return {
    reason: 'occii rules',
    success: true,
    event
  }  

}

// SINGLE MERGED EVENT CHECK

occiiScraper.singleMergedEventCheck = async function(event, pageInfo){

  const workingTitle = this.cleanupEventTitle(event.title)

  const isRefused = await this.rockRefuseListCheck(event, workingTitle)
  if (isRefused.success) {
    return {
      reason: isRefused.reason,
      event,
      success: false
    }
  }

  const isAllowed = await this.rockAllowListCheck(event, workingTitle)
  if (isAllowed.success) {
    return isAllowed;  
  }  

  const ss = !(pageInfo?.genres?.include('electronic') ?? false);
  if (ss) {
    this.saveAllowedTitle(workingTitle)
  } else {
    this.saveRefusedTitle(workingTitle)
  }
  return {
    reason: 'ja genre controle' +ss,
    success: ss,
    event
  };
  
}

// MAKE BASE EVENTS

occiiScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }  

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  let rawEvents = await page.evaluate(({workerData,unavailabiltyTerms}) => {
    return Array.from(document.querySelector('.occii-events-display-container').querySelectorAll(".occii-event-display"))
      .map((occiiEvent) => {
        
        const firstAnchor = occiiEvent.querySelector("a");
        const title = firstAnchor.title;
        const res = {

          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],          
          title,
        }         

        const eventText = occiiEvent.textContent.toLowerCase();
        const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
        res.unavailable = !!occiiEvent.textContent.match(uaRex);       
        res.soldOut = !!eventText.match(/uitverkocht|sold\s?out/i) ?? false;
        res.venueEventUrl = firstAnchor.href;
        res.shortText = occiiEvent.querySelector(".occii-events-description")?.textContent ?? null
        return res;

      });
  }, {workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms})

  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
  
};
// GET PAGE INFO

occiiScraper.getPageInfo = async function ({ page, event}) {
  
  const {stopFunctie} =  await this.getPageInfoStart()

  const pageInfo = await page.evaluate(({months, event}) => {
    const res = {
      pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
      errors: [],
    };
    res.image = document.querySelector(".wp-post-image")?.src ?? null;
    if (!res.image){
      res.errors.push({
        remarks: `image missing ${res.pageInfo}`
      })
    }    
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
    } catch (caughtError) {
      res.errors.push({
        error: caughtError,
        remarks: `date time wrap trycatch drama ${res.pageInfo}`,        
        toDebug: {
          event
        }
      });
      return res;
    }

    res.priceTextcontent = document.getElementById('occii-single-event')?.textContent ?? null;

    res.genre = Array.from(document.querySelectorAll('.event-categories [href*="events/categories"]')).map(cats => cats.textContent.toLowerCase().trim())

    res.longTextHTML = document.querySelector(".occii-event-notes").innerHTML;
    return res;
  }, {months: getVenueMonths('occii'), event}); //TODO is verouderde functie getVenueMonths

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};
