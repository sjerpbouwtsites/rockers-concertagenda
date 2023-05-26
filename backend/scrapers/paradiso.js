import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";


//HEEFT ASYNC CHECK

// SCRAPER CONFIG

const paradisoScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 60022,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 120023,
      waitUntil: 'load'
    },
    singlePage: {
      timeout: 45024
    },
    app: {
      mainPage: {
        url: "https://www.paradiso.nl/",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  }
}));

paradisoScraper.listenToMasterThread();

// SINGLE EVENT CHECK

paradisoScraper.singleRawEventCheck = async function (event) {

  const isRefused = await this.rockRefuseListCheck(event, event.title.toLowerCase())
  if (isRefused.success) return {
    reason: isRefused.reason,
    event,
    success: false
  };

  const isAllowed = await this.rockAllowListCheck(event, event.title.toLowerCase())
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  if (hasForbiddenTerms.success) {
    await this.saveRefusedTitle(event.title.toLowerCase())
    return {
      reason: hasForbiddenTerms.reason,
      success: false,
      event
    }
  }

  const hasGoodTermsRes = await this.hasGoodTerms(event);
  if (hasGoodTermsRes.success) {
    await this.saveAllowedTitle(event.title.toLowerCase())
    return hasGoodTermsRes;
  }

  const isRockRes = await this.isRock(event);
  if (isRockRes.success){
    await this.saveAllowedTitle(event.title.toLowerCase())
  } else {
    await this.saveRefusedTitle(event.title.toLowerCase())
  }
  return isRockRes;
  
};


// MAKE BASE EVENTS
paradisoScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  } 

  const {stopFunctie, page} = await this.makeBaseEventListStart()
  
  const res = await page.evaluate(({workerData}) => {
    return {
      unavailable: '',
      pageInfo: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${workerData.index}</a>`,
      errors: [],
    }
  }, {workerData});
  
  await _t.autoScroll(page);
  await _t.autoScroll(page);
  await _t.autoScroll(page);
  let rawEvents = await page.evaluate(
    ({resBuiten}) => {

      return Array.from(document.querySelectorAll('.css-1agutam'))

        .map((rawEvent) => {
          const res = {
            ...resBuiten,
            errors: [...resBuiten.errors]
          }          
          res.title =
            rawEvent
              .querySelector(".chakra-heading")
              ?.textContent.trim() ?? "";
          res.shortText = 
            rawEvent
              .querySelector(".css-1ket9pb")
              ?.textContent.trim() ?? "";
          
          res.venueEventUrl = rawEvent.href ?? null
          res.soldOut = !!(rawEvent.textContent.toLowerCase().includes('uitverkocht') ?? null)
          res.cancelled = !!(rawEvent.textContent.toLowerCase().includes('geannulleerd') ?? null) || !!(rawEvent.textContent.toLowerCase().includes('gecanceld') ?? null)
          return res;
        });
    },
    {workerData, resBuiten: res}
  );

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
  
};

// GET PAGE INFO

paradisoScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()

  const buitenRes = {
    unavailable: event.unavailable,
    pageInfo: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
    errors: [],
  };  
  
  try {
    await page.waitForSelector(".css-tkkldl", {
      timeout: 3000,
    });
  } catch (caughtError) {
    buitenRes.errors.push({
      error: caughtError,
      remarks: "Paradiso wacht op laden single pagina",
      toDebug: {
        buitenRes, event
      }
    })
    buitenRes.unavailable += 'single pagina niet snel genoeg geladen.'
    return await this.getPageInfoEnd({pageInfo: buitenRes, stopFunctie, page})
  }

  const editedMonths = {
    jan: "01",
    feb: "02",
    mrt: "03",
    apr: "04",
    mei: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    okt: "10",
    nov: "11",
    dec: "12",
    januari: "01",
    februari: "02",
    maart: "03",
    april: "04",
    juni: "06",
    juli: "07",
    augustus: "08",
    september: "09",
    oktober: "10",
    november: "11",
    december: "12",      
    january: "01",
    february: "02",
    march: "03",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    october: "10",
  }

  const pageInfo = await page.evaluate(
    ({ months, buitenRes }) => {
      const res = {...buitenRes};

      const contentBox1 =
        document.querySelector(".css-1irwsol")?.outerHTML ?? '';
      const contentBox2 =
        document.querySelector(".css-gwbug6")?.outerHTML ?? '';
      if (contentBox1 || contentBox2) {
        res.longTextHTML = contentBox1 + contentBox2
      }

      try {
        const startDateMatch = document.querySelector('.css-tkkldl')
          ?.textContent.toLowerCase()
          .match(/(\d{1,2})\s+(\w+)/); // TODO paradiso kan nu niet omgaan met jaarrwisselingen.
        res.match = startDateMatch
        if (
          startDateMatch &&
          Array.isArray(startDateMatch) &&
          startDateMatch.length === 3
        ) {
          const monthName = months[startDateMatch[2]];
          if (!monthName) {
            res.errors.push({
              remarks: `month not found ${startDateMatch[2]}`,
              toDebug: startDateMatch
            })
            return res;
          }
          res.startDate = `2022-${
            monthName
          }-${startDateMatch[1].padStart(2, "0")}`;
        }
      } catch (caughtError) {
        res.errors.push({ 
          error: caughtError, 
          remarks: `startDateMatch ${res.pageInfo}`, 
          toDebug: {
            event
          }});
        return res;
      }

      const timesMatch =
        document.querySelector('.css-1mxblse')
          ?.textContent.match(/(\d\d:\d\d)/g) ?? null;
      res.timesMatch = timesMatch;
      if (timesMatch && Array.isArray(timesMatch) && timesMatch.length >= 1) {
        try {
          if (timesMatch.length === 1) {
            res.startDateTime = new Date(
              `${res.startDate}T${timesMatch[0]}:00`
            ).toISOString();
          } else {
            res.doorOpenDateTime = new Date(
              `${res.startDate}T${timesMatch[0]}:00`
            ).toISOString();
            res.startDateTime = new Date(
              `${res.startDate}T${timesMatch[1]}:00`
            ).toISOString();
          }
        } catch (caughtError) {
          res.errors.push({
            error: caughtError,
            remarks: `Times match ${res.pageInfo}`,
            toDebug: {
              text: `ging hiermee mis: ${timesMatch.join(" ")}\n`,
              event
            }
          });
          return res;
        }
      }

      res.priceTextcontent =
        document.querySelector(".css-1ca1ugg")
          ?.textContent ?? '';

      res.image = document.querySelector('.css-xz41fi img')?.src ?? null;
      if (!res.image){
        res.image = document.querySelector('.css-xz41fi source:last-of-type')?.srcset.split(/\s/)[0] ?? null;
      }

      if (!res.image){
        res.errors.push({
          remarks: `image missing ${res.pageInfo}`
        })
      }

      return res;
    },
    { months: editedMonths, buitenRes }
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})

};

