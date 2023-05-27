import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const metropoolScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 120000,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 60000,
      waitUntil: "load",
    },
    singlePage: {
      timeout: 45000
    },
    app: {
      mainPage: {
        url: "https://metropool.nl/agenda",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  }
}));

metropoolScraper.listenToMasterThread();

// SINGLE RAW EVENT CHECK

metropoolScraper.singleRawEventCheck = async function(event){

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

  const hasGoodTermsRes = await this.hasGoodTerms(event);
  if (hasGoodTermsRes.success) {
    await this.saveAllowedTitle(workingTitle)
    return hasGoodTermsRes;
  }

  const isRockRes = await this.isRock(event, [workingTitle]);
  if (isRockRes.success){
    await this.saveAllowedTitle(workingTitle)
  } else {
    await this.saveRefusedTitle(workingTitle)
  }
  return isRockRes;
}

// MAKE BASE EVENTS

metropoolScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }  

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  await _t.autoScroll(page);
  await _t.autoScroll(page);
  await _t.autoScroll(page);

  const rawEvents = await page.evaluate(({workerData}) => {
    return Array.from(document.querySelectorAll(".card--event"))
      .map((rawEvent) => {
        const title = rawEvent.querySelector(".card__title")?.textContent ?? null;
        const res = {
          unavailable: "",
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],        
          title,  
        }          
        res.venueEventUrl = rawEvent?.href ?? null;
        const genres = rawEvent.dataset?.genres ?? '';
        const st = rawEvent.querySelector(".card__title card__title--sub")?.textContent;
        res.shortText = (st + ' ' + genres).trim();
        res.soldOut = !!rawEvent.querySelector(".card__title--label")?.textContent.match(/uitverkocht|sold\s?out/i) ?? null;
        return res;
      });
  }, {workerData})
    .map(this.isMusicEventCorruptedMapper);
  
  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
};

// GET PAGE INFO

metropoolScraper.getPageInfo = async function ({ page, event}) {

  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(({months, event}) => {
    const res = {
      unavailable: event.unavailable,
      pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
      errors: [],
    };

    res.priceTextcontent = 
      document.querySelector(".doorPrice")?.textContent.trim() ?? '';

    res.longTextHTML = 
      Array.from(document.querySelectorAll(".event-title-wrap ~ div"))
        .map((divEl) => {
          return divEl.outerHTML;
        })
        .join("") ?? '';

    const startDateRauwMatch = document
      .querySelector(".event-title-wrap")
      ?.innerHTML.match(
        /(\d{1,2})\s*(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)\s*(\d{4})/
      );

    if (!Array.isArray(startDateRauwMatch) || !startDateRauwMatch.length) {
      res.errors.push({
        remarks: `geen match startDate ${res.pageInfo}`,
        toDebug: {
          text: document
            .querySelector(".event-title-wrap")
            ?.innerHTML,
          res
        }
      })
      return res;
    } 

    const day = startDateRauwMatch[1];
    const month = months[startDateRauwMatch[2]];
    const year = startDateRauwMatch[3];
    const startDate = `${year}-${month}-${day}`;

    try {
      const startTimeMatch = document
        .querySelector(".beginTime")
        ?.innerHTML.match(/\d\d:\d\d/);
      if (startTimeMatch && startTimeMatch.length) {
        res.startDateTime = new Date(
          `${startDate}:${startTimeMatch[0]}`
        ).toISOString();
      } else {
        res.errors.push({
          remarks: `wel datum, geen starttijd ${res.pageInfo}`,
          toDebug: {
            text: document
              .querySelector(".beginTime")
              ?.innerHTML,
            res
          }
        })
        return res;
      }
      const doorTimeMatch = document
        .querySelector(".doorOpen")
        ?.innerHTML.match(/\d\d:\d\d/);
      if (doorTimeMatch && doorTimeMatch.length) {
        res.doorOpenDateTime = new Date(
          `${startDate}:${doorTimeMatch[0]}`
        ).toISOString();
      }
    } catch (caughtError) {
      res.errors.push({
        error: caughtError,
        remarks: `start deurtijd match en of dateconversie ${res.pageInfo}`,
        toDebug: {
          event
        }
      });
    }

    const ofc = document.querySelector(".object-fit-cover");
    res.image = document.contains(ofc) && `https://metropool.nl/${ofc.srcset}`;
    if (!res.image){
      res.errors.push({
        remarks: `image missing ${res.pageInfo}`
      })
    }   

    return res;
  }, {months: this.months, event});

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};
