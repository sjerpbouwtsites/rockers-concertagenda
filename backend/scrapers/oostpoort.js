import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";
import {textContainsHeavyMusicTerms, textContainsForbiddenMusicTerms, waitFor} from "../mods/tools.js"
import * as _t from "../mods/tools.js";

// SCRAPER CONFIG

const oostpoortScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 30000,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 60000,
    },
    singlePage: {
      timeout: 20000
    },
    app: {
      mainPage: {
        url: "https://www.spotgroningen.nl/programma/#genres=muziek&subgenres=metal-heavy,pop-rock",
        requiredProperties: ['venueEventUrl', 'title']
      }
    }
  
  }
}));

oostpoortScraper.listenToMasterThread();

// MAKE BASE EVENTS

oostpoortScraper.makeBaseEventList = async function () {

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
        const res = {};
        const eersteDeelKorteTekst = eventEl.querySelector('h1 span')?.textContent ?? '';
        res.title = eersteDeelKorteTekst.length === 0 
          ? eventEl.querySelector('h1')?.textContent ?? ''
          : eventEl.querySelector('h1')?.textContent.replace(eersteDeelKorteTekst, '') ?? ''
        const tweedeDeelKorteTekst = eventEl.querySelector('.program__content p')?.textContent ?? '';
        res.shortText = `${eersteDeelKorteTekst}<br>${tweedeDeelKorteTekst}`;
        res.venueEventUrl = eventEl.querySelector(".program__link")?.href ?? null;
        try {
          res.startDateTime = new Date(eventEl.querySelector('.program__date')?.getAttribute('datetime') ?? null).toISOString();
        } catch (error) {
          res.errorsVoorErrorHandler.push({
            error,
            remarks: 'date time faal'
          })
        }
        res.longText = eventEl.querySelector('.program__content')?.textContent ?? null; // tijdelijk om in te controleren
        return res;
      });
  }, {
    workerData: workerData
  });

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
      reason: "is rock check successfull",
    }
  } 

  return {
    event,
    success: false,
    reason: "no evidence for heavy music found",
  }

};

// GET PAGE INFO

oostpoortScraper.getPageInfo = async function ({ page }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  await _t.waitFor(333);
 
  const pageInfo = await page.evaluate(
    () => {
      const res = {
        unavailable: "",
        pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
        errorsVoorErrorHandler: [],
      };

      try {
        res.longTextHTML = document.querySelector('.content__article .event__language')?.innerHTML;
        res.image = document.querySelector('.hero__image')?.src ?? null;
        res.priceTextcontent = document.querySelector('.event__pricing__costs')?.textContent ?? document.querySelector('.festival__tickets__toggle') ?? '';

      } catch (error) {
        res.errorsVoorErrorHandler.push({
          error,
          remarks: 'page info wrap catch'
        })    
      }

      if (res.unavailable !== "") {
        res.unavailable = `${res.unavailable}\n${res.pageInfoID}`;
      }
      return res;
    },
    
  );
  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
    
}
