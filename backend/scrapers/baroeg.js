import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const baroegScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 60047,
  workerData: Object.assign({}, workerData),
  hasDecentCategorisation: true,
  puppeteerConfig: {
    mainPage: {
      timeout: 45000,
    },
    singlePage: {
      timeout: 15000
    },
    app: {
      mainPage: {
        url: "https://baroeg.nl/agenda/",
        requiredProperties: ['venueEventUrl', 'title', 'startDateTime']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'startDateTime']
      }      
    }    
  }
}));

// SINGLE RAW EVENT CHECK

baroegScraper.singleRawEventCheck = async function(event){

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
    reason: 'nothing forbidden',
    success: true,
    event
  }  

}

baroegScraper.listenToMasterThread();

// MAKE BASE EVENTS

baroegScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }    

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  let rawEvents = await page.evaluate(({workerData}) => {

    return Array
      .from(document.querySelectorAll('.wpt_listing .wp_theatre_event'))
      .map(eventEl => {
        const venueEventUrl = eventEl.querySelector('.wp_theatre_event_title a + a').href;
        const categorieTeksten = Array.from(eventEl.querySelectorAll('.wpt_production_categories li')).map(li => {
          const categorieNaam = li.textContent.toLowerCase().trim();
          return categorieNaam
        });
        return {
          eventEl,
          categorieTeksten,
          venueEventUrl
        }
      })
      .filter(eventData => eventData)
      .map(({eventEl,categorieTeksten,venueEventUrl}) => {
        let title = eventEl.querySelector('.wp_theatre_event_title')?.textContent.trim() ?? null;
        if (title.match(/uitverkocht|sold\s?out/i)) {
          title = title.replace(/uitverkocht|sold\s?out/i,'').replace(/^:\s+/,'');
        }
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title
        };
        
        res.soldOut = title.match(/uitverkocht|sold\s?out/i) ?? false;
        res.shortText = eventEl.querySelector('.wp_theatre_prod_excerpt')?.textContent.trim() ?? null;
        res.shortText += categorieTeksten;
        res.image = eventEl.querySelector('.media .attachment-thumbnail')?.src ?? '';
        if (!res.image){
          res.errors.push({
            remarks: `geen image ${res.pageInfo}`,
            toDebug: {
              srcWaarinGezocht: eventEl.querySelector('.media .attachment-thumbnail')?.src
            }
          })
        }
        res.venueEventUrl =venueEventUrl;
        
        res.startDate = eventEl.querySelector('.wp_theatre_event_startdate')?.textContent.trim().substring(3,26).split('/').reverse() ?? null;
        if (!res.startDate) {
          res.errors.push({
            remarks: `geen startdate`,
            toDebug: {
              startDateText: eventEl.querySelector('.wp_theatre_event_startdate')?.textContent,
              res
            }
          })
          res.unavailable += 'geen startdate'
          return res;
        }
        const startYear = res.startDate[0].padStart(4, '20');
        const startMonth = res.startDate[1].padStart(2, '0');
        const startDay = res.startDate[2].padStart(2, '0');
        res.startDate = `${startYear}-${startMonth}-${startDay}`;
        res.startTime = eventEl.querySelector('.wp_theatre_event_starttime')?.textContent ?? null;
        if (!res.startTime){
          res.errors.push({
            remarks: 'geen startdatetime',
            toDebug: {
              startDateText: eventEl.querySelector('.wp_theatre_event_starttime')?.textContent,
              res
            }
          })
          return res;   
        }
        try{
          res.startDateTime = new Date(`${res.startDate}T${res.startTime}:00`).toISOString();
        } catch (errorCaught) {
          res.errors.push({
            error: errorCaught,
            remarks: `date omzetting error ${res.pageInfo}`,
            toDebug: res
          })
        }
        return res;
      })
  }, {workerData})
  rawEvents = rawEvents .map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents: thisWorkersEvents}
  );
};

// GET PAGE INFO

baroegScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()

  const pageInfo = await page.evaluate(
    ({event}) => {
      const res = {
        pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
        errors: [],
      };

      res.priceTextcontent =
        document.querySelector(".wp_theatre_event_tickets")?.textContent ??
        '';

      const postContent = document.querySelector('.single-post .post-content') ?? null;
      if (postContent){
        const postHeading = postContent.querySelector('.wpt_events') ?? null;
        if (postHeading) {
          postContent.removeChild(postHeading)
        }
        const someH3 = postContent.querySelector('h3') ?? null;
        if (someH3) {
          postContent.removeChild(someH3)
        }
        res.longTextHTML = postContent.innerHTML;
      }
      
      res.soldOut = !!(document.querySelector('.wp_theatre_event_tickets_status_soldout') ?? null)

      return res;
    }, {event}
    
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page, event})
  
};

