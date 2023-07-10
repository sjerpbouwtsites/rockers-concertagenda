import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import { neushoornMonths } from "../mods/months.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const neushoornScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    singlePage: {
      timeout: 20000
    },
    app: {
      mainPage: {
        url: "https://neushoorn.nl/#/search?category=Heavy",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  }
}));

neushoornScraper.listenToMasterThread();

// SINGLE RAW EVENT CHECK

neushoornScraper.singleRawEventCheck = async function(event){

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

  const hasGoodTermsRes = await this.hasGoodTerms(event);
  if (hasGoodTermsRes.success) {
    await this.saveAllowedTitle(workingTitle)
    return hasGoodTermsRes;
  }

  let overdinges = null;
  if (workingTitle.match(/\s[-–]\s/)) {
    const a = workingTitle.replace(/\s[-–]\s.*/,'');
    overdinges = [a]
  }

  const isRockRes = await this.isRock(event, overdinges);
  if (isRockRes.success){
    await this.saveAllowedTitle(event.title.toLowerCase())
  } else {
    await this.saveRefusedTitle(event.title.toLowerCase())
  }
  return isRockRes;

}

// MAKE BASE EVENTS

neushoornScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }  

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  try {
    await page.waitForSelector(".productions__item", {
      timeout: this.singlePageTimeout,
    });
    await _t.waitFor(50);
  } catch (caughtError) {
    _t.handleError(caughtError, workerData, `Laad en klikwachten timeout neushoorn`, 'close-thread', null);
    return await this.makeBaseEventListEnd({
      stopFunctie, page, rawEvents:[]}
    );
  }

  let rawEvents = await page.evaluate(({workerData,unavailabiltyTerms}) => {
    return Array.from(document.querySelectorAll(".productions__item"))
      .map(
        (eventEl) => {
        
          const title = eventEl.querySelector(
            ".productions__item__content span:first-child"
          ).textContent;
          const res = {
            pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],          
            title
          }  
          res.shortText = eventEl.querySelector('.productions__item__subtitle')?.textContent ?? '';
          res.venueEventUrl = eventEl.href;
          const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
          res.unavailable = !!eventEl.textContent.match(uaRex);          
          res.soldOut = !!eventEl.querySelector(".chip")?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;
          return res;
        }
      );
  }, {workerData,unavailabiltyTerms: AbstractScraper.unavailabiltyTerms})
    
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
};

// GET PAGE INFO

neushoornScraper.getPageInfo = async function ({ page,event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(
    ({ months, event }) => {
      const res = {
        pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
        errors: [],
      };

      const dateTextcontent =
        document.querySelector(".summary .summary__item:first-child")
          ?.textContent ?? "";
      const dateTextMatch = dateTextcontent.match(/\w+\s?(\d+)\s?(\w+)/);

      if (dateTextMatch && dateTextMatch.length === 3) {
        const year = "2023";
        const month = months[dateTextMatch[2]];
        const day = dateTextMatch[1].padStart(2, "0");
        res.startDate = `${year}-${month}-${day}`;
      } else {
        res.errors.push({
          remarks: `geen startDate ${res.pageInfo}`,
          toDebug:{
            text:  document.querySelector(".summary .summary__item:first-child")
              ?.textContent,
          }
        })
      }

      const timeTextcontent =
        document.querySelector(".summary .summary__item + .summary__item")
          ?.textContent ?? "";
      const timeTextMatch = timeTextcontent.match(
        /(\d{2}:\d{2}).*(\d{2}:\d{2})/
      );
      if (timeTextMatch && timeTextMatch.length === 3 && res.startDate) {
        res.doorOpenDateTime = new Date(
          `${res.startDate}T${timeTextMatch[1]}`
        ).toISOString();
        res.startDateTime = new Date(
          `${res.startDate}T${timeTextMatch[2]}`
        ).toISOString();
      } else {
        res.startDateTime = new Date(
          `${res.startDate}T${timeTextMatch[1]}`
        ).toISOString();
      }

      res.priceTextcontent =
        document.querySelector(".prices__item__price")?.textContent ?? null;
      res.priceContexttext =
        document.querySelector(".prices")?.textContent ?? null;

      try {
        const summaryEl = document.querySelector(".content .summary");
        const longEl = summaryEl.parentNode;
        longEl.removeChild(summaryEl);
        res.longTextHTML = longEl.innerHTML;
      } catch (caughtError) {
        res.errors.push({
          error: caughtError,
          remarks: `longTextHTML faal ${res.pageInfo}`, 
          toDebug: {
            event
          }
        });
      }

      res.longTextHTML += Array.from(document.querySelectorAll('.tophits iframe'))
        .map(frame => frame.outerHTML)
        .join('')

      const imageMatch = document
        .querySelector(".header--theatre")
        ?.style.backgroundImage.match(/https.*.png|https.*.jpg/);
      if (imageMatch && imageMatch.length) {
        res.image = imageMatch[0];
      }
      if (!res.image){
        res.errors.push({
          remarks: `image missing ${res.pageInfo}`
        })
      }      

      return res;
    },
    { months: neushoornMonths, event }
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page, event})
  
};
