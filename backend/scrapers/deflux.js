import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import axios from "axios";
import makeScraperConfig from "./gedeeld/scraper-config.js";
import * as _t from "../mods/tools.js";

//#region [rgba(0, 60, 0, 0.3)]       SCRAPER CONFIG
const vandaag = new Date().toISOString().split('T')[0]
const defluxScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 30007,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 50008,
    },
    singlePage: {
      timeout: 20009
    },
    app: {
      mainPage: {
        useCustomScraper: true,
        url: `https://www.podiumdeflux.nl/wp-json/wp/v2/ajde_events?event_type=81,87,78,88,80&filter[startdate]=${vandaag}`,
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'start']
      }
    }
  }
}));
//#endregion                          SCRAPER CONFIG

defluxScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.3)]      RAW EVENT CHECK
defluxScraper.singleRawEventCheck = async function (event) {

  let workingTitle = this.cleanupEventTitle(event.title);

  const isRefused = await this.rockRefuseListCheck(event, workingTitle)
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }

  const isAllowed = await this.rockAllowListCheck(event, workingTitle)
  if (isAllowed.success) return isAllowed;

  const goodTermsRes = await this.hasGoodTerms(event) 
  if (goodTermsRes.success) {
    this.saveAllowedTitle(workingTitle)
    return goodTermsRes;
  }

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  if (hasForbiddenTerms.success) {
    this.saveRefusedTitle(workingTitle)
    hasForbiddenTerms.success = false;
    return hasForbiddenTerms
  }

  this.saveAllowedTitle(workingTitle)

  return {
    workingTitle,
    event,
    success: true,
    reason: [isRefused.reason, isAllowed.reason, hasForbiddenTerms.reason].join(';'),
  }
};
//#endregion                          RAW EVENT CHECK

//#region [rgba(0, 180, 0, 0.3)]      SINGLE EVENT CHECK
defluxScraper.singleMergedEventCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);

  const isAllowed = await this.rockAllowListCheck(event, workingTitle)
  if (isAllowed.success) {
    return isAllowed;  
  }

  return {
    workingTitle,
    event,
    success: true,
    reason: 'weird one',
  };
};
//#endregion                          SINGLE EVENT CHECK

//#region [rgba(0, 240, 0, 0.3)]      MAIN PAGE
defluxScraper.mainPage = async function () {
 
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.mainPageEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }   

  const {stopFunctie} = await this.mainPageStart()

  const axiosRes = await axios //TODO naar fetch
    .get(this.puppeteerConfig.app.mainPage.url)
    .then(( response )=> {
      return response.data;
    })
    .catch((caughtError)=> {
      // TODO WRAPPEN
      _t.handleError(caughtError, workerData, `main axios fail`, 'close-thread', null)
    })
  if (!axiosRes) return;
  const rawEvents = axiosRes.map(axiosResultSingle =>{
    let title = axiosResultSingle.title.rendered;
    const res = {
      pageInfo: `<a class='pageinfo' href="${this.puppeteerConfig.app.mainPage.url}">${workerData.family} main - ${title}</a>`,
      errors: [],
      venueEventUrl: axiosResultSingle.link,
      id: axiosResultSingle.id,
    };    
    res.soldOut = title.match(/uitverkocht|sold\s?out/i) ?? false;
    if (title.match(/uitverkocht|sold\s?out/i)) {
      title = title.replace(/uitverkocht|sold\s?out/i,'').replace(/^:\s+/,'');
    }
    res.title = title;    
    return res;
  })
    .map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.mainPageEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );

};
//#endregion                          MAIN PAGE

//#region [rgba(120, 0, 0, 0.3)]     SINGLE PAGE
defluxScraper.singlePage = async function ({ page, event}) {
 
  const {stopFunctie} =  await this.singlePageStart()

  const pageInfo = await page.evaluate(({event}) => {

    const res = {
      pageInfo: `<a class='page-info' href='${location.href}'>${document.title}</a>`,
      errors: [],
    };

    const eventScheme = document.querySelector('.evo_event_schema');
    if(!eventScheme) {
      res.errors.push({remarks: `geen event scheme gevonden ${res.pageInfo}`,toDebug:res})
      return res;  
    }


    try {
      res.startDate = eventScheme.querySelector('[itemprop="startDate"]')?.getAttribute('content').split('T')[0].split('-').map(dateStuk => dateStuk.padStart(2, '0')).join('-')
      res.startTime = document.querySelector('.evcal_time.evo_tz_time').textContent.match(/\d\d:\d\d/)[0];
      res.start = new Date(`${res.startDate}T${res.startTime}:00`).toISOString()
    } catch (caughtError) {
      res.errors.push({error: caughtError, remarks: `starttime match ${res.pageInfo}`})
    }

    if (document.querySelector('.evcal_desc3')?.textContent.toLowerCase().includes('deur open') ?? false) {
      try {
        res.endTime = document.querySelector('.evcal_desc3').textContent.match(/\d\d:\d\d/)[0];
        res.end = new Date(`${res.startDate}T${res.endTime}:00`).toISOString();
      } catch (caughtError) {
        res.errors.push({error: caughtError, remarks: `door open starttime match ${res.pageInfo}`,toDebug:res})
      }
    }

    return res;
  }, {event});

  const imageRes = await this.getImage({page, event, pageInfo, selectors: [".evo_event_main_img", ".event_description img"], mode: 'image-src' })
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;  

  const priceRes = await this.getPriceFromHTML({page, event, pageInfo, selectors: [".desc_trig_outter"], });
  pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
  pageInfo.price = priceRes.price;  

  const longTextRes = await longTextSocialsIframes(page, event, pageInfo)
  for (let i in longTextRes){
    pageInfo[i] = longTextRes[i]
  }

  return await this.singlePageEnd({pageInfo, stopFunctie})

};
//#endregion                         SINGLE PAGE

// #region [rgba(60, 0, 0, 0.5)]     LONG HTML
async function longTextSocialsIframes(page, event, pageInfo){

  return await page.evaluate(({event})=>{
    const res = {}
    const textSelector = '.eventon_desc_in';
    const mediaSelector = ['figure'
    ].join(', ');
    const removeEmptyHTMLFrom = textSelector
    const socialSelector = [
      '.FacebookShare a',
      '.Twitter a'
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
  
    // media obj maken voordat HTML verdwijnt
    res.mediaForHTML = Array.from(document.querySelectorAll(mediaSelector))
      .map(bron => {

        if (bron.textContent.includes('https://www.youtube')){
          return {
            outer: null,
            src: bron.textContent.trim().replace('watch?v=', 'embed/'),
            id: null,
            type: 'youtube',
          }          
        }

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
        const leegMatch = checkForEmpty.innerHTML.replace('&nbsp;','').match(/[\w\d]/g);
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