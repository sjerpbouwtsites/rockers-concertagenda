import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const bibelotScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 30001,
  workerData: Object.assign({}, workerData),
  hasDecentCategorisation: true,
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
        requiredProperties: ['venueEventUrl', 'title', 'startDateTime']
      }      
    }
  
  }
}));

bibelotScraper.listenToMasterThread();

bibelotScraper.singleRawEventCheck = async function(event){
  const hasForbiddenTermsRes = await bibelotScraper.hasForbiddenTerms(event);
  return {
    event,
    reason: hasForbiddenTermsRes.reason,
    success: !hasForbiddenTermsRes.success,
  }
  
}

// MAKE BASE EVENTS

bibelotScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }   

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  let rawEvents = await page.evaluate(({workerData}) => {
    return Array.from(
      document.querySelectorAll(
        '.event[class*="metal"], .event[class*="punk"], .event[class*="rock"]'
      )
    ).map((eventEl) => {
      
      const title = eventEl.querySelector("h1")?.textContent.trim() ?? null;
      const res = {
        pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
        errors: [],
        title
      };

      const shortTextEl = eventEl.querySelector("h1")?.parentNode;
      const shortTextSplit = eventEl.contains(shortTextEl)
        ? shortTextEl.textContent.split(res.title)
        : [null, null];
      res.shortText = shortTextSplit[1];
      res.venueEventUrl = eventEl.querySelector(".link")?.href ?? null;
      res.soldOut = !!eventEl.querySelector('.ticket-button')?.textContent.match(/uitverkocht|sold\s?out/i) ?? null;
      return res;
    });
  }, {workerData})
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents: thisWorkersEvents}
  );
  
};

// GET PAGE INFO

bibelotScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart(event)
  
  const pageInfo = await page.evaluate(
    ({ months , event}) => {
      const res = {
        pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
        errors: [],
      };

      const baseDateM = document
        .querySelector(".main-column h3")
        ?.textContent.match(/(\d+)\s(\w+)\s(\d{4})/) ?? null;

      res.baseDate = null;
      if (!Array.isArray(baseDateM) || baseDateM.length < 4) {
        return res;
      } else {
        res.baseDate = `${baseDateM[3]}-${
          months[baseDateM[2]]
        }-${baseDateM[1].padStart(2, "0")}`;
      }

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
     

      try {
        if (Array.isArray(res.doorTimeMatch) && res.doorTimeMatch.length > 2 && res.baseDate) {
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
          res.startTimeMatch.length > 2 &&
          res.baseDate
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
        if (Array.isArray(res.endTimeMatch) && res.endTimeMatch.length > 2 && res.baseDate) {
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

      res.longTextHTML = Array
        .from(document.querySelectorAll(".main-column > * ~ .content"))
        .map(a=>a.innerHTML)
        .join('') ?? ''
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

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page, event})
  
}
