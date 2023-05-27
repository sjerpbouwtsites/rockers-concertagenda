import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const afasliveScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 40000,
  workerData: Object.assign({}, workerData),
  hasDecentCategorisation: false,
  puppeteerConfig: {
    mainPage: {
      timeout: 60043,
    },
    singlePage: {
      timeout: 20000
    },
    app: {
      mainPage: {
        url: "https://www.afaslive.nl/agenda",
        requiredProperties: ['venueEventUrl']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'startDateTime']
      }      
    }
  }
}));

// RAW EVENT ASYNC CHECK

afasliveScraper.singleRawEventCheck = async function(event){

  const workingTitle = this.cleanupEventTitle(event.title)

  const isRefused = await this.rockRefuseListCheck(event, workingTitle)
  if (isRefused.success) return {
    reason: isRefused.reason,
    event,
    success: false
  };

  const isAllowed = await this.rockAllowListCheck(event, workingTitle)
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTerms = await this.hasForbiddenTerms(event, ['title']);
  if (hasForbiddenTerms.success) {
    await this.saveRefusedTitle(workingTitle)
    return {
      reason: hasForbiddenTerms.reason,
      success: false,
      event
    }
  }

  const isRockRes = await this.isRock(event);
  if (isRockRes.success){
    await this.saveAllowedTitle(workingTitle)
  } else {
    await this.saveRefusedTitle(workingTitle)
  }
  return isRockRes;

  // return {
  //   reason: [isRefused.reason, isAllowed.reason, hasForbiddenTerms.reason].join(';'),
  //   event,
  //   success: true
  // }
}

afasliveScraper.listenToMasterThread();

// MAKE BASE EVENTS

afasliveScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index);
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }  
  
  const {stopFunctie, page} = await this.makeBaseEventListStart()

  await _t.autoScroll(page);
  await _t.waitFor(750);
  
  await _t.autoScroll(page);
  await _t.waitFor(750);

  await _t.autoScroll(page);
  await _t.waitFor(750);

  await _t.autoScroll(page);
  await _t.waitFor(750);

  await _t.autoScroll(page);
  await _t.waitFor(750);
  
  await _t.autoScroll(page); // TODO hier wat aan doen. maak er een do while van met een timeout. dit is waardeloos.

  const rawEvents = await page.evaluate(({workerData}) => {
    return Array.from(document.querySelectorAll(".agenda__item__block "))
      .map((agendaBlock) => {
        const title = agendaBlock.querySelector(".eventTitle")?.textContent ?? "";
        const res = {
          unavailable: "",
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],          
          title
        }
        res.venueEventUrl = agendaBlock.querySelector("a")?.href ?? null;
        res.image = agendaBlock.querySelector("img")?.src ?? null;
        return res;
      })
      .filter(event => {
        return !event.title.toLowerCase().includes('productiedag')
      });
  }, {workerData});

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index);
  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents: thisWorkersEvents}
  );
};

afasliveScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(
    ({ months,event }) => {

      const res = {
        unavailable: event.unavailable,
        pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
        errors: [],
      };

      const startDateMatch =
        document
          .querySelector(".eventTitle")
          ?.parentNode.querySelector("time")
          ?.textContent.match(/(\d+)\s+(\w+)\s+(\d\d\d\d)/) ?? null;
      if (
        startDateMatch &&
        Array.isArray(startDateMatch) &&
        startDateMatch.length > 3
      ) {
        res.startDate = `${startDateMatch[3]}-${months[startDateMatch[2]]}-${
          startDateMatch[1]
        }`;
      } else {
        res.errors.push({
          remarks: `geen startdate`,
          toDebug: {
            startDateText: document
              .querySelector(".eventTitle")
              ?.parentNode.querySelector("time")
              ?.textContent
          }
        })        
        return res;
      }

      const startEl = document.querySelector(
        ".eventInfo .tickets ~ p.align-mid ~ p.align-mid"
      );
      if (startEl) {
        const startmatch = startEl.textContent.match(/\d\d:\d\d/);
        if (startmatch && Array.isArray(startmatch) && startmatch.length) {
          res.startTime = startmatch[0];
        } else {
          res.errors.push({
            remarks: `Geen start tijd`,
            toDebug: {
              startDateText: startEl.textContent
            }
          })  
          return res;          
        }
      }

      const doorEl = document.querySelector(
        ".eventInfo .tickets ~ p.align-mid"
      );
      if (doorEl) {
        const doormatch = doorEl.textContent.match(/\d\d:\d\d/);
        if (doormatch && Array.isArray(doormatch) && doormatch.length) {
          res.doorTime = doormatch[0];
        }
      }

      try {
        if (res.startTime) {
          res.startDateTime = new Date(
            `${res.startDate}T${res.startTime}:00`
          ).toISOString();
        }

        if (res.doorTime) {
          res.doorOpenDateTime = new Date(
            `${res.startDate}T${res.doorTime}:00`
          ).toISOString();
        }
      } catch (errorCaught) {
        res.errors.push({
          error: errorCaught,
          remarks: `merge time date ${res.pageInfo}`,
          toDebug: res
        });
        res.unavailable += 'geen starttijd wegens fout';
        return res;
      }

      res.soldOut = !!(document.querySelector('#tickets .soldout') ?? null)

      res.longTextHTML = 
        document.querySelector("article .wysiwyg")?.innerHTML ?? '';

      res.priceTextcontent = 
        document.querySelector("#tickets")?.textContent.trim() ?? '';
      return res;
    },
    { months: this.months,event }
  );
  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
};
