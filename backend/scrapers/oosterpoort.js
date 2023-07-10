import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";
import * as _t from "../mods/tools.js";
import ErrorWrapper from "../mods/error-wrapper.js";

// SCRAPER CONFIG

const oostpoortScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 30019,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 60017,
    },
    singlePage: {
      timeout: 20018,
      waitFor: 'load'
    },
    app: {
      mainPage: {
        url: "https://www.spotgroningen.nl/programma/#genres=muziek&subgenres=metal-heavy,pop-rock",
        requiredProperties: ['venueEventUrl', 'title', 'startDateTime']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  
  }
}));

oostpoortScraper.listenToMasterThread();

// SINGLE EVENT CHECK

oostpoortScraper.singleRawEventCheck = async function (event) {

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

oostpoortScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }  

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  await _t.autoScroll(page);
  await _t.autoScroll(page);

  let rawEvents = await page.evaluate(({workerData, unavailabiltyTerms}) => {
    return Array
      .from(
        document.querySelectorAll(
          '.program__list .program__item'
        )
      )
      .filter(eventEl => {
        return !eventEl.classList.contains('is-hidden')
      })
      .map((eventEl) => {
        const eersteDeelKorteTekst = eventEl.querySelector('h1 span')?.textContent ?? '';
        const title = eersteDeelKorteTekst.length === 0 
          ? eventEl.querySelector('h1')?.textContent ?? ''
          : eventEl.querySelector('h1')?.textContent.replace(eersteDeelKorteTekst, '') ?? ''
        const res = {
          pageInfo: `<a class='page-info' href="${location.href}">${workerData.family} - main - ${title}</a>`,
          errors: [],
          title,
        };
        
        try {
          res.startDateTime = new Date(eventEl.querySelector('.program__date')?.getAttribute('datetime') ?? null).toISOString();
        } catch (caughtError) {
          res.errors.push({
            error: caughtError, remarks: `date time faal ${title}.`,        
          })
        }
        const tweedeDeelKorteTekst = eventEl.querySelector('.program__content p')?.textContent ?? '';
        res.shortText = `${eersteDeelKorteTekst}<br>${tweedeDeelKorteTekst}`;
        res.venueEventUrl = eventEl.querySelector(".program__link")?.href ?? null;
        const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
        res.unavailable = !!eventEl.textContent.match(uaRex);
        res.soldOut = !!eventEl.querySelector(".program__status")?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;
        res.longText = eventEl.querySelector('.program__content')?.textContent ?? null; // tijdelijk om in te controleren
        return res;
      });
  }, {
    workerData: workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms
  })

  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
  
};

// GET PAGE INFO

oostpoortScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  await _t.waitFor(600);

  let pageInfo;
 
  pageInfo = await page.evaluate(
    ({event}) => {
      const res = {
        pageInfo: `<a class='page-info' href='${location.href}'>${document.title}</a>`,
        errors: [],
      };

      res.longTextHTML = document.querySelector('.content__article .event__language')?.innerHTML;
      res.image = document.querySelector('.hero__image')?.src ?? document.querySelector('.festival__header__image')?.src ?? null;
      if (!res.image){
        res.errors.push({
          remarks: `image missing ${res.pageInfo}`
        })
      }
  
      if (document.querySelector('.event__pricing__costs')){
        res.priceTextcontent = document.querySelector('.event__pricing__costs')?.textContent ?? null;
      } else if(document.querySelector('.festival__tickets__toggle')){
        res.priceTextcontent = document.querySelector('.festival__tickets__toggle')?.textContent ?? null;
      }
     
      try {
        if (document.querySelector('.event__cta') && document.querySelector('.event__cta').hasAttribute('disabled')) {
          res.corrupted += ` ${document.querySelector('.event__cta')?.textContent}`;
        }        
      } catch (caughtError) {
        res.errors.push({
          error: caughtError,
          remarks: `check if disabled fail  ${res.pageInfo}`,
          toDebug: event
        })            
      }

      return res;
    }, {event},
  ).catch(caughtError => {
    _t.wrappedHandleError(new ErrorWrapper({
      error:caughtError,
      remarks: `pageInfo catch`,
      errorLevel: 'notice',
      workerData,
      toDebug: {
        event,
        pageInfo
      }
    }))
  });
  return await this.getPageInfoEnd({pageInfo, stopFunctie, page, event})
    
}
