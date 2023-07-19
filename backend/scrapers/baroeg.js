import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

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
        requiredProperties: ['venueEventUrl', 'title', 'startDateTime']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'startDateTime']
      }      
    }    
  }
}));

// SINGLE RAW EVENT CHECK

baroegScraper.singleRawEventCheck = async function(event){

  const isRefused = await this.rockRefuseListCheck(event, event.title.toLowerCase())
  if (isRefused.success) return {
    reason: isRefused.reason,
    event,
    success: false
  };

  const isAllowed = await this.rockAllowListCheck(event, event.title.toLowerCase())
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  if (hasForbiddenTerms.success) {
    await this.saveRefusedTitle(event.title.toLowerCase())
    return {
      reason: hasForbiddenTerms.reason,
      success: false,
      event
    }
  }
 
  return {
    reason: 'nothing forbidden',
    success: true,
    event
  }  

}

baroegScraper.listenToMasterThread();

// MAKE BASE EVENTS

baroegScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }    

  const {stopFunctie, page} = await this.makeBaseEventListStart()

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
        if (title.match(/uitverkocht|sold\s?out/i)) {
          title = title.replace(/uitverkocht|sold\s?out/i,'').replace(/^:\s+/,'');
        }
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title
        };
        
        res.soldOut = title.match(/uitverkocht|sold\s?out/i) ?? false;
        res.shortText = eventEl.querySelector('.wp_theatre_prod_excerpt')?.textContent.trim() ?? null;
        res.shortText += categorieTeksten;
        res.image = eventEl.querySelector('.media .attachment-thumbnail')?.src ?? '';
        if (!res.image){
          res.errors.push({
            remarks: `geen image ${res.pageInfo}`,
            toDebug: {
              srcWaarinGezocht: eventEl.querySelector('.media .attachment-thumbnail')?.src
            }
          })
        }
        res.venueEventUrl =venueEventUrl;
        
        res.startDate = eventEl.querySelector('.wp_theatre_event_startdate')?.textContent.trim().substring(3,26).split('/').reverse() ?? null;
        if (!res.startDate) {
          res.errors.push({
            remarks: `geen startdate`,
            toDebug: {
              startDateText: eventEl.querySelector('.wp_theatre_event_startdate')?.textContent,
              res
            }
          })
          res.unavailable += 'geen startdate'
          return res;
        }
        const startYear = res.startDate[0].padStart(4, '20');
        const startMonth = res.startDate[1].padStart(2, '0');
        const startDay = res.startDate[2].padStart(2, '0');
        res.startDate = `${startYear}-${startMonth}-${startDay}`;
        res.startTime = eventEl.querySelector('.wp_theatre_event_starttime')?.textContent ?? null;
        if (!res.startTime){
          res.errors.push({
            remarks: 'geen startdatetime',
            toDebug: {
              startDateText: eventEl.querySelector('.wp_theatre_event_starttime')?.textContent,
              res
            }
          })
          return res;   
        }
        try{
          res.startDateTime = new Date(`${res.startDate}T${res.startTime}:00`).toISOString();
        } catch (errorCaught) {
          res.errors.push({
            error: errorCaught,
            remarks: `date omzetting error ${res.pageInfo}`,
            toDebug: res
          })
        }
        return res;
      })
  }, {workerData})
  rawEvents = rawEvents .map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents: thisWorkersEvents}
  );
};

// GET PAGE INFO

baroegScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()

  const pageInfo = await page.evaluate(
    ({event}) => {
      const res = {
        pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
        errors: [],
      };

      res.priceTextcontent =
        document.querySelector(".wp_theatre_event_tickets")?.textContent ??
        '';


      
      // #region [rgba(100, 0, 0, 0.3)] longHTML

      const mediaSelector = ['.su-youtube iframe', 
        '.su-spotify iframe', 
        '.su-bandcamp iframe',
        ".post-content h2 a[href*='bandcamp']",
        ".post-content h2 a[href*='spotify']",
      ].join(', ');
      const textSelector = '.post-content';
      const removeEmptyHTMLFrom = '.post-content';
      const removeSelectors = [`.post-content h3`, 
        `.post-content .wpt_listing`, 
        `.post-content .su-youtube`, 
        `.post-content .su-spotify`, 
        `.post-content .su-button`, 
        ".post-content h2 a[href*='facebook']",
        ".post-content h2 a[href*='instagram']",
        ".post-content h2 a[href*='bandcamp']",
        ".post-content h2 a[href*='spotify']",
        ".post-content .fa",
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
      document.querySelectorAll(`${textSelector} *, ${socialSelector} *`)
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
          el.target = '_blank'
          return el.outerHTML
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

      res.soldOut = !!(document.querySelector('.wp_theatre_event_tickets_status_soldout') ?? null)

      return res;
    }, {event}
    
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page, event})
  
};

