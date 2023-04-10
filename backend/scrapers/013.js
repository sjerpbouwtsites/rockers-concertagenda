
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const nuldertienScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    app: {
      mainPage: {
        url: "https://www.013.nl/programma/heavy",
        requiredProperties: ['venueEventUrl', 'title']
      }
    }
  }
}));

nuldertienScraper.listenToMasterThread();

// MAKE BASE EVENTS

nuldertienScraper.makeBaseEventList = async function () {
  
  const {stopFunctie, page} =  await this.makeBaseEventListStart()

  const rawEvents = await page.evaluate(({workerData}) => {
    return Array.from(document.querySelectorAll(".event-list-item"))
      .filter((eventEl, index) => index % workerData.workerCount === workerData.index)
      .map((eventEl) => {
      
        const title = eventEl
          .querySelector(".event-list-item__title")
          ?.textContent.trim() ?? null;

        const res = {
          unavailable: "",
          pageInfo: `<a href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
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
          res.unavailable = "geen datum gevonden";
          return res;
        }
        
        res.shortText = eventEl
          .querySelector(".event-list-item__subtitle")
          ?.textContent.trim() ?? '';

        return res;

      });
  }, {workerData});

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
};

// GET PAGE INFO

nuldertienScraper.getPageInfo = async function ({ page , event}) {
  
  const {stopFunctie} =  await this.getPageInfoStart()

  const pageInfo = await page.evaluate(({event}) => {

    const res = {
      unavailable: event.unavailable,
      pageInfo: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
      errors: [],
    };

    res.image = document.querySelector(".event-spotlight__image")?.src ?? null;

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
      });
    }
    res.soldOut = !!(document.querySelector('.order-tickets button[disabled]') ?? null)

    res.longTextHTML = 
      document.querySelector(
        ".event-detail header + div"
      )?.innerHTML ?? '';

    
    return res;
  }, {event});

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})

};
