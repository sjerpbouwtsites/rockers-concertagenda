import { workerData} from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

//#region [rgba(0, 60, 0, 0.3)]       SCRAPER CONFIG
const groeneEngelScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 60075,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 25076,
      waitUntil: 'load'
    },
    singlePage: {
      timeout: 20077
    },
    app: {
      mainPage: {
        url: "https://www.groene-engel.nl/programma/?filter=concert",
        requiredProperties: ['venueEventUrl', 'title' ]
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'start']
      }
    }
  }
}));
//#endregion                          SCRAPER CONFIG

groeneEngelScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.3)]      RAW EVENT CHECK
groeneEngelScraper.singleRawEventCheck = async function(event){

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

  return {
    event,
    success: true,
    reason: "nothing found currently",
  };
  
}
//#endregion                          RAW EVENT CHECK

//#region [rgba(0, 180, 0, 0.3)]      SINGLE EVENT CHECK
groeneEngelScraper.singleMergedEventCheck = async function (event) {
  const tl = this.cleanupEventTitle(event.title);
  const isRefused = await this.rockRefuseListCheck(event, tl)
  if (isRefused.success) return {
    reason: isRefused.reason,
    event,
    success: false
  };

  const isAllowed = await this.rockAllowListCheck(event, tl)
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTerms = await this.hasForbiddenTerms(event, ['title','textForHTML']);
  if (hasForbiddenTerms.success) {
    await this.saveRefusedTitle(tl)
    return {
      reason: hasForbiddenTerms.reason,
      success: false,
      event
    }
  }

  const hasGoodTerms = await this.hasGoodTerms(event, ['title', 'textForHTML']);
  if (hasGoodTerms.success) {
    await this.saveAllowedTitle(tl)
    return hasGoodTerms;
  }

  const isRockRes = await this.isRock(event);
  if (isRockRes.success){
    await this.saveAllowedTitle(tl)
  } else {
    await this.saveRefusedTitle(tl)
  }
  return isRockRes;  
};
//#endregion                          SINGLE EVENT CHECK

//#region [rgba(0, 240, 0, 0.3)]      BASE EVENT LIST
groeneEngelScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }    

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  let baseEvents = await page.evaluate(({workerData, unavailabiltyTerms,months}) => 
  {
    return Array
      .from(document.querySelectorAll(".collection-wrapper .event-part"))
      .map((eventEl) =>{
        const title = eventEl.querySelector(".part-title")?.textContent ?? null;
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title
        };
        res.venueEventUrl = eventEl.querySelector(".left-side")?.href ?? "";
        const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
        res.unavailable = !!eventEl.textContent.match(uaRex);      
        res.soldOut = !!eventEl.querySelector('.bottom-bar')?.textContent.match(/uitverkocht|sold\s?out/i) ?? null;


        res.startDateMatch = eventEl.querySelector('.date-label')?.textContent.match(/\s(?<datum>\d{1,2}\s\w+\s\d\d\d\d)/) ?? null
        if (res.startDateMatch && res.startDateMatch?.groups) res.startDateRauw = res.startDateMatch.groups.datum;
        
        res.dag = res.startDateMatch.groups.datum.split(' ')[0].padStart(2, '0')
        res.maand = res.startDateMatch.groups.datum.split(' ')[1]
        res.maand = months[res.maand];
        res.jaar = res.startDateMatch.groups.datum.split(' ')[2]

        res.startDate = `${res.jaar}-${res.maand}-${res.dag}`

        return res;
      })
  }, {workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms, months:this.months})

  baseEvents = baseEvents.map(this.isMusicEventCorruptedMapper);
  
  this.saveBaseEventlist(workerData.family, baseEvents)
  const thisWorkersEvents = baseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
};
//#endregion                          BASE EVENT LIST


groeneEngelScraper.getPageInfo = async function ({ page, event }) {

  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(({event}) => {
    const res = {
      pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
      errors: [],
    };

    let startEl,deurEl;
    document.querySelectorAll('.time-tag ~ *').forEach(tijdEl=>{
      if (tijdEl.textContent.toLowerCase().includes('aanvang')){
        startEl = tijdEl
      }
      if (tijdEl.textContent.toLowerCase().includes('open')){
        deurEl = tijdEl
      }        
    })

    if (!startEl){
      res.errors.push({
        remarks: 'geen tijd el gevonden'
      })
    }

    res.startTijdMatch = startEl.textContent.match(/\d\d:\d\d/)
    if (deurEl)res.deurTijdMatch = deurEl.textContent.match(/\d\d:\d\d/)
    if (Array.isArray(res.startTijdMatch)) res.startTijd = res.startTijdMatch[0]
    if (Array.isArray(res.deurTijdMatch)) res.deurTijd = res.deurTijdMatch[0]

    try {
      res.start = new Date(`${event.startDate}T${res.startTijd}:00`).toISOString();
      res.door = !res?.deurTijd ? null : new Date(`${event.startDate}T${res.deurTijd}:00`).toISOString();
    } catch (error) {
      res.errors.push({
        error,
        remarks: `date ${event.startDate} time ${res.startTijd}`,
        toDebug: {
          startElT: startEl.textContent
          
        }
      })      
    }
    


    res.image = document.querySelector('.img-wrapper img')?.getAttribute('data-lazy-src') ?? null;
    if (!res.image){
      res.errors.push({
        remarks: `image missing ${res.pageInfo}`
      })
    } 

    return res;
  }, {event});

  const priceRes = await this.getPriceFromHTML({page, event, pageInfo, selectors: ['.main-ticket-info'], });
  pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
  pageInfo.price = priceRes.price;  
  
  const longTextRes = await longTextSocialsIframes(page)
  for (let i in longTextRes){
    pageInfo[i] = longTextRes[i]
  }
  return await this.getPageInfoEnd({pageInfo, stopFunctie, page, event})

};



// #region [rgba(60, 0, 0, 0.5)]     LONG HTML
async function longTextSocialsIframes(page){

  return await page.evaluate(()=>{
    const res = {}


    const textSelector = '#main-content .left-side';
    const mediaSelector = [
      `.left-side .rll-youtube-player [data-id]`,
      `.left-side iframe[src*='spotify']`
    ].join(', ');
    const removeEmptyHTMLFrom = textSelector
    const socialSelector = [

    ].join(', ');
    const removeSelectors = [
      "[class*='icon-']",
      "[class*='fa-']",
      ".fa",
      ".production-title-wrapper",
      `${textSelector} img`,
      ".left-side noscript",
      '.left-side .rll-youtube-player'
    ].join(', ')
 
    const attributesToRemove = ['style', 'hidden', '_target', "frameborder", 'onclick', 'aria-hidden', 'allow', 'allowfullscreen', 'data-deferlazy','width', 'height'];
    const attributesToRemoveSecondRound = ['class', 'id' ];
    const removeHTMLWithStrings = ['Om deze content te kunnnen zien'];

    // eerst onzin attributes wegslopen
    const socAttrRemSelAdd = `${socialSelector ? `, ${socialSelector} *` : ''}`
    document.querySelectorAll(`${textSelector} *${socAttrRemSelAdd}`)
      .forEach(elToStrip => {
        attributesToRemove.forEach(attr => {
          if (elToStrip.hasAttribute(attr)){
            elToStrip.removeAttribute(attr)
          }
        })
      })

    // media obj maken voordat HTML verdwijnt
    res.mediaForHTML = Array.from(document.querySelectorAll(mediaSelector))
      .map(bron => {
        bron.className = ''
        // custom groene engel  
        if (bron.hasAttribute('data-id') && bron.hasAttribute('data-src') && bron.getAttribute('data-src').includes('youtube')){
          return {
            outer: null,
            src: bron.getAttribute('data-src'),
            id: bron.getAttribute('data-id'),
            type: 'youtube'
          }
        } else if(bron.src.includes('spotify')){
          return {
            outer: bron.outerHTML,
            src: bron.src,
            id: null,
            type: 'spotify'
          }
        }
        // end custom groene engel

        // terugval???? nog niet bekend met alle opties.
        return {
          outer: bron.outerHTML,
          src: bron.src,
          id: null,
          type: bron.src.includes('spotify') 
            ? 'spotify' 
            : bron.src.includes('youtube') 
              ? 'youtube'
              : 'bandcamp'
        }
      })

    // socials obj maken voordat HTML verdwijnt
    res.socialsForHTML = !socialSelector ? '' : Array.from(document.querySelectorAll(socialSelector))
      .map(el => {
        
        el.querySelectorAll('i, svg, img').forEach(rm => rm.parentNode.removeChild(rm))

        if (!el.textContent.trim().length){
          if (el.href.includes('facebook')){
            el.textContent = 'Facebook';
          } else if(el.href.includes('twitter')) {
            el.textContent = 'Tweet';
          } else {
            el.textContent = 'Onbekende social';
          }
        }
        el.className = ''
        el.target = '_blank';
        return el.outerHTML
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
    document.querySelectorAll(`${textSelector} *`)
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
  })
  
}
// #endregion                        LONG HTML