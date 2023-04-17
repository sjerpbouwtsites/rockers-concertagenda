import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";
import {textContainsHeavyMusicTerms, textContainsForbiddenMusicTerms, waitFor} from "../mods/tools.js"
import * as _t from "../mods/tools.js";

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
        requiredProperties: ['venueEventUrl', 'title']
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

  const availableBaseEvent = await this.checkBaseEventAvailable(workerData.name);
  if (availableBaseEvent){
    this.dirtyDebug({
      title: 'gelul',
      availableBaseEvent
    })
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: availableBaseEvent}
    );    
  }

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  await waitFor(500); // site set filters aan

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
      .filter((rawEvent, index) => index % workerData.workerCount === workerData.index)
      .map((eventEl) => {
        const eersteDeelKorteTekst = eventEl.querySelector('h1 span')?.textContent ?? '';
        const title = eersteDeelKorteTekst.length === 0 
          ? eventEl.querySelector('h1')?.textContent ?? ''
          : eventEl.querySelector('h1')?.textContent.replace(eersteDeelKorteTekst, '') ?? ''
        const res = {
          unavailable: "",
          pageInfo: `<a class='pageinfo' href="${document.location.href}">${workerData.family} - main - ${title}</a>`,
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

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
  
};

// SINGLE EVENT CHECK

oostpoortScraper.singleEventCheck = async function (event) {
  
  if (textContainsHeavyMusicTerms(event.longText)) {
    return {
      event,
      success: true,
      reason: "event contains heavy terms",
    };    
  }
  if (textContainsForbiddenMusicTerms(event.longText)) {
    return {
      event,
      success: false,
      reason: "event contains forbidden terms",
    };    
  }


  const thisIsRock = await this.isRock(event);
  if (thisIsRock.success) {
    return {
      event,
      success: true,
      reason: `is rock check successfull ${thisIsRock.reason}` ,
    }
  } 

  return {
    event,
    success: false,
    reason: `no evidence for heavy music found ${thisIsRock.reason}`,
  }

};

// GET PAGE INFO

oostpoortScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  await _t.waitFor(600);
 
  const pageInfo = await page.evaluate(
    ({event}) => {
      const res = {
        unavailable: event.unavailable,
        pageInfo: `<a href='${document.location.href}'>${document.title}</a>`,
        errors: [],
      };

      try {
        res.longTextHTML = document.querySelector('.content__article .event__language')?.innerHTML;
        res.image = document.querySelector('.hero__image')?.src ?? document.querySelector('.festival__header__image').src ?? null;
        if (!res.image){
          res.errors.push({
            remarks: `image missing ${res.pageInfo}`
          })
        }
        res.priceTextcontent = document.querySelector('.event__pricing__costs')?.textContent ?? document.querySelector('.festival__tickets__toggle') ?? '';

      } catch (caughtError) {
        res.errors.push({
          error: caughtError,
          remarks: 'page info wrap catch'        
          ,toDebug: {
            res, event
          }
        })    
      }

      if (document.querySelector('.event__cta') && document.querySelector('.event__cta').hasAttribute('disabled')) {
        res.unavailable += ` ${document.querySelector('.event__cta').textContent}`;
      }
      return res;
    }, {event},
    
  );
  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
    
}
