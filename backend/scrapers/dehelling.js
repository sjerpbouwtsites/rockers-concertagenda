import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

//#region [rgba(0, 60, 0, 0.3)]       SCRAPER CONFIG
const dehellingScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 30010,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 20011,
    },
    singlePage: {
      timeout: 10012
    },
    app: {
      mainPage: {
        url: "https://dehelling.nl/agenda/?zoeken=&genre%5B%5D=heavy",
        requiredProperties: ['venueEventUrl', 'title', 'start']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'start'],
        longHTMLnewStyle: true
      }
    }
  
  }
}));
//#endregion                          SCRAPER CONFIG

dehellingScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.3)]      RAW EVENT CHECK
//#endregion                          RAW EVENT CHECK

//#region [rgba(0, 180, 0, 0.3)]      SINGLE EVENT CHECK
dehellingScraper.singleMergedEventCheck = async function (event) {
  const tl = this.cleanupEventTitle(event.title);

  const isRefused = await this.rockRefuseListCheck(event, tl)
  if (isRefused.success) {
    return {
      reason: isRefused.reason,
      event,
      success: false
    }
  }

  const isAllowed = await this.rockAllowListCheck(event, tl)
  if (isAllowed.success) {
    return isAllowed;  
  }

  return {
    event,
    success: true,
    reason: "nothing found currently",
  };
};
//#endregion                          SINGLE EVENT CHECK

//#region [rgba(0, 240, 0, 0.3)]      BASE EVENT LIST
dehellingScraper.makeBaseEventList = async function () { 

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }   

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  let rawEvents = await page.evaluate(({workerData}) => {
    return Array.from(
      document.querySelectorAll(
        '.c-event-card'
      )
    )
      .filter(eventEl => {
        // TODO naar fatsoenlijke async check
        const tc = eventEl.querySelector('.c-event-card__meta')?.textContent.toLowerCase() ?? '';
        return !tc.includes('experimental') && !tc.includes('hiphop')
      })
      .map((eventEl) => {
      
        const schemaData = JSON.parse(eventEl.querySelector('[type="application/ld+json"]').innerHTML) 
        const title = schemaData?.name

        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title,
        };      

        try {
          res.end = new Date(schemaData.endDate.replace(' ','T')).toISOString();
        } catch (caughtError) {
          res.errors.push({error: caughtError, remarks: `end date time datestring omzetting ${title} ${res.pageInfo}`,toDebug:res})        
        }
        res.image = schemaData?.image ?? null;
        if (!res.image){
          res.errors.push({
            remarks: `image missing ${res.pageInfo}`
          })
        }
        let startString;
        try {
          const metaEl = eventEl.querySelector('.c-event-card__meta') ?? null;
          if (metaEl) {
            const tijdMatch = metaEl.textContent.match(/(\d\d):(\d\d)/);
            if (tijdMatch && tijdMatch.length > 2) {
              res.startTime = tijdMatch[0]
              const hours = tijdMatch[1];
              const minutes = tijdMatch[2];
              startString = res.end.replace(/T.*/, `T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00`);
              res.start = new Date(startString).toISOString();
            }
          }
        } catch (caughtError) {
          res.errors.push({error: caughtError, remarks: `start date time eruit filteren error \n ${res.end} \n ${startString} ${title} ${res.pageInfo}`,toDebug:res})        
        }

        res.soldOut = !!eventEl.querySelector('.c-event-card__banner--uitverkocht');

        if (!res.startTime && res.end) {
          res.start = res.end;
          res.end = null;
        } 

        res.venueEventUrl = schemaData.url
        res.shortText = schemaData?.description ?? null;

        return res;
      })},{workerData})

  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
  
};
//#endregion                          BASE EVENT LIST



// GET PAGE INFO

dehellingScraper.getPageInfo = async function ({ page,event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(
    ({event}) => {
      const res = {
        pageInfo: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
        errors: [],
      };
      const lineupEl = document.querySelector('.c-event-content__lineup');
      if (lineupEl){
        const lineup = Array.from(document.querySelectorAll('.u-section__inner.c-event-content__lineup li'))
          .map(li=> li.textContent)
          .join(', ');

        res.shortText = `${event.shortText}. Lineup: ${lineup}`;
        lineupEl.parentNode.removeChild(lineupEl)
      }
      const shareEl = document.querySelector('.c-event-content__sharer');
      if (shareEl){
        shareEl.parentNode.removeChild(shareEl)
      }

      return res;
    },
    {event}
  );

  const priceRes = await this.getPriceFromHTML({page, event, pageInfo, selectors: ['.c-event-meta__table'], });
  pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
  pageInfo.price = priceRes.price;  


  const longTextRes = await longTextSocialsIframes(page)
  for (let i in longTextRes){
    pageInfo[i] = longTextRes[i]
  }

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page, event})
  
}

// #region [rgba(60, 0, 0, 0.5)]     LONG HTML
async function longTextSocialsIframes(page){

  return await page.evaluate(()=>{
    const res = {}

    const textSelector = '.c-event-content__text';
    const mediaSelector = [`.c-event-content__embeds iframe` 
    ].join(', ');
    const removeEmptyHTMLFrom = textSelector
    const socialSelector = [
      '.FacebookShare a',
      `${textSelector} img`,
      '.Twitter a'
    ].join(', ');
    const removeSelectors = [
      '.fa'
    ].join(', ')
    
    const attributesToRemove = ['style', 'hidden', '_target', "frameborder", 'onclick', 'aria-hidden'];
    const attributesToRemoveSecondRound = ['class', 'id' ];
    const removeHTMLWithStrings = [];

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

        // custom dehelling
        if (!bron.hasAttribute('src') && bron.hasAttribute('data-src')){
          bron.src = bron.getAttribute('data-src');
          bron.removeAttribute('data-src');
        }
        // endcustom

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

        if (!el.textContent.trim().length){
          if (el.href.includes('facebook')){
            el.textContent = 'Facebook';
          } else if(el.href.includes('twitter')) {
            el.textContent = 'Tweet';
          } else {
            el.textContent = 'Onbekende social';
          }
        }          
        el.className = 'long-html__social-list-link'
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