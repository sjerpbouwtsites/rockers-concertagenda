import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const cpuntScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),

  puppeteerConfig: {
    mainPage: {
      timeout: 20014,
      waitUntil: 'load'
    },
    singlePage: {
      timeout: 20012
    },
    app: {
      mainPage: {
        url: "https://www.cpunt.nl/agenda?q=&genre=metalpunkheavy&StartDate=&EndDate=#filter",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  }
}
));

// SINGLE EVENT CHECK

cpuntScraper.singleRawEventCheck = async function (event) {

  const goodTermsRes = await this.hasGoodTerms(event) 
  if (goodTermsRes.success) return goodTermsRes;

  const forbiddenTermsRes = await this.hasForbiddenTerms(event);

  if (forbiddenTermsRes.success) return {
    event,
    success: false,
    reason: forbiddenTermsRes.reason
  };
  return {
    event,
    success: true,
    reason: `check inconclusive <a href='${event.venueEventUrl}'>${event.title}</a>`
  }

};


cpuntScraper.listenToMasterThread();

// MAKE BASE EVENTS

cpuntScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }   

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  if (!await page.waitForSelector("#filter .article-wrapper", {
    timeout: 2000,
  }).catch(caughtError =>{
    _t.handleError(caughtError, workerData, `Timeout wachten op #filter .article-wrapper Main page`, 'close-thread', null);
  })){
    return await this.makeBaseEventListEnd({
      stopFunctie, page, rawEvents: []}
    );
  }

  await _t.waitFor(50);

  let rawEvents = await page.evaluate(
    ({workerData,unavailabiltyTerms}) => {
      return Array.from(
        document.querySelectorAll('#filter .article-wrapper')
      ).map((rawEvent) => {
        
        const title =
          rawEvent.querySelector('.article-title')?.textContent ?? null;
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} - main - ${title}</a>`,
          errors: [],
        };

        res.title = title;
        const anchor = rawEvent.querySelector('.absolute-link') ?? null;
        res.venueEventUrl = anchor?.href ?? null;
        res.image = rawEvent?.querySelector(".bg-image-img")?.src ?? null;
        if (!res.image){
          res.errors.push({
            remarks: `image missing ${res.pageInfo}`
          })
        }        
        const parpar = rawEvent.parentNode.parentNode;
        res.startDate = parpar.hasAttribute('data-last-date') ? parpar.getAttribute('data-last-date').split('-').reverse().join('-') : null;
        const artInfoText = rawEvent.querySelector('.article-info')?.textContent.toLowerCase() ?? '';
        const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
        res.unavailable = !!rawEvent.textContent.match(uaRex);        
        res.soldOut = !!artInfoText.match(/wachtlijst|uitverkocht/i);
        res.shortText = '';
        return res
      });
    },
    {workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms}
  )
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

 
  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
  
};
// GET PAGE INFO

cpuntScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  if (!await page.waitForSelector("#main .content-blocks", {
    timeout: 7500,
  }).catch(caughtError =>{
    _t.handleError(caughtError, workerData, `Timeout wachten op #main .content-blocks ${event.title}`, 'close-thread', event);
  })){
    return await this.getPageInfoEnd({pageInfo, stopFunctie, page, event})
  }

  const pageInfo = await page.evaluate(({months, event}) => {

    const contentSections = Array.from(document.querySelectorAll('.content-blocks section'));
    let indexOfTicketSection = 0;
    contentSections.forEach((section, sectionIndex) => {
      if (section.className.includes('Tickets')){
        indexOfTicketSection = sectionIndex;
      }
    })
    const textSection = contentSections[indexOfTicketSection - 1];
    const ticketSection = contentSections[indexOfTicketSection];

    const res = {
      pageInfo: `<a class='page-info' href='${location.href}'>${document.title}</a>`,
      errors: [],      
    };

    const [, shortDay, monthName,year] = ticketSection.querySelector('.article-date')?.textContent.match(/(\d+)\s+(\w+)\s+(\d\d\d\d)/) ?? [null, null, null, null]
    const day = shortDay.padStart(2, '0');
    const month = months[monthName.toLowerCase()];
    const startDate = `${year}-${month}-${day}`;

    res.longTextHTML = (document.querySelector('.contentblock-TextOneColumn')?.innerHTML ?? '') + 
    (document.querySelector('.contentblock-Video')?.innerHTML ?? '');

    let deurTijd, startTijd
    const tijdMatches = document.querySelector('.article-bottom .article-times')?.innerHTML.match(/(\d\d[:.]\d\d)/).map(strings => strings.replace('.', ':')) ?? null;

    res.tijdMatches = tijdMatches;
    if (Array.isArray(tijdMatches) && tijdMatches.length) {
      if (tijdMatches.length >= 2) {
        startTijd = tijdMatches[1]+':00'
        deurTijd = tijdMatches[0]+':00'
      } else {
        startTijd = tijdMatches[0]+':00'
      }
    }else {
      res.errors.push({
        remarks: `geen startTijdMatch res.`,
        toDebug: {
          html: document.querySelector('.article-bottom .article-times')?.innerHTML,
          match: tijdMatches
        }
      })
    }

    if (deurTijd) {
      try {
        res.doorOpenDateTime = new Date(`${startDate}T${deurTijd}`).toISOString();          
      } catch (caughtError) {
        res.errors.push(
          {
            error: caughtError, 
            remarks: `deurtijd door date error ${event.title} ${startDate}`, 
            toDebug: 
          {timeTried: `${startDate}T${deurTijd}`, 
            event}
          })                
      }            
    } 
    
    if (startTijd) {
      try {
        res.startDateTime = new Date(`${startDate}T${startTijd}`).toISOString();          
      } catch (caughtError) {
        res.errors.push(
          {
            error: caughtError, 
            remarks: `starttijd door date error ${event.title} ${startDate}`, 
            toDebug: 
          {timeTried: `${startDate}T${startTijd}`, 
            event}
          })                
      }            
    } 

    res.priceTextcontent = 
      document.querySelector(".article-price")?.textContent.trim() ??
      "" ;

    return res;
  }, {months: this.months, event});

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page, event})
  
};

