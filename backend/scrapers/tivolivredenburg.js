import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const tivoliVredenburgScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      waitUntil: "load"
    },
    app: {
      mainPage: {
        url: "https://www.tivolivredenburg.nl/agenda/?event_category=metal-punk-heavy",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }    
  }
}));

tivoliVredenburgScraper.listenToMasterThread();

// MAKE BASE EVENTS

tivoliVredenburgScraper.makeBaseEventList = async function () {
  
  const availableBaseEvent = await this.checkBaseEventAvailable(workerData.name);
  if (availableBaseEvent){
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: availableBaseEvent}
    );    
  }

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  const rawEvents = await page.evaluate(({workerData}) => {
    return Array.from(document.querySelectorAll(".agenda-list-item"))
      .filter((eventEl,index) => index % workerData.workerCount === workerData.index)
      .map((eventEl) => {
        const title =
          eventEl
            .querySelector(".agenda-list-item__title")
            ?.textContent.trim() ?? null;
        const res = {
          unavailable: '',
          pageInfo: `<a href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title
        };
        res.shortText =
          eventEl
            .querySelector(".agenda-list-item__text")
            ?.textContent.trim() ?? '';
        res.image =
          eventEl
            .querySelector(".agenda-list-item__figure img")
            ?.src.replace(/-\d\d\dx\d\d\d.jpg/, ".jpg") ?? null;
        if (!res.image){
          res.errors.push({
            remarks: `image missing ${res.pageInfo}`
          })
        }      
        res.venueEventUrl = eventEl.querySelector(
          ".agenda-list-item__title-link"
        ).href;
        res.soldOut = !!(eventEl.querySelector(".agenda-list-item__label")?.textContent.toLowerCase().includes('uitverkocht') ?? null)
        return res;
      });
  }, {workerData});

  this.saveBaseEventlist(workerData.family, rawEvents)

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );

};

// GET PAGE INFO

tivoliVredenburgScraper.getPageInfo = async function ({ page, event }) {
 
  const {stopFunctie} =  await this.getPageInfoStart()

  const pageInfo = await page.evaluate(({event}) => {
    const res = {
      unavailable: event.unavailable,
      pageInfo: `<a href='${event.venueEventUrl}'>${event.title}</a>`,
      errors: [],
    };
    res.priceTextcontent =
      document.querySelector(".btn-group__price")?.textContent.trim() ?? '';
    res.priceContexttext =
      document.querySelector(".event-cta")?.textContent.trim() ?? '';
    res.longTextHTML = 
      document.querySelector(".event__text")?.innerHTML ?? '';

    const startDateMatch = document.location.href.match(/\d\d-\d\d-\d\d\d\d/); //
    res.startDate = "";
    if (startDateMatch && startDateMatch.length) {
      res.startDate = startDateMatch[0].split("-").reverse().join("-");
    }

    if (!res.startDate || res.startDate.length < 7) {
      res.errors.push({
        remarks: `startdate mis ${res.pageInfo}`,
        toDebug: {
          text: `niet goed genoeg<br>${startDateMatch.join("; ")}<br>${res.startDate}`,
          res,event
        }
      });
      return res;
    }
    const eventInfoDtDDText = document
      .querySelector(".event__info .description-list")
      ?.textContent.replace(/[\n\r\s]/g, "")
      .toLowerCase();
    res.startTime = null;
    res.openDoorTime = null;
    res.endTime = null;
    const openMatch = eventInfoDtDDText.match(/open.*(\d\d:\d\d)/);
    const startMatch = eventInfoDtDDText.match(/aanvang.*(\d\d:\d\d)/);
    const endMatch = eventInfoDtDDText.match(/einde.*(\d\d:\d\d)/);

    if (Array.isArray(openMatch) && openMatch.length > 1) {
      try {
        res.openDoorTime = openMatch[1];
        res.doorOpenDateTime = res.startDate
          ? new Date(`${res.startDate}T${res.openDoorTime}:00`).toISOString()
          : null;
      } catch (caughtError) {
        res.errors.push({
          error: caughtError,
          remarks: `Open door ${res.pageInfo}`,
          toDebug:{
            text: eventInfoDtDDText,
            res,event
          }
        });
      }
    }
    if (Array.isArray(startMatch) && startMatch.length > 1) {
      try {
        res.startTime = startMatch[1];
        res.startDateTime = res.startDate
          ? new Date(`${res.startDate}T${res.startTime}:00`).toISOString()
          : null;
      } catch (caughtError) {
        res.errors.push({
          error: caughtError,
          remarks: `startTijd door ${res.pageInfo}`,
          toDebug: {
            matches:`${startMatch.join("")}`,
            res,event
          }
        });
        return res;
      }
    }
    if (Array.isArray(endMatch) && endMatch.length > 1) {
      try {
        res.endTime = endMatch[1];
        res.endDateTime = res.startDate
          ? new Date(`${res.startDate}T${res.endTime}:00`).toISOString()
          : null;
      } catch (caughtError) {
        res.errors.push({
          error: caughtError,
          remarks: `endtijd ${res.pageInfo}`,
          toDebug: {
            text: eventInfoDtDDText,
            res,event
          }
        });
      }
    }

    return res;
  }, {event});

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})

};
