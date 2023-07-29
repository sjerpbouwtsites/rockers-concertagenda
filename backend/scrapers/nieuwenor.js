import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

//#region [rgba(0, 60, 0, 0.3)]       SCRAPER CONFIG
const nieuwenorScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 30053,
    },
    singlePage: {
      timeout: 15014
    },
    app: {
      mainPage: {
        url: 'https://nieuwenor.nl/programma',
        requiredProperties: ['venueEventUrl', 'title', 'shortText']
      },
      singlePage: {
        requiredProperties: ['start']
      }
    }
  }
}));
//#endregion                          SCRAPER CONFIG

nieuwenorScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.1)]      RAW EVENT CHECK
nieuwenorScraper.singleRawEventCheck = async function(event){
 
  const workingTitle = this.cleanupEventTitle(event.title)

  const isRefused = await this.rockRefuseListCheck(event, workingTitle)
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }

  const isAllowed = await this.rockAllowListCheck(event, workingTitle)
  if (isAllowed.success) {
    return isAllowed;
  }

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  if (hasForbiddenTerms.success) {
    this.saveRefusedTitle(workingTitle)
    hasForbiddenTerms.success = false;
    return hasForbiddenTerms
  }

  return {
    workingTitle,
    event,
    success: true,
    reason: [isRefused.reason, isAllowed.reason, hasForbiddenTerms.reason].join(';'),
  }

}
//#endregion                          RAW EVENT CHECK

//#region [rgba(0, 180, 0, 0.1)]      SINGLE EVENT CHECK
nieuwenorScraper.singleMergedEventCheck = async function(event){
 
  const workingTitle = this.cleanupEventTitle(event.title)
  const isAllowed = await this.rockAllowListCheck(event, workingTitle)
  if (isAllowed.success) {
    return isAllowed;
  }  

  const hasGoodTerms = await this.hasGoodTerms(event);
  if (hasGoodTerms.success) {
    this.saveAllowedTitle(workingTitle)
    return hasGoodTerms;  
  }

  const isRock = await this.isRock(event);
  if (isRock.success){
    this.saveAllowedTitle(workingTitle)
    return isRock;
  }

  this.saveRefusedTitle(workingTitle)
  
  return {
    workingTitle,
    reason: [isAllowed.reason, hasGoodTerms.reason, isRock.reason].join(';'),
    event,
    success: false
  }
  
}
//#endregion                          SINGLE EVENT CHECK

//#region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
nieuwenorScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.mainPageEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }    

  const {stopFunctie, page} = await this.mainPageStart()

  let rawEvents = await page.evaluate(
    ({workerData,unavailabiltyTerms}) => {
      return Array.from(
        document.querySelectorAll("#events a[data-genres]")
      )
        .map((eventEl) => {
          const genres = eventEl.hasAttribute('data-genres') ? eventEl.getAttribute('data-genres') : '';
          const title = eventEl.querySelector("figure + div > span:first-child")?.textContent.trim() ?? '';
          const res = {
            pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],          
            title
          }
          res.shortText = `${genres}\n${eventEl.querySelector("figure + div > span:first-child + span")?.textContent.trim()}` ?? '';
          res.venueEventUrl = eventEl?.href ?? null;
          res.startMatch = res.venueEventUrl.match(/(?<year>\d\d\d\d)\/(?<month>\d\d)\/(?<day>\d\d)/)
          if (Array.isArray){
            res.startDate = `${res.startMatch.groups.year}-${res.startMatch.groups.month}-${res.startMatch.groups.day}`
          }
          const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
          res.unavailable = !!eventEl.textContent.match(uaRex);           
          res.soldOut = eventEl.querySelector("figure + div")?.innerHTML.match(/uitverkocht|sold\s?out/i) ?? null;
          return res;
        });
    },
    {workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms}
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
nieuwenorScraper.singlePage = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.singlePageStart()

  const pageInfo = await page.evaluate(({months, event}) => {
    const res = {
      pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
      errors: [],
    };
    
    res.startTijd = null; 
    res.deurTijd = null; 
    res.eindTijd = null;
    res.mapOver = Array.from(document.querySelectorAll('#pageContent + div .w-full div'))
      .map(a=>{
        return a.textContent.toLowerCase().replaceAll(/\s{2,100}/g, ' ');
      })

    res.mapOver.forEach(divInhoud => {
      if (divInhoud.includes('open') && !res.deurTijd){
        res.deurTijd = divInhoud.match(/\d\d:\d\d/)[0]
      } else if (divInhoud.includes('aanvang') && !res.startTijd){
        res.startTijd = divInhoud.match(/\d\d:\d\d/)[0]
      } else if (divInhoud.includes('eind') && !res.eindTijd){
        res.eindTijd = divInhoud.match(/\d\d:\d\d/)[0]
      } 
    })
    
    if (res.startTijd) res.start = new Date(`${event.startDate}T${res.startTijd}:00`).toISOString();
    if (res.deurTijd) res.door = new Date(`${event.startDate}T${res.deurTijd}:00`).toISOString();
    if (res.eindTijd) res.end = new Date(`${event.startDate}T${res.eindTijd}:00`).toISOString();

    return res;
  },{ months: this.months,event});

  const imageRes = await this.getImage({page, event, pageInfo, selectors: [".flickity-slider img"], mode: 'image-src' })
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;  

  await page.evaluate(()=>{
    const s=  document.querySelector('.sticky');
    if (!s.textContent.includes('€')){
      const e = document.createElement('span');
      e.innerHTML = '€0.00';
      s.appendChild(e)
    }
  })
  const priceRes = await this.getPriceFromHTML({page, event, pageInfo, selectors: ['.sticky']});
  pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
  pageInfo.price = priceRes.price;  

  const longTextRes = await longTextSocialsIframes(page, event, pageInfo)
  for (let i in longTextRes){
    pageInfo[i] = longTextRes[i]
  }

  return await this.singlePageEnd({pageInfo, stopFunctie, page, event})
  
};
//#endregion                         SINGLE PAGE

// #region [rgba(60, 0, 0, 0.5)]     LONG HTML
async function longTextSocialsIframes(page, event, pageInfo){

  return await page.evaluate(({event})=>{
    const res = {}

    const textSelector = '#pageContent';
    const mediaSelector = [
      `${textSelector} iframe[src*="spotify"]`,
      `${textSelector} iframe[src*="youtube"]`,
    ].join(', ');
    const removeEmptyHTMLFrom = textSelector
    const socialSelector = [
      ".external-link a[href*='facebook']",
      ".external-link a[href*='instagram']"
    ].join(', ');
    const removeSelectors = [
      `${textSelector} [class*='icon-']`,
      `${textSelector} [class*='fa-']`,
      `${textSelector} .fa`,
      `${textSelector} script`,
      `${textSelector} noscript`,
      `${textSelector} style`,
      `${textSelector} meta`,
      `${textSelector} iframe`,
      `${textSelector} svg`,
      `${textSelector} form`,
      `${textSelector} #heroSlider`,  
      `${textSelector} section div:first-child`,  
      `${textSelector} img`,
      ".heeft-cta"
    ].join(', ')
  
    const attributesToRemove = ['style', 'hidden', '_target', "frameborder", 'onclick', 'aria-hidden', 'allow', 'allowfullscreen', 'data-deferlazy','width', 'height'];
    const attributesToRemoveSecondRound = ['class', 'id' ];
    const removeHTMLWithStrings = ['Iets voor jou'];

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
        bron.className = "";

        if (bron?.src && (bron.src.includes('bandcamp') || bron.src.includes('spotify'))){
          return {
            outer: bron.outerHTML,
            src: bron.src,
            id: null,
            type: bron.src.includes('bandcamp') ? 'bandcamp' : 'spotify'
          }
        }
        if (bron?.src && bron.src.includes("youtube")){
          return {
            outer: bron.outerHTML,
            src: bron.src,
            id: null,
            type: 'youtube'
          }
        }
  
        // terugval???? nog niet bekend met alle opties.
        return {
          outer: bron.outerHTML,
          src: bron.src,
          id: null,
          type: bron.src.includes("spotify")
            ? "spotify"
            : bron.src.includes("youtube")
              ? "youtube"
              : "bandcamp",
        };
      })

    // socials obj maken voordat HTML verdwijnt
    res.socialsForHTML = !socialSelector.length ? '' : Array.from(document.querySelectorAll(socialSelector))
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

    // // lege HTML eruit cq HTML zonder tekst of getallen
    // document.querySelectorAll(`${removeEmptyHTMLFrom} > *`)
    //   .forEach(checkForEmpty => {
    //     const leegMatch = checkForEmpty.innerHTML.replace('&nbsp;','').match(/[\w\d]/g);
    //     if (!Array.isArray(leegMatch)){
    //       checkForEmpty.parentNode.removeChild(checkForEmpty)
    //     }
    //   })

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
      .map(el => el.innerHTML)
      .join('')
    return res;
  },{event})
  
}
// #endregion                        LONG HTML