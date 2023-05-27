import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";
import ErrorWrapper from "../mods/error-wrapper.js";
import * as _t from "../mods/tools.js";

// SCRAPER CONFIG

const patronaatScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 30034,
    },
    singlePage: {
      timeout: 20036,
    },
    app: {
      mainPage: {
        url: "https://patronaat.nl/programma/?type=event&s=&eventtype%5B%5D=178",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  },
}));

patronaatScraper.listenToMasterThread();

// SINGLE EVENT CHECK

patronaatScraper.singleRawEventCheck = async function (event) {

  const workingTitle = this.cleanupEventTitle(event.title.toLowerCase());

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

  const isRockRes = await this.isRock(event, [workingTitle]);
  if (isRockRes.success){
    await this.saveAllowedTitle(workingTitle)
  } else {
    await this.saveRefusedTitle(workingTitle)
  }
  return isRockRes;
  
};

// MAKE BASE EVENTS

patronaatScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  } 

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  const rawEvents = await page.evaluate(({workerData}) => {
    return Array.from(document.querySelectorAll(".overview__list-item--event"))
      .map((eventEl) => {
        const title = eventEl.querySelector(".event-program__name")?.textContent.trim();
        const res = {
          unavailable: '',
          pageInfo: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title
        };
        res.image =
          eventEl.querySelector(".event-program__image img")?.src ?? null;
        if (!res.image){
          res.errors.push({
            remarks: `image missing ${res.pageInfo}`
          })
        }          
        res.venueEventUrl = eventEl.querySelector("a[href]")?.href ?? null;
        res.shortText = eventEl
          .querySelector(".event-program__subtitle")
          ?.textContent.trim() ?? '';
        res.soldOut = !!(eventEl.querySelector('.event__tags-item--sold-out') ?? null)
        return res;
      });
  }, {workerData});

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
};

// GET PAGE INFO

patronaatScraper.getPageInfo = async function ({ page, event }) {
 
  const {stopFunctie} =  await this.getPageInfoStart()

  const pageInfo = await page.evaluate(({months, event}) => {
    const res = {
      unavailable: event.unavailable,
      pageInfo: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
      errors: [],
    };
    res.priceTextcontent = document
      .querySelector(".event__info-bar--ticket-price")
      ?.textContent.toLowerCase()
      .trim();

    try {
      res.startDatumM = document
        .querySelector(".event__info-bar--star-date")
        ?.textContent.toLowerCase()
        .match(/(\d{1,2})\s+(\w{3,4})\s+(\d\d\d\d)/);
      if (Array.isArray(res.startDatumM) && res.startDatumM.length >= 4) {
        let day = res.startDatumM[1].padStart(2, "0");
        let month = months[res.startDatumM[2]];
        let year = res.startDatumM[3];
        res.startDatum = `${year}-${month}-${day}`;
      }

      if (res.startDatum) {
        [
          ["doorOpenTime", ".event__info-bar--doors-open"],
          ["startTime", ".event__info-bar--start-time"],
          ["endTime", ".event__info-bar--end-time"],
        ].forEach((timeField) => {
          const [timeName, selector] = timeField;

          const mmm = document
            .querySelector(selector)
            ?.textContent.match(/\d\d:\d\d/);
          if (Array.isArray(mmm) && mmm.length === 1) {
            res[timeName] = mmm[0];
          }
        });

        if (!res.startTime) {
          res.startTime = res.doorOpenTime;
        } 
        if (!res.startTime){
          res.errors.push({
            remarks: `geen startTime ${res.pageInfo}`,
            toDebug: event
          })
          return res;          
        }

        if (res.doorOpenTime) {
          res.doorOpenDateTime = new Date(
            `${res.startDatum}T${res.doorOpenTime}:00`
          ).toISOString();
        }
        if (res.startTime) {
          res.startDateTime = new Date(
            `${res.startDatum}T${res.startTime}:00`
          ).toISOString();
        }
        if (res.endTime) {
          res.endDateTime = new Date(
            `${res.startDatum}T${res.endTime}:00`
          ).toISOString();
        }
      } else {
        res.errors.push({
          remarks: `geen startDate ${res.pageInfo}`,
          toDebug: event,res
        })
        return res;        
      }
    } catch (caughtError) { //TODO opsplitsen
      res.errors.push({
        error: caughtError,
        remarks: `Datum error patronaat ${res.pageInfo}.`,
        toDebug: {res, event}
      });
    }

    res.longTextHTML = document.querySelector(".event__content")?.innerHTML ?? null;

    return res;
  }, {months: this.months, event}).catch(caughtError =>{
    _t.wrappedHandleError(new ErrorWrapper({
      error: caughtError,
      remarks: `page Info catch patronaat`,
      errorLevel: 'notice',
      workerData: workerData,
      toDebug: {
        event, 
        pageInfo
      }
    }))
  });

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};
