import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";
import {combineStartTimeStartDate, mapToStartDate, mapToStartTime} from "./gedeeld/datums.js";

//#region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const baroegScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 60047,
  workerData: Object.assign({}, workerData),
  hasDecentCategorisation: true,
  puppeteerConfig: {
    mainPage: {
      timeout: 45000,
    },
    singlePage: {
      timeout: 15000
    },
    app: {
      mainPage: {
        url: "https://baroeg.nl/agenda/",
        requiredProperties: ['venueEventUrl', 'title', 'start']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'start']
      }      
    }    
  }
}));
//#endregion                          SCRAPER CONFIG

baroegScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
baroegScraper.mainPageAsyncCheck = async function(event){

  let workingTitle = this.cleanupEventTitle(event.title);
  const isRefused = await this.rockRefuseListCheck(event, workingTitle)
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }

  const isAllowed = await this.rockAllowListCheck(event, workingTitle)
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  if (hasForbiddenTerms.success) {
    this.saveRefusedTitle(workingTitle)
    hasForbiddenTerms.success = false;
    return hasForbiddenTerms
  }

  this.saveAllowedTitle(workingTitle)

  return {
    workingTitle,
    reason: [isRefused.reason, isAllowed.reason, hasForbiddenTerms.reason].join(';'),
    event,
    success: true
  }
}
//#endregion                          MAIN PAGE EVENT CHECK

//#region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
//#endregion                          SINGLE PAGE EVENT CHECK

//#region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
baroegScraper.mainPage = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.mainPageEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }    

  const {stopFunctie, page} = await this.mainPageStart()

  let rawEvents = await page.evaluate(({workerData}) => {

    return Array
      .from(document.querySelectorAll('.wpt_listing .wp_theatre_event'))
      .map(eventEl => {
        const venueEventUrl = eventEl.querySelector('.wp_theatre_event_title a + a').href;
        const categorieTeksten = Array.from(eventEl.querySelectorAll('.wpt_production_categories li')).map(li => {
          const categorieNaam = li.textContent.toLowerCase().trim();
          return categorieNaam
        });
        return {
          eventEl,
          categorieTeksten,
          venueEventUrl
        }
      })
      .filter(eventData => eventData)
      .map(({eventEl,categorieTeksten,venueEventUrl}) => {
        let title = eventEl.querySelector('.wp_theatre_event_title')?.textContent.trim() ?? null;
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
        };
        
        res.soldOut = title.match(/uitverkocht|sold\s?out/i) ?? false;
        if (title.match(/uitverkocht|sold\s?out/i)) {
          title = title.replace(/uitverkocht|sold\s?out/i,'').replace(/^:\s+/,'');
        }
        res.title = title;
        
        res.shortText = eventEl.querySelector('.wp_theatre_prod_excerpt')?.textContent.trim() ?? null;
        res.shortText += categorieTeksten;
                
        res.venueEventUrl =venueEventUrl;
      
        res.mapToStartDate = eventEl.querySelector('.wp_theatre_event_startdate')?.textContent.trim().substring(3,26) ?? '';
        res.mapToStartTime = eventEl.querySelector('.wp_theatre_event_starttime')?.textContent ?? '';
        
        return res;
      })
  }, {workerData})


  rawEvents = rawEvents.map((event)=>{
    return mapToStartDate(event, 'dag-maandNummer-jaar', this.months)
  }) ;
  rawEvents = rawEvents.map(mapToStartTime);
  rawEvents = rawEvents.map(combineStartTimeStartDate);
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.mainPageEnd({
    stopFunctie, page, rawEvents: thisWorkersEvents}
  );
};
//#endregion                          MAIN PAGE

//#region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
baroegScraper.singlePage = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.singlePageStart()

  const pageInfo = await page.evaluate(
    ({event}) => {
      const res = {
        pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
        errors: [],
      };

      res.soldOut = !!(document.querySelector('.wp_theatre_event_tickets_status_soldout') ?? null)

      return res;
    }, {event}
    
  );

  const imageRes = await this.getImage({page, event, pageInfo, selectors: [".hero-area [style*='background-image']"], mode: 'background-src' })
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({page, event, pageInfo, selectors: [".wp_theatre_event_tickets"], });
  pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
  pageInfo.price = priceRes.price;

  const longTextRes = await longTextSocialsIframes(page, event, pageInfo)
  for (let i in longTextRes){
    pageInfo[i] = longTextRes[i]
  }

  return await this.singlePageEnd({pageInfo, stopFunctie, page, event})
  
};
//#endregion                         SINGLE PAGE

// #region [rgba(60, 0, 0, 0.3)]     LONG HTML
async function longTextSocialsIframes(page, event, pageInfo){

  return await page.evaluate(({event})=>{
    const res = {}
 
    const mediaSelector = ['.su-youtube iframe', 
      '.su-spotify iframe', 
      '.su-bandcamp iframe',
      ".post-content h2 a[href*='bandcamp']",
      ".post-content h2 a[href*='spotify']",
    ].join(', ');
    const textSelector = '.post-content';
    const removeEmptyHTMLFrom = '.post-content';
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
      `.post-content h3`, 
      `.post-content .wpt_listing`, 
      `.post-content .su-youtube`, 
      `.post-content .su-spotify`, 
      `.post-content .su-button`, 
      ".post-content h2 a[href*='facebook']",
      ".post-content h2 a[href*='instagram']",
      ".post-content h2 a[href*='bandcamp']",
      ".post-content h2 a[href*='spotify']",
      `.post-content .su-button-center`].join(', ')
    const socialSelector = [
      ".post-content .su-button[href*='facebook']", 
      ".post-content .su-button[href*='fb']",
      ".post-content h2 a[href*='facebook']",
      ".post-content h2 a[href*='instagram']",
    ].join(', ');
    const attributesToRemove = ['style', 'hidden', '_target', "frameborder", 'onclick', 'aria-hidden'];
    const attributesToRemoveSecondRound = ['class', 'id' ];

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

    // media obj maken voordat HTML verdwijnt
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

    // socials obj maken voordat HTML verdwijnt
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
          } 
        }
        el.className = "long-html__social-list-link";
        el.target = "_blank";
        return el.outerHTML;
      })

    // stript HTML tbv text
    removeSelectors.length && document.querySelectorAll(removeSelectors)
      .forEach(toRemove => toRemove.parentNode.removeChild(toRemove))

    // lege HTML eruit cq HTML zonder tekst of getallen
    document.querySelectorAll(`${removeEmptyHTMLFrom} > *`)
      .forEach(checkForEmpty => {
        const leegMatch = checkForEmpty.innerHTML.match(/[\w\d]/g);
        if (!Array.isArray(leegMatch)){
          checkForEmpty.parentNode.removeChild(checkForEmpty)
        }
      })

    // laatste attributen eruit.
    document.querySelectorAll(textSocEnMedia)
      .forEach(elToStrip => {
        attributesToRemoveSecondRound.forEach(attr => {
          if (elToStrip.hasAttribute(attr)){
            elToStrip.removeAttribute(attr)
          }
        })
      }) 

    // tekst.
    res.textForHTML = Array.from(document.querySelectorAll(textSelector))
      .map((el) => el.innerHTML)
      .join("");
    return res;
  }, {event})
  
}
// #endregion                        LONG HTML