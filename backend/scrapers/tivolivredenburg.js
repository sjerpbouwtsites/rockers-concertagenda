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

// SINGLE EVENT CHECK

tivoliVredenburgScraper.singleRawEventCheck = async function (event) {

  const workingTitle = this.cleanupEventTitle(event.title);

  const isRefused = await this.rockRefuseListCheck(event, workingTitle)
  if (isRefused.success) return {
    reason: isRefused.reason,
    event,
    success: false
  };

  const isAllowed = await this.rockAllowListCheck(event, workingTitle)
  if (isAllowed.success) {
    return isAllowed
  }

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
  
};

// MAKE BASE EVENTS

tivoliVredenburgScraper.makeBaseEventList = async function () {
  
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  } 

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  let rawEvents = await page.evaluate(({workerData, unavailabiltyTerms}) => {
    return Array.from(document.querySelectorAll(".agenda-list-item"))
      .map((eventEl) => {
        const title =
          eventEl
            .querySelector(".agenda-list-item__title")
            ?.textContent.trim() ?? null;
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
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
        const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
        res.unavailable = !!eventEl.textContent.match(uaRex);        
        res.soldOut = !!eventEl.querySelector(".agenda-list-item__label")?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;
        return res;
      });
  }, {workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms})
  
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );

};

// GET PAGE INFO

tivoliVredenburgScraper.getPageInfo = async function ({ page, event }) {
 
  const {stopFunctie} =  await this.getPageInfoStart()

  const pageInfo = await page.evaluate(({event}) => {
    const res = {
      pageInfo: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
      errors: [],
    };
    res.priceTextcontent =
      document.querySelector(".btn-group__price")?.textContent.trim() ?? '';
    res.priceContexttext =
      document.querySelector(".event-cta")?.textContent.trim() ?? '';

    const startDateMatch = location.href.match(/\d\d-\d\d-\d\d\d\d/); //
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
            event
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
            event
          }
        });
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
            event
          }
        });
      }
    }

    const iframes = Array.from(document.querySelectorAll('[data-embed]'))
      .map(btns =>{
        const YtIDMatch = btns.getAttribute('data-embed').match(/embed%2(.[^%]*)/);
        if (Array.isArray(YtIDMatch)) {
          //          return`<iframe width="560" height="315" src="https://www.youtube.com/embed/${YtIDMatch[1]}" allowfullscreen></iframe>`;
        }
        //return `<p>Nee balen ${btns.getAttribute('data-embed')}</p>`;
      })
      .filter(a=>a)
      .join('')

    document.querySelectorAll('.js-cookie-btn').forEach(btn =>{
      btn.innerHTML = '';
      btn.parentNode.removeChild(btn)
    })
    res.iframes = iframes;
    res.longTextHTML = 
      (document.querySelector(".event__text")?.innerHTML ?? '') +
      iframes;
    return res;
  }, {event});

  this.dirtyDebug(pageInfo)

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page, event})

};
