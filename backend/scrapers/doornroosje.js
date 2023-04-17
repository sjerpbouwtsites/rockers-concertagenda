import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const doornroosjeScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 35000,
      waitUntil: 'load'
    },
    singlePage: {
      timeout: 25000
    },
    app: {
      mainPage: {
        url: "https://www.doornroosje.nl/?genre=metal%252Cpunk%252Cpost-hardcore%252Cnoise-rock%252Csludge-rock",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  }
}));

doornroosjeScraper.listenToMasterThread();

// MAKE BASE EVENTS

doornroosjeScraper.makeBaseEventList = async function () {

  const availableBaseEvent = await this.checkBaseEventAvailable(workerData.name);
  if (availableBaseEvent){
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: availableBaseEvent}
    );    
  }  
  
  const {stopFunctie, page} = await this.makeBaseEventListStart()

  await page.waitForSelector(".c-program__title");
  await _t.waitFor(50);

  const rawEvents = await page.evaluate(({workerData}) => {
    return Array.from(document.querySelectorAll(".c-program__item"))
      .filter((eventEl, index) => index % workerData.workerCount === workerData.index)
      .map((eventEl) => {
        const title =
          eventEl.querySelector(".c-program__title")?.textContent.trim() ??
          eventEl.querySelector("h1,h2,h3")?.textContent.trim() ?? null;
        const res = {
          unavailable: "",
          pageInfo: `<a href='${document.location.href}'>${workerData.family} - main - ${title}</a>`,
          errors: [],
          title
        };
        res.shortText = 
          eventEl
            .querySelector(".c-program__content")
            ?.textContent.trim()
            .replace(res.title, "") ?? '';
        res.venueEventUrl = eventEl?.href;
        res.soldOut = eventEl.querySelector('.c-program__info-container')?.textContent.toLowerCase().includes('uitverkocht') ?? null;
        return res;
      });
  }, {workerData});

  this.saveBaseEventlist(workerData.family, rawEvents)

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );

};

// GET PAGE INFO

doornroosjeScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()

  let pageInfo;
  if (!event.venueEventUrl.includes('soulcrusher')){
    pageInfo = await page.evaluate(({months, event}) => {
      const res = {
        unavailable: event.unavailable,
        pageInfo: `<a href='${event.venueEventUrl}'>${event.title}</a>`,
        errors: [],
      };
      res.image =
        document.querySelector(".c-header-event__image img")?.src ?? null;
      if (!res.image){
        res.errors.push({
          remarks: `image missing ${res.pageInfo}`
        })
      }
      res.priceTextcontent = 
        document.querySelector(".c-btn__price")?.textContent.trim() ?? '';
      res.longTextHTML = 
        document.querySelector(".s-event__container")?.innerHTML ?? '';
  
      const embeds = document.querySelectorAll(".c-embed");
      res.longTextHTML =
        embeds?.length ?? false
          ? res.longTextHTML + embeds.innerHTML
          : res.longTextHTML;
  
      const startDateRauwMatch = document
        .querySelector(".c-event-data")
        ?.innerHTML.match(
          /(\d{1,2})\s*(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s*(\d{4})/
        ); // welke mongool schrijft zo'n regex
      let startDate;
      if (startDateRauwMatch && startDateRauwMatch.length) {
        const day = startDateRauwMatch[1];
        const month = months[startDateRauwMatch[2]];
        const year = startDateRauwMatch[3];
        startDate = `${year}-${month}-${day}`;
      } else {
        res.errors.push({
          remarks: `Geen startdate ${res.pageInfo}`,
          toDebug: {
            text: document
              .querySelector(".c-event-data")
              ?.innerHTML
          }
        })
        return res;
      }
  
      if (startDate) {
        const timeMatches = document
          .querySelector(".c-event-data")
          .innerHTML.match(/\d\d:\d\d/g);
  
        if (timeMatches && timeMatches.length) {
          try {
            if (timeMatches.length == 2) {
              res.startDateTime = new Date(
                `${startDate}:${timeMatches[1]}`
              ).toISOString();
              res.doorOpenDateTime = new Date(
                `${startDate}:${timeMatches[0]}`
              ).toISOString();
            } else if (timeMatches.length == 1) {
              res.startDateTime = new Date(
                `${startDate}:${timeMatches[0]}`
              ).toISOString();
            }
          } catch (caughtError) {
            res.errors.push({
              error: caughtError,
              remarks:
                `fout bij tijd of datums. matches: ${timeMatches} datum: ${startDate} ${res.pageInfo}`,
              toDebug:res
            });
          }
        } 
      }
    
      return res;
    }, {months: this.months, event});
  } else { // geen festival
    pageInfo = await page.evaluate(({months, event}) => {
      const res = {
        unavailable: event.unavailable,
        pageInfo: `<a href='${event.venueEventUrl}'>${event.title}</a>`,
        errors: [],
      };
      res.image =
        document.querySelector(".c-festival-header__logo img")?.src ?? null;
      if (!res.image){
        res.errors.push({
          remarks: `image missing ${res.pageInfo}`
        })
      }

      res.priceTextcontent = 
        document.querySelector(".b-festival-content__container")?.textContent.trim() ?? '';
      res.longTextHTML = 
        document.querySelector("#ticket-info")?.innerHTML ?? '';
  
      const embeds = document.querySelectorAll(".c-embed");
      res.longTextHTML =
        embeds?.length ?? false
          ? res.longTextHTML + embeds.innerHTML
          : res.longTextHTML;
  
      res.shortText = 'Met oa: '+Array.from(document.querySelectorAll('.b-festival-line-up__title')).map(title => title.textContent).join(', ')

      return res;
    }, {months: this.months, event});
  }
  

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})

};
