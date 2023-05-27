import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";


// SCRAPER CONFIG

const p60Scraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 60020,
    },    
    singlePage: {
      timeout: 30021
    },
    app: {
      mainPage: {
        url: "https://p60.nl/agenda",
        requiredProperties: ['venueEventUrl', 'title', 'startDateTime']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  }
}));

p60Scraper.listenToMasterThread();

// SINGLE EVENT CHECK

p60Scraper.singleRawEventCheck = async function (event) {

  if (!event || !event?.title) {
    return {
      reason: 'Corrupted event',
      event,
      success: false
    };    
  }

  const workingTitle = this.cleanupEventTitle(event.title);

  const isRefused = await this.rockRefuseListCheck(event, workingTitle)
  if (isRefused.success) return {
    reason: isRefused.reason,
    event,
    success: false
  };

  const isAllowed = await this.rockAllowListCheck(event, workingTitle)
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  if (hasForbiddenTerms.success) {
    await this.saveRefusedTitle(workingTitle)
    return {
      reason: hasForbiddenTerms.reason,
      success: false,
      event
    }
  }

  const isRockRes = await this.isRock(event);
  if (isRockRes.success){
    await this.saveAllowedTitle(workingTitle)
  } else {
    await this.saveRefusedTitle(workingTitle)
  }
  return isRockRes;  

};

// MAKE BASE EVENTS

p60Scraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  } 

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  this.dirtyTalk('jaja1');
  await _t.autoScroll(page);
  this.dirtyTalk('jaja2');

  const rawEvents = await page.evaluate(({workerData}) => {
    return Array.from(document.querySelectorAll(".views-infinite-scroll-content-wrapper > .p60-list__item-container")).filter(itemEl => {
      return !!itemEl.querySelector('[href*=ticketmaster]')
    }).map(
      (itemEl) => {
        const title = itemEl.querySelector(
          ".p60-list__item__title"
        )?.textContent.trim() ?? '';

        const res = {
          unavailable: '',
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title
        };

        res.venueEventUrl = itemEl.querySelector('.field-group-link')?.href;

        const doorOpenDateTimeB = itemEl.querySelector('.p60-list__item__date time')?.getAttribute('datetime')
        try {
          res.doorOpenDateTime = new Date(doorOpenDateTimeB).toISOString();
        } catch (caughtError) {
          res.errors.push({error: caughtError, remarks: `openDoorDateTime omzetten ${doorOpenDateTimeB}`,         
            toDebug: res})
        }

        const startTime = itemEl.querySelector('.field--name-field-aanvang')?.textContent.trim();
        let startDateTimeB ;
        if (res.doorOpenDateTime){
          startDateTimeB = doorOpenDateTimeB.replace(/T\d\d:\d\d/, `T${startTime}`);
          try {
            res.startDateTime = new Date(startDateTimeB).toISOString();
          } catch (caughtError) {
            res.errors.push({error: caughtError, remarks: `startDateTime omzetten ${startDateTimeB}`,         
              toDebug: res
            })
            return res;
          }
        }

        res.shortText = itemEl.querySelector('.p60-list__item__description')?.textContent.trim() ?? '';
        return res;
      }
    );
  }, {workerData});

  this.dirtyLog(rawEvents);

  this.dirtyTalk(`geheel aan events ${rawEvents.length}`)

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
};


// @TODO Rock control naar async

// GET PAGE INFO

p60Scraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()

  if (event.unavailable){
    return await this.getPageInfoEnd({pageInfo: {}, stopFunctie, page})
  }
  
  const pageInfo = await page.evaluate(
    ({event}) => {
      const res = {
        unavailable: event.unavailable,
        pageInfo: `<a class='page-info' href='${location.href}'>${document.title}</a>`,
        errors: [],
      };
      const imageMatch = Array.from(document.querySelectorAll('style')).map(styleEl => styleEl.innerHTML).join(`\n`).match(/topbanner.*background-image.*(https.*\.\w{3,4})/)
      if (imageMatch){
        res.image = imageMatch[1]
      }
      if (!res.image){
        res.errors.push({
          remarks: `image missing ${res.pageInfo}`,
          toDebug: {
            styles: Array.from(document.querySelectorAll('style')).map(styleEl => styleEl.innerHTML),
            match: imageMatch
          }
        })
      } 
      res.priceTextcontent = document.querySelector('.event-info__price')?.textContent ?? document.querySelector('.content-section__event-info')?.textContent ?? null;
      // res.ticketURL = document.querySelector('.content-section__event-info [href*="ticketmaster"]')?.href ?? null;
      res.longTextHTML = Array.from(document.querySelectorAll('.kmtContent, .group-footer .media-section')).reduce((prev, next) => prev + next.innerHTML,'')
      return res;
    }, {event}
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};
