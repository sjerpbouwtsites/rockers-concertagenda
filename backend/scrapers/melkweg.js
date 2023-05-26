import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const melkwegScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 60062,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 75073,
      waitUntil: 'load'
    },
    singlePage: {
      timeout: 20074
    },
    app: {
      mainPage: {
        url: "https://www.melkweg.nl/nl/agenda",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  }
}));

melkwegScraper.listenToMasterThread();

// MAKE BASE EVENTS

melkwegScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }  

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  const rawEvents = await page.evaluate(({workerData}) => {
    return Array.from(document.querySelectorAll("[data-element='agenda'] li[class*='event-list-day__list-item']"))
      .filter((eventEl) => {
        const anker = eventEl
          .querySelector('a') ?? null;
        const genre = anker?.hasAttribute('data-genres') 
          ? anker?.getAttribute('data-genres') 
          : '';
        const isHeavy = genre === '53'; //TODO kan ook direct met selectors.
        return isHeavy;
      })
      .map((eventEl) => {
        const title = eventEl.querySelector('h3[class*="title"]')?.textContent ?? "";
        const res = {
          unavailable: "",
          pageInfo: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],          
          title,
        }
        const tags =
        eventEl
          .querySelector('[class*="styles_tags-list"]')
          ?.textContent.toLowerCase().split(` . `).join(' - ') ?? "";        
        const anchor = eventEl.querySelector("a");
        let shortTitle = 
        eventEl.querySelector('[class*="subtitle"]')?.textContent ?? "";
        shortTitle = shortTitle ? `<br>${shortTitle}` : '';
        res.shortText = `${tags} ${shortTitle}`;
        res.venueEventUrl = anchor.href;
        res.soldOut = !!(eventEl.querySelector("[class*='styles_event-compact__text']")?.textContent.toLowerCase().includes('uitverkocht') ?? null);
        return res;
      });
  }, {workerData});

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
};

melkwegScraper.singleRawEventCheck = async function(event){

  const st = event?.shortText?.toLowerCase() ?? '';
  const rr = st.includes('rock') && st.includes('roll')
  const prog = st.includes('prog');
  const alt = st.includes('alternative rock');
  const emo = st.includes('emo')
  const acid = st.includes('acid');
  if (!rr && !prog && !alt && !emo && !acid) {
    return {
      event,
      reason: 'geen zeikmuziek',
      success: true
    }
  }
  return await this.isRock(event);
}


melkwegScraper.getPageInfo = async function ({ page, event }) {
 
  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(({event}) => {
    const res = {
      unavailable: event.unavailable,
      pageInfo: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
      errors: [],
    };
    try {
      res.startDateTime = new Date(
        document
          .querySelector('[class*="styles_event-header"] time')
          ?.getAttribute("datetime") ?? null
      ).toISOString();
    } catch (caughtError) {

      res.errors.push({
        error: caughtError,
        remarks: `startdatetime faal ${res.pageInfo}`,
        toDebug: {
          text: document.querySelector('[class*="styles_event-header"] time')
            ?.outerHTML ?? 'geen time element',
          res, event
        }
      });
    }

    res.priceTextcontent = 
      document.querySelector('[class*="styles_ticket-prices"]')?.textContent ??
      '';
    res.longTextHTML = 
      document.querySelector('[class*="styles_event-info"]')?.innerHTML ?? '';
    res.image =
      document.querySelector('[class*="styles_event-header__figure"] img')
        ?.src ?? null;
    if (!res.image){
      res.errors.push({
        remarks: `image missing ${res.pageInfo}`
      })
    }
    return res;
  }, {event});

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})

};
