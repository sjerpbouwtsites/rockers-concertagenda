import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

//#region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const dbsScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 60044,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 60045,
      waitUntil: 'domcontentloaded'
    },
    singlePage: {
      timeout: 45000
    },
    app: {
      mainPage: {
        url: "https://www.dbstudio.nl/agenda/",
        requiredProperties: ['venueEventUrl', 'title', 'start']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'start']
      }
    }
  }
}));
//#endregion                          SCRAPER CONFIG

dbsScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.1)]      RAW EVENT CHECK
//#endregion                          RAW EVENT CHECK

//#region [rgba(0, 180, 0, 0.1)]      SINGLE EVENT CHECK
dbsScraper.singleMergedEventCheck = async function(event){

  const workingTitle = this.cleanupEventTitle(event.title);

  const isRefused = await this.rockRefuseListCheck(event, workingTitle)
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused
  }

  const isAllowed = await this.rockAllowListCheck(event, workingTitle)
  if (isAllowed.success) {
    return isAllowed;  
  }

  const hasForbiddenTerms = await this.hasForbiddenTerms(event)
  if (hasForbiddenTerms.success) {
    this.saveRefusedTitle(workingTitle)     
    hasForbiddenTerms.success = false;
    return hasForbiddenTerms;
  }

  const hasGoodTerms = await this.hasGoodTerms(event);
  if (hasGoodTerms.success) {
    this.saveAllowedTitle(workingTitle)
    return hasGoodTerms
  }

  this.saveAllowedTitle(workingTitle)
  
  return {
    workingTitle,
    event,
    reason: [isRefused.reason, isAllowed.reason, hasForbiddenTerms.reason].join(';'),
    success: true
  }

}
//#endregion                          SINGLE EVENT CHECK

//#region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
dbsScraper.mainPage = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => {
      return index % workerData.workerCount === workerData.index
    })
    return await this.mainPageEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }   

  const {stopFunctie, page} = await this.mainPageStart()

  await page.waitForSelector('.fusion-events-post')
  await _t.waitTime(100)

  let rawEvents = await page.evaluate(
    ({ months,workerData,unavailabiltyTerms }) => {
      return Array.from(document.querySelectorAll(".fusion-events-post"))
        .map((eventEl) => {
          let title = eventEl.querySelector(".fusion-events-meta .url")?.textContent.trim() ?? null;
          if (title.match(/sold\s?out|uitverkocht/i)) {
            title = title.replace(/\*?(sold\s?out|uitverkocht)\s?\*?\s?/i,'')
          }
          const res = {
            pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} - main - ${title}</a>`,
            errors: [],
            title
          };

          const uaRex = new RegExp(unavailabiltyTerms.join("|"), "gi");
          res.unavailable = !!eventEl.textContent.match(uaRex);

          res.venueEventUrl = eventEl.querySelector(".fusion-events-meta .url")?.href ?? null;

          const startDateMatch = eventEl.querySelector(".tribe-event-date-start")?.textContent.match(/(\d+)\s+(\w+)/) ?? null;
          if (startDateMatch) {
           
            res.day = startDateMatch[1];
            let monthName = startDateMatch[2];
            res.month = months[monthName];
            res.day = res.day.padStart(2, "0");
            const yearMatch = eventEl.querySelector(".tribe-event-date-start")?.textContent.match(/\d{4}/);
            if (
              !yearMatch ||
              !Array.isArray(yearMatch) ||
              yearMatch.length < 1
            ) {
              res.year = new Date().getFullYear();
            } else {
              res.year = yearMatch[1];
            }
            res.year = res.year || new Date().getFullYear();
            const timeMatch = eventEl.querySelector(".tribe-event-date-start")?.textContent
              .match(/\d{1,2}:\d\d/);
            if (!timeMatch ||
              !Array.isArray(timeMatch) ||
              timeMatch.length < 1) {
              res.time = '12:00';
            } else {
              res.time = timeMatch[0].padStart(5, "0");
              res.startDate = `${res.year}-${res.month}-${res.day}`;
              res.start = `${res.startDate}T${res.time}:00`
            }
          }
          

          try {
            const endDateEl =
            eventEl.querySelector(".tribe-event-time") ?? null;            
            if (res.startDate && endDateEl) {
              if (endDateEl) {
                const endDateM = endDateEl.textContent
                  .toLowerCase()
                  .match(/\d{1,2}:\d\d/);
                if (Array.isArray(endDateM) && endDateM.length > 0) {
                  res.endTime = endDateM[0].padStart(5, "0");
                  res.end = `${res.startDate}T${res.endTime}:00`
                  if (res.end === res.start) {
                    res.end = null;
                  }
                }
              }
            } 
          }
          catch (caughtError) {
            res.errors.push({error: caughtError, remarks: `Wirwar datums e.d. ${title}`,toDebug:res});
          }

          return res;
        });
    },
    { months: this.months,workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms }
  )
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.mainPageEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
  
};
//#endregion                          MAIN PAGE

//#region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
dbsScraper.singlePage = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.singlePageStart()
  
  const pageInfo = await page.evaluate(({event}) => {
    const res = {
      pageInfo: `<a class='page-info' href='${location.href}'>${document.title}</a>`,
      errors: [],
    };

    res.shortText = document.querySelector(".tribe-events-event-categories")?.textContent.toLowerCase().replace('concert, ', '').replace('concert', '').trim() ??
      "";
    res.ticketURL = document.querySelector('.tribe-events-event-url a')?.href ?? null;
    if (!res.ticketURL){
      res.price ='0';
    }

    return res;
  }, {event});
  
  const imageRes = await this.getImage({page, event, pageInfo, selectors: [".tribe-events-event-image .wp-post-image"], mode: 'image-src' })
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const longTextRes = await longTextSocialsIframes(page, event, pageInfo)
  for (let i in longTextRes){
    pageInfo[i] = longTextRes[i]
  }

  if (pageInfo.ticketURL && !pageInfo.unavailable) {
    this.debugPrice && this.dirtyTalk(`gaan naar url ${pageInfo.ticketURL}`)
    try {
      await page.goto(pageInfo.ticketURL)
      //const priceRes = await this.getPriceFromHTML({page, event, pageInfo, selectors: ['[data-testid="ticket-price"]'], });
      const html = await page.evaluate(()=>{
        return document.querySelector('body').innerHTML;
      }).catch(err => {
        this.dirtyDebug({
          title: 'error ticketURL',
          err
        })        
      })
     
      const price = Number(html.match(/€\d{1,3}[,.]\d\d/)[0].replace(/€/,'').replace(/[,.]/,'')) / 100
      pageInfo.price = price

    } catch (caughtError) {
      // er is gewoon geen prijs beschikbaar.
      this.dirtyDebug({
        title: 'error ticketURL',
        caughtError
      })
    }
  }
  
  return await this.singlePageEnd({pageInfo, stopFunctie, page, event})
  
};
//#endregion                         SINGLE PAGE

// #region [rgba(60, 0, 0, 0.3)]     LONG HTML
async function longTextSocialsIframes(page, event, pageInfo){

  return await page.evaluate(({event})=>{
    const res = {}
    const textSelector = '.tribe-events-content';
    const mediaSelector = [`${textSelector} iframe` 
    ].join(', ');
    const removeEmptyHTMLFrom = textSelector
    const socialSelector = [
      
    ].join(', ');
    const removeSelectors = [
      `${textSelector} [class*='icon-']`,
      `${textSelector} [class*='fa-']`,
      `${textSelector} .fa`,
      `${textSelector} script`,
      `${textSelector} noscript`,
      `${textSelector} style`,
      `${textSelector} meta`,
      `${textSelector} svg`,
      `${textSelector} form`,      
      `${textSelector} .video-shortcode`,
      `${textSelector} img`,
    ].join(', ')
    
    const attributesToRemove = ['style', 'hidden', '_target', "frameborder", 'onclick', 'aria-hidden'];
    const attributesToRemoveSecondRound = ['class', 'id' ];
    const removeHTMLWithStrings = [];


    // eerst onzin attributes wegslopen
    const socAttrRemSelAdd = `${
      socialSelector.length ? `, ${socialSelector}` : ""
    }`;
    const mediaAttrRemSelAdd = `${
      mediaSelector.length ? `, ${mediaSelector} *, ${mediaSelector}` : ""
    }`;
    const textSocEnMedia = `${textSelector} *${socAttrRemSelAdd}${mediaAttrRemSelAdd}`;      
    document
      .querySelectorAll(textSocEnMedia)
      .forEach((elToStrip) => {
        attributesToRemove.forEach((attr) => {
          if (elToStrip.hasAttribute(attr)) {
            elToStrip.removeAttribute(attr);
          }
        });
      });

    //  media obj maken voordat HTML verdwijnt
    res.mediaForHTML = Array.from(document.querySelectorAll(mediaSelector))
      .map(bron => {
        const src = bron?.src ? bron.src : '';
        return {
          outer: bron.outerHTML,
          src,
          id: null,
          type: src.includes('spotify') 
            ? 'spotify' 
            : src.includes('youtube') 
              ? 'youtube'
              : 'bandcamp'
        }
      })

    //socials obj maken voordat HTML verdwijnt
    res.socialsForHTML = !socialSelector ? '' : Array.from(document.querySelectorAll(socialSelector))
      .map(el => {
        el.querySelectorAll("i, svg, img").forEach((rm) =>
          rm.parentNode.removeChild(rm)
        );
        if (!el.textContent.trim().length) {
          if (el.href.includes("facebook") || el.href.includes("fb.me")) {
            if (el.href.includes('facebook.com/events')){
              el.textContent = `FB event ${event.title}`;
            } else{
              el.textContent = `Facebook`;
            }
          } else if (el.href.includes("twitter")) {
            el.textContent = "Tweet";
          } else if (el.href.includes('instagram')) {
            el.textContent = "Insta";
          } else {
            el.textContent = "Social";
          }
        }
        el.className = "long-html__social-list-link";
        el.target = "_blank";
        return el.outerHTML;
      })



    // stript HTML tbv text
    removeSelectors.length && document.querySelectorAll(removeSelectors)
      .forEach(toRemove => toRemove.parentNode.removeChild(toRemove))

    // verwijder ongewenste paragrafen over bv restaurants
    removeHTMLWithStrings.length && Array.from(document.querySelectorAll(`${textSelector} p, ${textSelector} span, ${textSelector} a`))
      .forEach(verwijder => {
        const heeftEvilString = !!removeHTMLWithStrings.find(evilString => verwijder.textContent.includes(evilString))
        if (heeftEvilString) {
          verwijder.parentNode.removeChild(verwijder)
        }
      });

    //lege HTML eruit cq HTML zonder tekst of getallen
    // document.querySelectorAll(`${removeEmptyHTMLFrom} > *`)
    //   .forEach(checkForEmpty => {
    //     const leeg = checkForEmpty?.textContent.replace('&nbsp;','').replaceAll(/[\s\r\t]/g, '').trim() === '';
    //     if (leeg){
    //       checkForEmpty.parentNode.removeChild(checkForEmpty)
    //     }
    //   })

    res.textForHTML = Array.from(document.querySelectorAll(textSelector))
      .map((el) => el.innerHTML)
      .join("");    

    //laatste attributen eruit.
    document.querySelectorAll(textSocEnMedia)
      .forEach(elToStrip => {
        attributesToRemoveSecondRound.forEach(attr => {
          if (elToStrip.hasAttribute(attr)){
            elToStrip.removeAttribute(attr)
          }
        })
      })      

    // tekst
    res.textForHTML = Array.from(document.querySelectorAll(textSelector))
      .map((el) => el.innerHTML)
      .join("");  
    return res;
  }, {event})
  
}
// #endregion                        LONG HTML