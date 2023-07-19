import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import axios from "axios";
import makeScraperConfig from "./gedeeld/scraper-config.js";
import * as _t from "../mods/tools.js";

// SCRAPER CONFIG

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
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  }
}));

defluxScraper.listenToMasterThread();

defluxScraper.singleMergedEventCheck = async function (event) {
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


// MAKE BASE EVENTS

defluxScraper.makeBaseEventList = async function () {
 
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }   

  const {stopFunctie} = await this.makeBaseEventListStart()

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
    const title = axiosResultSingle.title.rendered;
    const res = {
      pageInfo: `<a class='pageinfo' href="${this.puppeteerConfig.app.mainPage.url}">${workerData.family} main - ${title}</a>`,
      errors: [],
      venueEventUrl: axiosResultSingle.link,
      id: axiosResultSingle.id,
      title,
    };    
    return res;
  })
    .map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );

};

// GET PAGE INFO

defluxScraper.getPageInfo = async function ({ page, event}) {
 
  const {stopFunctie} =  await this.getPageInfoStart()

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

    res.image = eventScheme.querySelector('[itemprop="image"]')?.getAttribute('content') ?? '';
    if (!res.image){
      res.errors.push({
        remarks: `image missing ${res.pageInfo}`
      })
    }    
    try {
      res.startDate = eventScheme.querySelector('[itemprop="startDate"]')?.getAttribute('content').split('T')[0].split('-').map(dateStuk => dateStuk.padStart(2, '0')).join('-')
      res.startTime = document.querySelector('.evcal_time.evo_tz_time').textContent.match(/\d\d:\d\d/)[0];
      res.startDateTime = new Date(`${res.startDate}T${res.startTime}:00`).toISOString()
    } catch (caughtError) {
      res.errors.push({error: caughtError, remarks: `starttime match ${res.pageInfo}`})
    }

    if (document.querySelector('.evcal_desc3')?.textContent.toLowerCase().includes('deur open') ?? false) {
      try {
        res.endTime = document.querySelector('.evcal_desc3').textContent.match(/\d\d:\d\d/)[0];
        res.endDateTime = new Date(`${res.startDate}T${res.endTime}:00`).toISOString();
      } catch (caughtError) {
        res.errors.push({error: caughtError, remarks: `door open starttime match ${res.pageInfo}`,toDebug:res})
      }
    }

    // TODO sold out flux
    
    res.price = eventScheme.querySelector('[itemprop="event-price"]')?.getAttribute('content') ?? '';





    // #region [rgba(100, 0, 0, 0.3)] longHTML

    const textSelector = '.eventon_desc_in';
    const mediaSelector = [`.eventon_list_event iframe` 
    ].join(', ');
    const removeEmptyHTMLFrom = textSelector
    const socialSelector = [
      '.FacebookShare a',
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

    // #endregion longHTML





    return res;
  }, {event});

  return await this.getPageInfoEnd({pageInfo, stopFunctie})

};
