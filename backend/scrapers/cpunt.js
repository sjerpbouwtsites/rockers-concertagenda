import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const cpuntScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    singlePage: {
      timeout: 10000,
    },
    mainPage: {
      waitUntil: 'load'
    },
    app: {
      mainPage: {
        url: "https://www.cpunt.nl/agenda?q=&genre=metalpunkheavy&StartDate=&EndDate=#filter",
        requiredProperties: ['venueEventUrl', 'title']
      }
    }
  }
}
));



cpuntScraper.listenToMasterThread();

// MAKE BASE EVENTS

cpuntScraper.makeBaseEventList = async function () {

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  if (!await page.waitForSelector("#filter .article-wrapper", {
    timeout: 2000,
  }).catch(caughtError =>{
    _t.handleError(caughtError, workerData, `Timeout wachten op #filter .article-wrapper Main page`, 'close-thread');
  })){
    return await this.makeBaseEventListEnd({
      stopFunctie, page, rawEvents: []}
    );
  }

  await _t.waitFor(50);

  let rawEvents = await page.evaluate(
    ({workerData}) => {
      return Array.from(
        document.querySelectorAll('#filter .article-wrapper')
      ).map((rawEvent) => {
        
        const title =
          rawEvent.querySelector('.article-title')?.textContent ?? null;
        const res = {
          unavailable: "",
          pageInfo: `<a href='${document.location.href}'>${workerData.family} - main - ${title}</a>`,
          errors: [],
        };

        res.title = title;
        const anchor = rawEvent.querySelector('.absolute-link') ?? null;
        res.venueEventUrl = anchor?.href ?? null;
        res.image = rawEvent?.querySelector(".bg-image-img")?.src ?? null;
        const parpar = rawEvent.parentNode.parentNode;
        res.startDate = parpar.hasAttribute('data-last-date') ? parpar.getAttribute('data-last-date').split('-').reverse().join('-') : null;
        const artInfoText = rawEvent.querySelector('.article-info')?.textContent.toLowerCase() ?? '';
        res.soldOut = artInfoText.includes('wachtlijst') || artInfoText.includes('uitverkocht');
        return res
      });
    },
    {workerData}
  );

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
  
};
// GET PAGE INFO

cpuntScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  if (!await page.waitForSelector("#main .content-blocks", {
    timeout: 7500,
  }).catch(caughtError =>{
    _t.handleError(caughtError, workerData, `Timeout wachten op #main .content-blocks ${event.title}`, 'close-thread');
  })){
    return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
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
      unavailable: event.unavailable,
      pageInfo: `<a href='${document.location.href}'>${document.title}</a>`,
      errors: [],      
    };

    const [, shortDay, monthName,year] = ticketSection.querySelector('.article-date')?.textContent.match(/(\d+)\s+(\w+)\s+(\d\d\d\d)/) ?? [null, null, null, null]
    const day = shortDay.padStart(2, '0');
    const month = months[monthName.toLowerCase()];

    res.longTextHTML = textSection.querySelector('.text')?.innerHTML ?? document.querySelector('.contentblock-TextOneColumn')?.innerHTML ?? null;

    const tijdMatches = document.querySelector('.article-times')?.textContent.match(/\d\d:\d\d/g) ?? [];

    let startTijd, deurTijd;
    if (!tijdMatches.length) {
      res.unavailable = 'geen tijden gevonden';
    } else if (tijdMatches.length == 1){
      startTijd = tijdMatches[0];
    } else {
      deurTijd = tijdMatches[0];
      startTijd = tijdMatches[1];
    }

    
    if (deurTijd){
      try {
        res.doorOpenDateTime = new Date(`${year}-${month}-${day}T${deurTijd}`).toISOString();
      } catch (caughtError) {
        res.errors.push({error: caughtError, remarks: `open door date error ${event.title} ${day} ${monthName} ${month} ${year}`})                
      }
    } 
    if (startTijd) {
      try {
        res.startDateTime = new Date(`${year}-${month}-${day}T${startTijd}`).toISOString();          
      } catch (caughtError) {
        res.errors.push({error: caughtError, remarks: `startTijd date error ${event.title} ${day} ${monthName} ${month} ${year}`})                
      }
    } 

    res.priceTextcontent = 
      document.querySelector(".article-price")?.textContent.trim() ??
      "" ;

    return res;
  }, {months: this.months, event});

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};

// SINGLE EVENT CHECK

cpuntScraper.singleEventCheck = async function (event) {
  const firstCheckText = `${event?.title ?? ""} ${event?.shortText ?? ""}`;
  if (
    firstCheckText.includes("indie") || 
    firstCheckText.includes("dromerig") ||
    firstCheckText.includes("shoegaze") ||
    firstCheckText.includes("alternatieve rock")
  ) {
    return {
      event,
      success: false,
      reason: "verboden genres gevonden in title+shortText",
    };
  }

  return {
    event,
    success: true,
    reason: "verboden genres niet gevonden.",
  };
};
