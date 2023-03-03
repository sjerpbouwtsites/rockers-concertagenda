import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";


// SCRAPER CONFIG

const p60Scraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 60000,
    },    
    singlePage: {
      timeout: 30000
    },
    app: {
      mainPage: {
        url: "https://p60.nl/agenda",
        requiredProperties: ['venueEventUrl', 'title', 'startDateTime']
      }
    }
  }
}));

p60Scraper.listenToMasterThread();

// MAKE BASE EVENTS

p60Scraper.makeBaseEventList = async function () {

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  await _t.autoScroll(page);
  await _t.autoScroll(page);
  await _t.autoScroll(page);
  await _t.autoScroll(page);

  await _t.waitFor(50);

  const rawEvents = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".views-infinite-scroll-content-wrapper > .p60-list__item-container")).filter(itemEl => {
      return itemEl.textContent.includes('concert')
    }).map(
      (itemEl) => {

        const res = {
          unavailable: "",
          errorsVoorErrorHandler: [],          
        }
        
        //const textContent = itemEl.textContent.toLowerCase();
        res.title = itemEl.querySelector(
          ".p60-list__item__title"
        )?.textContent.trim() ?? '';
        res.venueEventUrl = itemEl.querySelector('.field-group-link')?.href;
        res.pageInfoID = `<a href='${res.venueEventUrl}'>${res.title}</a>`;
        const doorOpenDateTimeB = itemEl.querySelector('.p60-list__item__date time')?.getAttribute('datetime')
        
        try {
          res.doorOpenDateTime = new Date(doorOpenDateTimeB).toISOString();
        } catch (error) {
          res.errorsVoorErrorHandler.push({error, remarks: `openDoorDateTime omzetten ${doorOpenDateTimeB}`})
        }
        const startTime = itemEl.querySelector('.field--name-field-aanvang')?.textContent.trim();
        let startDateTimeB ;
        if (res.doorOpenDateTime){
          startDateTimeB = doorOpenDateTimeB.replace(/T\d\d:\d\d/, `T${startTime}`);
          try {
            res.startDateTime = new Date(startDateTimeB).toISOString();
          } catch (error) {
            res.errorsVoorErrorHandler.push({error, remarks: `startDateTime omzetten ${startDateTimeB}`})
          }
        }
        res.shortText = itemEl.querySelector('.p60-list__item__description')?.textContent.trim() ?? '';
        const imageMatch = Array.from(document.querySelectorAll('style')).map(styleEl => styleEl.innerHTML).join(`\n`).match(/topbanner.*background-image.*(https.*\.jpg)/)
        if (imageMatch){
          res.image = imageMatch[1]
        }
        return res;
      }
    );
  }, null);

  // this.dirtyLog(rawEvents)

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
};


// @TODO Rock control naar async

// GET PAGE INFO

p60Scraper.getPageInfo = async function ({ page }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(
    () => {

      const res = {
        unavailable: "",
        pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
        errorsVoorErrorHandler: [],
      };

      // res.ticketURL = document.querySelector('.content-section__event-info [href*="ticketmaster"]')?.href ?? null;
      res.longTextHTML = Array.from(document.querySelectorAll('.kmtContent, .group-footer .media-section')).reduce((prev, next) => prev + next.innerHTML,'')
      return res;
    }, null
  );

  // if (pageInfo.ticketURL) {
  //   try {
  //     await page.goto(pageInfo.ticketURL,{waitUntill: 'domcontentloaded'} )
  //     // await page.waitForSelector('#main-content', {timeout: 12500})
  //     await _t.waitFor(250);
  //     pageInfo.priceTextcontent = await page.evaluate(()=>{

  //       // 5pMuEpHRPhexiJelCHBWUcr4f6GcjB5G

  //       return document.querySelector('#main-content')?.textContent ?? null
  //     })
  //   } catch (error) {
  //     parentPort.postMessage(this.qwm.debugger({
  //       error, remark: `prijs ophalen dbs ticketpagina ${pageInfo.ticketURL}`
  //     }))
  //   }
  // }  

  this.dirtyLog(pageInfo)



  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};
