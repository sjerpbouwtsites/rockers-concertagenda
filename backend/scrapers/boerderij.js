import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import crypto from "crypto";
import axios from "axios";
import {waitTime} from "../mods/tools.js"
import makeScraperConfig from "./gedeeld/scraper-config.js";

//#region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const boerderijScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 30004,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 30005,
    },
    singlePage: {
      timeout: 20006
    },
    app: {
      mainPage: {
        useCustomScraper: true,
        url: `https://poppodiumboerderij.nl/includes/ajax/events.php?filters=6,7,8&search=&limit=15&offset=${
          workerData.index * 15
        }&lang_id=1&rooms=&month=&year=`,
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'start']
      }
    }
  }
}));
//#endregion                          SCRAPER CONFIG

boerderijScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.1)]      RAW EVENT CHECK
boerderijScraper.singleRawEventCheck = async function(event){

  let workingTitle = this.cleanupEventTitle(event.title);
  
  const isRefused = await this.rockRefuseListCheck(event, workingTitle)
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }

  const isAllowed = await this.rockAllowListCheck(event, workingTitle)
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTerms = await this.hasForbiddenTerms(event, ['title']);
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
//#endregion                          RAW EVENT CHECK

//#region [rgba(0, 180, 0, 0.1)]      SINGLE EVENT CHECK
//#endregion                          SINGLE EVENT CHECK

//#region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
boerderijScraper.mainPage = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.mainPageEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }   

  const {stopFunctie} = await this.mainPageStart()

  let rawEvents = await axios
    .get(this.puppeteerConfig.app.mainPage.url)
    .then((response) => {
      return response.data;
    });

  if (rawEvents.length) {
    rawEvents = rawEvents.map((event) => {
      event.venueEventUrl = `https://poppodiumboerderij.nl/programma/${event.seo_slug}`;
      event.shortText = event.subtitle;
      event.title = event.title + `&id=${event.id}`;
      return event;
    })
      .map(this.isMusicEventCorruptedMapper);

  }

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.mainPageEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
};
//#endregion                          MAIN PAGE

//#region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
boerderijScraper.singlePage = async function ({ event, page}) {
 
  const {stopFunctie} =  await this.singlePageStart()

  const [realEventTitle, realEventId] = event.title.split("&id=");
  event.title = realEventTitle;

  const res = {

    pageInfo: `<a class='page-info' href='${this.puppeteerConfig.app.mainPage.url}'>${event.title}</a>`,
    errors: [],
  };

  const url = `https://poppodiumboerderij.nl/includes/ajax.inc.php?id=${realEventId}&action=getEvent&lang_id=1`;
  const ajaxRes = await axios
    .get(url)
    .then((response) => {
      return response.data;
    })
    .catch(caughtError => {
      res.errors.push({
        error:caughtError,
        remarks: `ajax ${url} faal ${res.pageInfo}`,
        errorLevel: 'close-thread',
        toDebug: event,
      });
    });

  

  if (!ajaxRes) {
    res.corrupted += `ajax verzoek faalt naar ${url}`;
    return await this.singlePageEnd({res, stopFunctie})
  }

  const imageRes = await this.getImage({page, event, res, selectors: ['.event-image'], mode: 'image-src' })
  res.errors = res.errors.concat(imageRes.errors);
  res.image = imageRes.image;  

  res.boerderijID = ajaxRes.id;
  const priceRes = await this.boerderijCustomPrice(`${ajaxRes?.entrance_price ?? ''} ${ajaxRes?.ticket_price ?? ''}`, res.pageInfo, res.title);
  res.errors = res.errors.concat(priceRes.errors);
  res.price = priceRes.price;
    
  try {
    res.start = new Date(
      `${ajaxRes.event_date}T${ajaxRes.event_start}`
    ).toISOString();
  } catch (catchedError) {
    res.errors.push({
      error: catchedError,
      remarks: `start samenvoeging ${res.pageInfo}`,
      toDebug:res,
    });
  }
  try {
    res.door = new Date(
      `${ajaxRes.event_date}T${ajaxRes.event_open}`
    ).toISOString();
  } catch (catchedError) {
    res.errors.push({
      error: catchedError,
      remarks: `door samenvoeging ${res.pageInfo}`,
      toDebug:res,
    });
  }

  const longTextRes = await longTextSocialsIframes(page, event, res)
  for (let i in longTextRes){
    res[i] = longTextRes[i]
  }

  res.soldOut = ajaxRes?.label?.title?.toLowerCase().includes('uitverkocht') ?? null

  return await this.singlePageEnd({pageInfo: res, stopFunctie})

};
//#endregion                         SINGLE PAGE

boerderijScraper.boerderijCustomPrice = async function (testText, pi, title) {
  let priceRes = {
    price: null,
    errors: []
  };
  if (!testText) {
    priceRes.errors.push({
      remarks: 'geen testText'
    })
    return priceRes
  } 

  if (testText.match(/start/i)) {
    priceRes.price = null;
    this.debugPrice && this.dirtyDebug({
      title: title,
      price:priceRes.price,
      type: 'NOG ONBEKEND',
    })      
    return priceRes
  }

  if (testText.match(/gratis|free/i)) {
    priceRes.price = 0;
    this.debugPrice && this.dirtyDebug({
      title: title,
      price:priceRes.price,
      type: 'GRATIS',
    })      
    return priceRes
  }

  if (testText.match(/uitverkocht|sold\sout/i)) {
    priceRes.price = null;
    this.debugPrice && this.dirtyDebug({
      title: title,
      price:priceRes.price,
      type: 'UITVERKOCHT',
    })      
    return priceRes
  }

  const priceMatch = testText
    .replaceAll(/[\s\r\t ]/g,'')
    .match(/(?<euros>\d+)(?<scheiding>[,.]?)(?<centen>\d\d|-)/);

  const priceMatchEuros = testText
    .replaceAll(/[\s\r\t ]/g,'')
    .match(/\d+/);

  if (!Array.isArray(priceMatch) && !Array.isArray(priceMatchEuros)) {
    priceRes.errors.push({
      remarks: `geen match met ${pi}`, 
    });
    return priceRes
  }

  if (!Array.isArray(priceMatch) && Array.isArray(priceMatchEuros)){
    priceRes.price = Number(priceMatchEuros[0]);
    this.checkIsNumber(priceRes, pi)
    this.debugPrice && this.dirtyDebug({
      title: title,
      price:priceRes.price,
    })      
    return priceRes;
  }

  if (priceMatch.groups?.centen && priceMatch.groups?.centen.includes('-')){
    priceMatch.groups.centen = '00';
  }

  try {
    if (priceMatch.groups.scheiding){
      if (priceMatch.groups.euros && priceMatch.groups.centen){
        priceRes.price = (Number(priceMatch.groups.euros) * 100 + Number(priceMatch.groups.centen)) / 100;
      }
      if (priceMatch.groups.euros){
        priceRes.price = Number(priceMatch.groups.euros)
      }
    } else {
      priceRes.price = Number(priceMatch.groups.euros)
    }
    this.checkIsNumber(priceRes, pi)
    this.debugPrice && this.dirtyDebug({
      title: title,
      price: priceRes.price
    })      
    return priceRes;

  } catch (priceCalcErr) {
    
    priceRes.push({
      error: priceCalcErr,
      remarks: `price calc err ${pi}`, 
      toDebug: {testText, priceMatch, priceRes}
    });
    return priceRes
    
  }

  return priceRes;

}  


// #region [rgba(60, 0, 0, 0.5)]     LONG HTML
async function longTextSocialsIframes(page, event, pageInfo){

  return await page.evaluate(({event})=>{
    const res = {}

    const textSelector = '.page-wrapper__main';
    const mediaSelector = [
      `${textSelector} iframe`,
    ].join(", ");
    const removeEmptyHTMLFrom = textSelector;
    const socialSelector = [].join(", ");
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
      `${textSelector} h1`,
      `${textSelector} img`,
      `${textSelector} .video__button`,
      `${textSelector} iframe[src*='bandcamp']`,
      `${textSelector} iframe[src*='spotify']`,        
      'svg'
    ].join(", ");

    const attributesToRemove = [
      "style",
      "hidden",
      "_target",
      "frameborder",
      "onclick",
      "aria-hidden",
      "allow",
      "allowfullscreen",
      "data-deferlazy",
      "width",
      "height",
    ];
    const attributesToRemoveSecondRound = ["class", "id"];
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


    //media obj maken voordat HTML verdwijnt
    res.mediaForHTML = !mediaSelector.length ? '' : Array.from(
      document.querySelectorAll(mediaSelector)
    ).map((bron) => {
      bron.className = "";

      if (bron?.src && bron.src.includes('bandcamp')){
        return {
          outer: bron.outerHTML,
          src: bron.src,
          id: null,
          type: 'bandcamp'
        }
      }
     
      if (bron?.src && bron.src.includes('spotify')){
        return {
          outer: bron.outerHTML,
          src: bron.src,
          id: null,
          type: 'spotify'
        }
      }

      if (bron?.src && bron.src.includes('youtube')){
        return {
          outer: bron.outerHTML,
          src: bron.src,
          id: null,
          type: 'youtube'
        }
      }     

      return {
        outer: bron.outerHTML,
        src: null,
        id: null,
        type: 'onbekend'
      }

    });

    //socials obj maken voordat HTML verdwijnt
    res.socialsForHTML = !socialSelector
      ? ""
      : Array.from(document.querySelectorAll(socialSelector)).map((el) => {
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
      });

    // stript HTML tbv text
    removeSelectors.length &&
     document
       .querySelectorAll(removeSelectors)
       .forEach((toRemove) => toRemove.parentNode.removeChild(toRemove));

    // verwijder ongewenste paragrafen over bv restaurants
    Array.from(
      document.querySelectorAll(
        `${textSelector} p, ${textSelector} span, ${textSelector} a`
      )
    ).forEach((verwijder) => {
      const heeftEvilString = !!removeHTMLWithStrings.find((evilString) =>
        verwijder.textContent.includes(evilString)
      );
      if (heeftEvilString) {
        verwijder.parentNode.removeChild(verwijder);
      }
    });

    // lege HTML eruit cq HTML zonder tekst of getallen
    document
      .querySelectorAll(`${removeEmptyHTMLFrom} > *`)
      .forEach((checkForEmpty) => {
        const leegMatch = checkForEmpty.innerHTML
          .replace("&nbsp;", "")
          .match(/[\w\d]/g);
        if (!Array.isArray(leegMatch)) {
          checkForEmpty.parentNode.removeChild(checkForEmpty);
        }
      });

    // laatste attributen eruit.
    document.querySelectorAll(textSocEnMedia).forEach((elToStrip) => {
      attributesToRemoveSecondRound.forEach((attr) => {
        if (elToStrip.hasAttribute(attr)) {
          elToStrip.removeAttribute(attr);
        }
      });
    });

    // tekst.
    res.textForHTML = Array.from(document.querySelectorAll(textSelector))
      .map((el) => el.innerHTML)
      .join("");
    return res;
  },{event})
  
}
// #endregion                        LONG HTML