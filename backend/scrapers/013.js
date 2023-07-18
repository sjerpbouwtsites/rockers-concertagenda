
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const nuldertienScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  hasDecentCategorisation: true,
  puppeteerConfig: {
    app: {
      mainPage: {
        url: "https://www.013.nl/programma/heavy",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime'],
        
      }
    }
  }
}));

nuldertienScraper.listenToMasterThread();

// SINGLE RAW EVENT CHECK

nuldertienScraper.singleRawEventCheck = async function(event){

  const isRefused = await this.rockRefuseListCheck(event, event.title.toLowerCase())
  if (isRefused.success) return {
    reason: isRefused.reason,
    event,
    success: false
  };

  const isAllowed = await this.rockAllowListCheck(event, event.title.toLowerCase())
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  if (hasForbiddenTerms.success) {
    await this.saveRefusedTitle(event.title.toLowerCase())
    return {
      reason: hasForbiddenTerms.reason,
      success: false,
      event
    }
  }

  return {
    reason: [isRefused.reason, isAllowed.reason, hasForbiddenTerms.reason].join(';'),
    event,
    success: true
  }
}
// MAKE BASE EVENTS

nuldertienScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }   
  
  const {stopFunctie, page} =  await this.makeBaseEventListStart()

  let rawEvents = await page.evaluate(({workerData, unavailabiltyTerms}) => {
    return Array.from(document.querySelectorAll(".event-list-item"))
      .map((eventEl) => {
        const title = eventEl
          .querySelector(".event-list-item__title")
          ?.textContent.trim() ?? null;

        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],          
          title,
        }   

        res.venueEventUrl = eventEl.querySelector(
          ".event-list-item__link"
        )?.href ?? null;

        const datumEl = eventEl.querySelector(".event-list-item__date");
        if (datumEl) {
          res.startDateTime = new Date(
            datumEl.getAttribute("datetime")
          ).toISOString();
        } 
        if (!datumEl || !res.startDateTime){
          res.errors.push({
            remarks: `geen datumEl of startDateTime ${res.pageInfo}`,
            toDebug: {res, datumEl},
          })
        }

        const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
        res.unavailable = !!eventEl.textContent.match(uaRex);
        res.soldOut = !!eventEl?.innerHTML.match(/uitverkocht|sold\s?out/i) ?? false;
        res.shortText = eventEl
          .querySelector(".event-list-item__subtitle")
          ?.textContent.trim() ?? '';

        return res;

      });
  }, {workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms})
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents: thisWorkersEvents}
  );
};

// GET PAGE INFO

nuldertienScraper.getPageInfo = async function ({ page , event}) {
  
  const {stopFunctie} =  await this.getPageInfoStart()

  const pageInfo = await page.evaluate(({event}) => {

    const res = {
      pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
      errors: [],
    };

    res.image = document.querySelector(".event-spotlight__image")?.src ?? null;
    if (!res.image){
      res.errors.push({
        remarks: `image missing ${res.pageInfo}`
      })
    }

    res.priceTextcontent = 
      document.querySelector(".practical-information tr:first-child dd")
        ?.textContent ?? '';

    res.priceContextText =
      document.querySelector(".practical-information")?.textContent ?? '';

    try {
      if (document.querySelector(
        ".timetable__times dl:first-child time"
      )) {
        res.doorOpenDateTime = new Date(
          document.querySelector(
            ".timetable__times dl:first-child time"
          )?.getAttribute("datetime")
        ).toISOString();
      }
    } catch (errorCaught) {
      res.errors.push({
        error: errorCaught,
        remarks: `deur open tijd ${res.pageInfo}`,
        errorLevel: 'notice',
        toDebug: document.querySelector(
          ".timetable__times dl:first-child time"
        )?.innerHTML ?? 'geen timetable__times first child time',
      });
    }
    
    res.soldOut = !!(document.querySelector('.order-tickets button[disabled]') ?? null)

    res.longTextHTML = 
      document.querySelector(
        ".event-detail header + div"
      )?.innerHTML ?? '';


    // #region longHTML
    const mediaSelector = '.slick-slide:not(.slick-cloned) img';
    const textSelector = '.event-detail__content > *';
    res.mediaForHTML = Array.from(document.querySelectorAll(mediaSelector))
      .map(image => {
        return {
          outer: null,
          src: image.src.replace('img.youtube', 'youtube').replace('/vi/', '/embed/').replace('maxresdefault.jpg', ''),
          id: null,
          type: 'youtube'
        }
      })

    const contentHeader = document.querySelector('.event-detail__heading-group');
    if (contentHeader){
      contentHeader.parentNode.removeChild(contentHeader)
    }

    res.textForHTML = Array.from(document.querySelectorAll(textSelector))
      .map(el => el.innerHTML)
      .join('')

    // #endregion longHTML

    return res;
  }, {event});

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page, event})

};
