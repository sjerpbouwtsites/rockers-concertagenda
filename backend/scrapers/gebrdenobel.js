import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const gebrdenobelScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 15000,
    },
    singlePage: {
      timeout: 20000
    },
    app: {
      mainPage: {
        url: "https://gebrdenobel.nl/programma/",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  }
}));

gebrdenobelScraper.listenToMasterThread();

// MAKE BASE EVENTS

gebrdenobelScraper.singleMergedEventCheck = async function(event){

  const workingTitle = this.cleanupEventTitle(event.title)

  const isRefused = await this.rockRefuseListCheck(event, workingTitle)
  if (isRefused.success) return {
    reason: isRefused.reason,
    event,
    success: false
  };

  const isAllowed = await this.rockAllowListCheck(event, workingTitle)
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  if (hasForbiddenTerms.success) {
    await this.saveRefusedTitle(workingTitle)
    return {
      reason: hasForbiddenTerms.reason,
      success: false,
      event
    }
  }

  return {
    event,
    success: true,
    reason: "nothing found currently",
  };
  
}

// MERGED ASYNC CHECK

gebrdenobelScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }    

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  let punkMetalRawEvents = await page.evaluate(({workerData, unavailabiltyTerms}) => {
    return Array.from(document.querySelectorAll(".event-item"))
      .filter((eventEl) => {
        const tags =
          eventEl.querySelector(".meta-tag")?.textContent.toLowerCase() ?? "";
        return (
          tags.includes("metal") ||
          tags.includes("punk")
        );
      }).map((eventEl) =>{
        const title = eventEl.querySelector(".media-heading")?.textContent ?? null;
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title
        };
        res.venueEventUrl =
            eventEl
              .querySelector(".jq-modal-trigger")
              ?.getAttribute("data-url") ?? "";
        const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
        res.unavailable = !!eventEl.textContent.match(uaRex);      
        res.soldOut = !!eventEl.querySelector('.meta-info')?.textContent.match(/uitverkocht|sold\s?out/i) ?? null;
        return res;
      })
  }, {workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms})

  punkMetalRawEvents = punkMetalRawEvents.map(this.isMusicEventCorruptedMapper);
  

  let rockRawEvents = await page.evaluate(({workerData}) => {
    return Array.from(document.querySelectorAll(".event-item"))
      .filter((eventEl) => {
        const tags =
          eventEl.querySelector(".meta-tag")?.textContent.toLowerCase() ?? "";
        return (
          tags.includes("rock")
        );
      }).map((eventEl) => {
        const title = eventEl.querySelector(".media-heading")?.textContent ?? null;
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title
        };
        res.venueEventUrl =
            eventEl
              .querySelector(".jq-modal-trigger")
              ?.getAttribute("data-url") ?? "";
      
        res.soldOut = !!(eventEl.querySelector('.meta-info')?.textContent.toLowerCase().includes('uitverkocht') ?? null)
        return res;
      })
  }, {workerData})

  rockRawEvents = rockRawEvents.map(this.isMusicEventCorruptedMapper);

  const checkedRockEvents = [];
  while (rockRawEvents.length){
    const thisRockRawEvent = rockRawEvents.shift();
    const isRockRes = await this.isRock(thisRockRawEvent);
    if (isRockRes.success){
      checkedRockEvents.push(thisRockRawEvent)
    }
  }

  const rawEvents = punkMetalRawEvents.concat(checkedRockEvents)

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
};

// GET PAGE INFO

gebrdenobelScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
 
  const pageInfo = await page.evaluate(
    ({ months, event }) => {
      const res = {
        pageInfo: `<a class='page-info' href='${location.href}'>${document.title}</a>`,
        errors: [],
      };
      const eventDataRows = Array.from(
        document.querySelectorAll(".event-table tr")
      );
      const dateRow = eventDataRows.find((row) =>
        row.textContent.toLowerCase().includes("datum")
      );
      const timeRow = eventDataRows.find(
        (row) =>
          row.textContent.toLowerCase().includes("open") ||
          row.textContent.toLowerCase().includes("aanvang")
      );
      const priceRow = eventDataRows.find((row) =>
        row.textContent.toLowerCase().includes("prijs")
      );
      if (dateRow) {
        const startDateMatch = dateRow.textContent.match(
          /(\d+)\s?(\w+)\s?(\d{4})/
        );
        if (Array.isArray(startDateMatch) && startDateMatch.length === 4) {
          const day = startDateMatch[1].padStart(2, "0");
          const month = months[startDateMatch[2]];
          const year = startDateMatch[3];
          res.month = startDateMatch[2];
          res.startDate = `${year}-${month}-${day}`;
        }

        if (!timeRow) {
          res.startDateTime = new Date(
            `${res.startDate}T00:00:00`
          ).toISOString();
        } else {
          const timeMatch = timeRow.textContent.match(/\d\d:\d\d/);
          if (Array.isArray(timeMatch) && timeMatch.length) {
            res.startDateTime = new Date(
              `${res.startDate}T${timeMatch[0]}:00`
            ).toISOString();
          } else {
            res.startDateTime = new Date(
              `${res.startDate}T00:00:00`
            ).toISOString();
          }
        }
      }

      if (priceRow) {
        res.priceTextcontent = priceRow.textContent;
      }
      res.shortText = 
        document.querySelector(".hero-cta_left__text p")?.textContent ?? '';
      res.longTextHTML = 
        document.querySelector(".content .contentBlocks")?.innerHTML ?? '';
      res.image = document.querySelector(".hero img")?.src ?? null;
      if (!res.image){
        res.errors.push({
          remarks: `image missing ${res.pageInfo}`
        })
      }      

      return res;
    },
    { months: this.months, event}
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};
