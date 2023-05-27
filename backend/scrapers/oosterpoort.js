import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";
import {textContainsHeavyMusicTerms, textContainsForbiddenMusicTerms, waitFor} from "../mods/tools.js"
import * as _t from "../mods/tools.js";
import fs from 'fs';
import ErrorWrapper from "../mods/error-wrapper.js";
import fsDirections from "../mods/fs-directions.js";

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

  const rawEvents = await page.evaluate(({workerData}) => {
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
          unavailable: "",
          pageInfo: `<a class='page-info' href="${location.href}">${workerData.family} - main - ${title}</a>`,
          errors: [],
          title,
        };
        
        try {
          res.startDateTime = new Date(eventEl.querySelector('.program__date')?.getAttribute('datetime') ?? null).toISOString();
        } catch (caughtError) {
          res.errors.push({
            error: caughtError, remarks: `date time faal ${title}.`,        
            toDebug: res
          })
          return res;
        }


        const tweedeDeelKorteTekst = eventEl.querySelector('.program__content p')?.textContent ?? '';
        res.shortText = `${eersteDeelKorteTekst}<br>${tweedeDeelKorteTekst}`;
        res.venueEventUrl = eventEl.querySelector(".program__link")?.href ?? null;
        res.soldOut = !!(eventEl.querySelector(".program__status")?.textContent.toLowerCase().includes('uitverkocht') ?? null)
        res.longText = eventEl.querySelector('.program__content')?.textContent ?? null; // tijdelijk om in te controleren
        return res;
      });
  }, {
    workerData: workerData
  });

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
  
};

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

// GET PAGE INFO

oostpoortScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  await _t.waitFor(600);

  let pageInfo;
 
  pageInfo = await page.evaluate(
    ({event}) => {
      const res = {
        unavailable: event.unavailable,
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
          res.unavailable += ` ${document.querySelector('.event__cta')?.textContent}`;
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
  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
    
}
