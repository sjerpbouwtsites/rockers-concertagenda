import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const idunaScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    singlePage: {
      timeout: 20000
    },
    mainPage: {
      waitUntil: 'load'
    },
    app: {
      mainPage: {
        url: "https://iduna.nl/",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  }
}));

idunaScraper.listenToMasterThread();

// MAKE BASE EVENTS

idunaScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    this.dirtyTalk(availableBaseEvents.length)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: availableBaseEvents}
    );    
  }    
  const {stopFunctie, page} = await this.makeBaseEventListStart()

  let metalEvents, punkEvents, doomEvents;
  try {

    doomEvents = await page
      .evaluate(({workerData}) => {
      loadposts("doom", 1, 50); // eslint-disable-line
        return new Promise((resolve) => {
          setTimeout(() => {
            const doomEvents = Array.from(
              document.querySelectorAll("#gridcontent .griditemanchor")
            ).map((event) => {
              const title = event.querySelector(".griditemtitle")?.textContent ?? null;
              return {
                unavailable: "",
                pageInfo: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
                errors: [],          
                venueEventUrl: event?.href ?? null,
                title,
              }               
            });
            resolve(doomEvents);
          }, 2500);
        });
      },{workerData})
      .then((doomEvents) => doomEvents);
    // TODO catch

    metalEvents = await page
      .evaluate(({workerData}) => {
      loadposts("metal", 1, 50); // eslint-disable-line
        return new Promise((resolve) => {
          setTimeout(() => {
            const metalEvents = Array.from(
              document.querySelectorAll("#gridcontent .griditemanchor")
            ).map((event) => {
              const title = event.querySelector(".griditemtitle")?.textContent ?? null;
              return {
                unavailable: "",
                pageInfo: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
                errors: [],          
                venueEventUrl: event?.href ?? null,
                title,
              }               
            });
            resolve(metalEvents);
          }, 2500);
        });
      },{workerData})
      .then((metalEvents) => metalEvents);
    // TODO catch

    punkEvents = await page
      .evaluate(({workerData}) => {
      // no-eslint
      // hack VAN DE SITE ZELF
      loadposts("punk", 1, 50); // eslint-disable-line

        return new Promise((resolve) => {
          setTimeout(() => {
            const punkEvents = Array.from(
              document.querySelectorAll("#gridcontent .griditemanchor")
            ).map((event) => {
              const title = event.querySelector(".griditemtitle")?.textContent.trim() ?? null;
              return {
                venueEventUrl: event?.href ?? null,
                title,
                pageInfo: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
                errors: [],
                unavailable: "",
              };
            });
            resolve(punkEvents);
          }, 2500);
        });
      },{workerData})
      .then((punkEvents) => punkEvents);
    //TODO catch
    
    let metalEventsTitles = metalEvents.map((event) => event.title);
    
    punkEvents.forEach((punkEvent) => {
      if (!metalEventsTitles.includes(punkEvent)) {
        metalEvents.push(punkEvent);
      }
    });    
    metalEventsTitles = metalEvents.map((event) => event.title);
    doomEvents.forEach((doomEvent) => {
      if (!metalEventsTitles.includes(doomEvent)) {
        metalEvents.push(doomEvent);
      }
    })
  } catch (caughtError) { // belachelijke try catch.

    // TODO WRAPPER ERRRO
    _t.handleError(caughtError, workerData, `uiterste catch om pak metalEvents punkEvents iduna main`, 'close-thread',{
      metalEvents, punkEvents
    })
    return await this.makeBaseEventListEnd({
      stopFunctie, page, rawEvents:[]}
    );    
  }
    
  const rawEvents = metalEvents.map(musicEvent =>{
    musicEvent.title = _t.killWhitespaceExcess(musicEvent.title);
    musicEvent.pageInfo = _t.killWhitespaceExcess(musicEvent.pageInfo);
    return musicEvent;
  });

  this.saveBaseEventlist(workerData.family, rawEvents)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents}
  );
  
};

// GET PAGE INFO

idunaScraper.getPageInfo = async function ({ page, event }) {

  this.dirtyTalk(event.title)
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(
    ({ months , event}) => {

      const res = {
        unavailable: event.unavailable,
        pageInfo: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };
      try {
        const startDateMatch =
          document
            .querySelector("#sideinfo .capitalize")
            ?.textContent.match(/(\d+)\s+(\w+)\s+(\d\d\d\d)/) ?? null;
        if (
          startDateMatch &&
          Array.isArray(startDateMatch) &&
          startDateMatch.length > 3
        ) {
          res.startDate = `${startDateMatch[3]}-${months[startDateMatch[2]]}-${
            startDateMatch[1]
          }`;
        }
        if (!res.startDate){
          res.errors.push({
            remarks: `geen startDate ${res.pageInfo}`,
            toDebug: {
              event,
              text:  document
                .querySelector("#sideinfo .capitalize")
                ?.textContent
            }
          })
          return res;
        }

        const doorEl = Array.from(
          document.querySelectorAll("#sideinfo h2")
        ).find((h2El) => {
          return h2El.textContent.toLowerCase().includes("deur");
        });
        if (doorEl) {
          const doormatch = doorEl.textContent.match(/\d\d:\d\d/);
          if (doormatch) {
            res.doorTime = doormatch[0];
          }
        }

        const startEl = Array.from(
          document.querySelectorAll("#sideinfo h2")
        ).find((h2El) => {
          return h2El.textContent.toLowerCase().includes("aanvang");
        });
        if (startEl) {
          const startmatch = startEl.textContent.match(/\d\d:\d\d/);
          if (startmatch) {
            res.startTime = startmatch[0];
          }
        }
        if (!res.startTime && res.doorTime){
          res.startTime = res.doorTime;
          res.doorTime = null;
        } else if (!res.startTime) {
          res.errors.push({
            remarks: `geen startTime ${res.pageInfo}`,
            toDebug: {
              event
            }
          })
          return res;
        }        



        if (res.startTime) {
          res.startDateTime = new Date(
            `${res.startDate}T${res.startTime}:00`
          ).toISOString();
        } else if (res.doorTime) {
          res.startDateTime = new Date(
            `${res.startDate}T${res.doorTime}:00`
          ).toISOString();
        }

        if (res.startTime && res.doorTime) {
          res.doorOpenDateTime = new Date(
            `${res.startDate}T${res.doorTime}:00`
          ).toISOString();
        }
      } catch (caughtError) { //TODO BELACHELJIK GROTE TRY CATCH
        res.errors.push({
          error:caughtError,
          remarks: `belacheljik grote catch iduna getPageInfo ${res.pageInfo}`,
          toDebug:{
            event
          }
        });
        return res;
      }

      const imageMatch = document
        .getElementById("photoandinfo")
        .innerHTML.match(/url\('(.*)'\)/);
      if (imageMatch && Array.isArray(imageMatch) && imageMatch.length === 2) {
        res.image = imageMatch[1];
      }
      if (!res.image){
        res.errors.push({
          remarks: `image missing ${res.pageInfo}`
        })
      }      

      res.longTextHTML =
        document.querySelector("#postcontenttext")?.innerHTML ?? '';

      res.priceTextcontent = 
        document.querySelector("#sideinfo")?.textContent.trim() ?? '';
      return res;
    },
    { months: this.months, event }
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};
