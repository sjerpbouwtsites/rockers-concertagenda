import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

//#region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
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
        requiredProperties: ['venueEventUrl', 'title', 'start']
      }      
    }
  
  }
}));
//#endregion                          SCRAPER CONFIG

bibelotScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
bibelotScraper.mainPageAsyncCheck = async function(event){

  let workingTitle = this.cleanupEventTitle(event.title);
  const isRefused = await this.rockRefuseListCheck(event, workingTitle)
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }

  const isAllowed = await this.rockAllowListCheck(event, workingTitle)
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTermsRes = await bibelotScraper.hasForbiddenTerms(event);
  if (hasForbiddenTermsRes.success){
    hasForbiddenTermsRes.success = false;
    this.saveRefusedTitle(workingTitle)
    return hasForbiddenTermsRes;
  }

  this.saveAllowedTitle(workingTitle)

  return {
    workingTitle,
    event,
    reason: hasForbiddenTermsRes.reason,
    success: !hasForbiddenTermsRes.success,
  }
}
//#endregion                          MAIN PAGE EVENT CHECK

//#region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
//#endregion                          SINGLE PAGE EVENT CHECK

//#region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
bibelotScraper.mainPage = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.mainPageEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }   

  const {stopFunctie, page} = await this.mainPageStart()

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
  return await this.mainPageEnd({
    stopFunctie, page, rawEvents: thisWorkersEvents}
  );
  
};
//#endregion                          MAIN PAGE

//#region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
bibelotScraper.singlePage = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.singlePageStart(event)
  
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
          res.door = `${res.baseDate}T${res.doorTimeMatch[2]}:00`;
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
          res.start = `${res.baseDate}T${res.startTimeMatch[2]}:00`;
        } else if (res.door) {
          res.start = res.door;
          res.door = "";
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
          res.end = `${res.baseDate}T${res.endTimeMatch[2]}:00`;
        }
      } catch (errorCaught) {
        res.errors.push({
          error: errorCaught,
          remarks: `endtime match met basedate ${res.pageInfo}`,
          toDebug: res          
        });
      }

      return res;
    },
    { months: this.months, event }
  );

  const imageRes = await this.getImage({page, event, pageInfo, selectors: [".achtergrond-afbeelding"], mode: 'background-src' })
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({page, event, pageInfo, selectors: [".meta-colom"], });
  pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
  pageInfo.price = priceRes.price;

  const longTextRes = await longTextSocialsIframes(page, event, pageInfo)
  for (let i in longTextRes){
    pageInfo[i] = longTextRes[i]
  }


  return await this.singlePageEnd({pageInfo, stopFunctie, page, event})
  
}
//#endregion                         SINGLE PAGE


// #region [rgba(60, 0, 0, 0.3)]     LONG HTML
async function longTextSocialsIframes(page, event, pageInfo){

  return await page.evaluate(({event})=>{
    const res = {}
 
    const mediaSelector = ['.main-column iframe', 
    ].join(', ');
    const textSelector = '.main-column';
    const removeEmptyHTMLFrom = '.main-column'//textSelector;
    const socialSelector = [
      ".main-column p a[rel*='noreferrer noopener']"
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
      `.main-column > .content:first-child`, 
      '.main-column > .achtergrond-afbeelding:first-child',
      '.main-column > .content + .achtergrond-afbeelding', // onduidelijk welke
      ".main-column .wp-block-embed",
      ".main-column p a[rel*='noreferrer noopener']", // embed wrappers
      `${textSelector} img`,
    ].join(', ')
  
    const attributesToRemove = ['style', 'hidden', '_target', "frameborder", 'onclick', 'aria-hidden'];
    const attributesToRemoveSecondRound = ['class', 'id' ];
    const removeHTMLWithStrings = ['hapje en een drankje'];

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

        el.querySelectorAll('i, svg, img').forEach(rm => rm.parentNode.removeChild(rm))

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
    Array.from(document.querySelectorAll(`${textSelector} p, ${textSelector} span, ${textSelector} a`))
      .forEach(verwijder => {
        const heeftEvilString = !!removeHTMLWithStrings.find(evilString => verwijder.textContent.includes(evilString))
        if (heeftEvilString) {
          verwijder.parentNode.removeChild(verwijder)
        }
      });

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