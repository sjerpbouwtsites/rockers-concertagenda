import { start } from "repl";
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

  await page.waitForSelector("#filter .article-wrapper", {
    timeout: 2000,
  });

  await _t.waitFor(50);

  let rawEvents = await page.evaluate(
    () => {
      return Array.from(
        document.querySelectorAll('#filter .article-wrapper')
      ).map((rawEvent) => {

        const anchor = rawEvent.querySelector('.absolute-link') ?? null;
        const title =
          rawEvent.querySelector('.article-title')?.textContent ?? null;
        const venueEventUrl = anchor?.href ?? null;
        const image = rawEvent?.querySelector(".bg-image-img")?.src ?? null;
        const parpar = rawEvent.parentNode.parentNode;
        const startDate = parpar.hasAttribute('data-last-date') ? parpar.getAttribute('data-last-date').split('-').reverse().join('-') : null;

        return {
          venueEventUrl,
          startDate,
          title,
          image,
        };
      });
    },
    {workerIndex: workerData.index }
  );

  this.dirtyLog(rawEvents)

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
  
};
// GET PAGE INFO

cpuntScraper.getPageInfo = async function ({ page }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  await page.waitForSelector("#main .content-blocks", {
    timeout: 7500,
  });

  const pageInfo = await page.evaluate(({months}) => {

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
      unavailable: "",
      pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
      errorsVoorErrorHandler: [],      
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
      } catch (error) {
        res.errorsVoorErrorHandler.push({error, remarks: `open door date error ${day} ${monthName} ${month} ${year}`})                
      }
    } 
    if (startTijd) {
      try {
        res.startDateTime = new Date(`${year}-${month}-${day}T${startTijd}`).toISOString();          
      } catch (error) {
        res.errorsVoorErrorHandler.push({error, remarks: `startTijd date error ${day} ${monthName} ${month} ${year}`})                
      }
    } 
    

    res.priceTextcontent = 
      document.querySelector(".article-price")?.textContent.trim() ??
      "" ;

    return res;
  }, {months: this.months});

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};

// SINGLE EVENT CHECK

cpuntScraper.singleEventCheck = async function (event) {
  const firstCheckText = `${event?.title ?? ""} ${event?.shortText ?? ""}`;
  if (
    firstCheckText.includes("indie") || // TODO naar tool func hiervoor
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
