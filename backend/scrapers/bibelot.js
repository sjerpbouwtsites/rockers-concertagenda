import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const bibelotScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 30001,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 15002,
    },
    singlePage: {
      timeout: 20003
    },
    app: {
      mainPage: {
        url: "https://bibelot.net/",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }      
    }
  
  }
}));

bibelotScraper.listenToMasterThread();

// MAKE BASE EVENTS

bibelotScraper.makeBaseEventList = async function () {

  const availableBaseEvent = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvent){
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: availableBaseEvent}
    );    
  }  

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  const rawEvents = await page.evaluate(({workerData}) => {
    return Array.from(
      document.querySelectorAll(
        '.event[class*="metal"], .event[class*="punk"], .event[class*="rock"]'
      )
    ).map((eventEl) => {
      
      const title = eventEl.querySelector("h1")?.textContent.trim() ?? null;
      const res = {
        unavailable: '',
        pageInfo: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
        errors: [],
        title
      };

      const shortTextEl = eventEl.querySelector("h1")?.parentNode;
      const shortTextSplit = eventEl.contains(shortTextEl)
        ? shortTextEl.textContent.split(res.title)
        : [null, null];
      res.shortText = shortTextSplit[1];
      res.venueEventUrl = eventEl.querySelector(".link")?.href ?? null;
      res.soldOut = !!(!eventEl.querySelector('.ticket-button')?.hasAttribute('href') ?? null) // als uitverkocht is span
      return res;
    });
  }, {workerData});

  this.saveBaseEventlist(workerData.family, rawEvents)

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
  
};

// GET PAGE INFO

bibelotScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart(event)
  
  const pageInfo = await page.evaluate(
    ({ months , event}) => {
      const res = {
        unavailable: event.unavailable,
        pageInfo: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };

      let baseDateM, ttt;
      try {
        ttt = document
          .querySelector(".main-column h3")
          ?.textContent.toLowerCase();
        baseDateM = ttt.match(/(\d+)\s(\w+)\s(\d{4})/);
      } catch (errorCaught) {
        res.errors.push({
          error: errorCaught,
          remarks: `base date match ${res.pageInfo}`,
          errorLevel: 'notice',
          toDebug: {
            text: ttt
          }
        });
        return res;
      }

      if (!Array.isArray(baseDateM) || baseDateM.length < 4) {
        res.errors.push({
          remarks: `base date match faal2 ${res.pageInfo}`,
          toDebug:{
            res,
            baseDateM
          }
        });        
        return res;
      } else {
        res.baseDate = `${baseDateM[3]}-${
          months[baseDateM[2]]
        }-${baseDateM[1].padStart(2, "0")}`;
      }

      if (!res.baseDate) {
        res.errors.push({
          remarks: `base date match faal3 ${res.pageInfo}`,
          toDebug:{
            res,
            baseDateM
          }
        }); 
        return res;
      }

      res.eventMetaColomText;
      try {
        res.eventMetaColomText = 
          document
            .querySelector(".meta-colom")
            ?.textContent.toLowerCase()

        res.startTimeMatch = res.eventMetaColomText.match(
          /(aanvang\sshow|aanvang|start\sshow|show)\W?\s+(\d\d:\d\d)/
        );
        res.doorTimeMatch = res.eventMetaColomText.match(
          /(doors|deuren|zaal\sopen)\W?\s+(\d\d:\d\d)/
        );
        res.endTimeMatch = res.eventMetaColomText.match(
          /(end|eind|einde|curfew)\W?\s+(\d\d:\d\d)/
        );
      } catch (errorCaught) {
        res.errors.push({
          error: errorCaught,
          remarks: `matching van bibelotspecifieke woorden omtrent open/deur/dicht ${res.pageInfo}`,
          toDebug: res,
        })
        return res;
      }

      try {
        if (Array.isArray(res.doorTimeMatch) && res.doorTimeMatch.length > 2) {
          res.doorOpenDateTime = new Date(
            `${res.baseDate}T${res.doorTimeMatch[2]}:00`
          ).toISOString();
        }
      } catch (errorCaught) {
        res.errors.push({
          error: errorCaught,
          remarks: `doortime match met basedate ${res.pageInfo}`,
          toDebug: res
        });
      }
      try {
        if (
          Array.isArray(res.startTimeMatch) &&
          res.startTimeMatch.length > 2
        ) {
          res.startDateTime = new Date(
            `${res.baseDate}T${res.startTimeMatch[2]}:00`
          ).toISOString();
        } else if (res.doorOpenDateTime) {
          res.startDateTime = res.doorOpenDateTime;
          res.doorOpenDateTime = "";
        }
      } catch (errorCaught) {
        res.errors.push({
          error: errorCaught,
          remarks: `startTime match met basedate ${res.pageInfo}`,
          toDebug: res          
        });
      }
      try {
        if (Array.isArray(res.endTimeMatch) && res.endTimeMatch.length > 2) {
          res.endDateTime = new Date(
            `${res.baseDate}T${res.endTimeMatch[2]}:00`
          ).toISOString();
        }
      } catch (errorCaught) {
        res.errors.push({
          error: errorCaught,
          remarks: `endtime match met basedate ${res.pageInfo}`,
          toDebug: res          
        });
      }

      const verkoopElAr = Array.from(
        document.querySelectorAll(".meta-info")
      ).filter((metaInfo) => {
        return metaInfo?.textContent.toLowerCase().includes("verkoop");
      });

      if (verkoopElAr && Array.isArray(verkoopElAr) && verkoopElAr.length) {
        res.priceTextcontent = verkoopElAr[0].textContent;
      }

      res.longTextHTML = document
        .querySelector(".main-column .content")
        ?.innerHTML ?? ''
      ;
      const imageMatch = document
        .querySelector(".achtergrond-afbeelding")
        ?.style.backgroundImage.match(/https.*.png|https.*.jpg|https.*.jpeg/);
      if (imageMatch && imageMatch.length) {
        res.image = imageMatch[0];
      }

      if (!res.image){
        res.errors.push({
          remarks: `image niet gevonden ${res.pageInfo}`,
          toDebug:{
            imageStyle: document
              .querySelector(".achtergrond-afbeelding")
              ?.style
          }
        })
      }

      return res;
    },
    { months: this.months, event }
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
}
