import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";
import ErrorWrapper from "../mods/error-wrapper.js";

//#region [rgba(0, 33, 0, 0.3)]       SCRAPER CONFIG
const doornroosjeScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 60000,
      waitUntil: 'load'
    },
    singlePage: {
      timeout: 35000
    },
    app: {
      mainPage: {
        url: "https://www.doornroosje.nl/?genre=metal%252Cpunk%252Cpost-hardcore%252Chardcore%252Cnoise-rock",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  }
}));
//#endregion                          SCRAPER CONFIG

doornroosjeScraper.listenToMasterThread();

// MERGED ASYNC CHECK

doornroosjeScraper.singleMergedEventCheck = async function (event) {

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

  const hasForbiddenTerms = await this.hasForbiddenTerms(event, ['longTextHTML', 'shortText', 'title'])
  if (hasForbiddenTerms.success){
    await this.saveRefusedTitle(tl);
    return {
      reason: hasForbiddenTerms.reason,
      event,
      success: false
    }
  }

  await this.saveAllowedTitle(tl);

  return {
    event,
    success: true,
    reason: "nothing found currently",
  };
};

// MAKE BASE EVENTS

doornroosjeScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }  
  
  const {stopFunctie, page} = await this.makeBaseEventListStart()

  await page.waitForSelector(".c-program__title");
  await _t.waitFor(50);

  let rawEvents = await page.evaluate(({workerData, months}) => {
    return Array.from(document.querySelectorAll(".c-program__item"))
      .map((eventEl) => {
        const title =
          eventEl.querySelector(".c-program__title")?.textContent.trim() ??
          eventEl.querySelector("h1,h2,h3")?.textContent.trim() ?? null;
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} - main - ${title}</a>`,
          errors: [],
          title
        };
        res.shortText = 
          eventEl
            .querySelector(".c-program__content")
            ?.textContent.trim()
            .replace(res.title, "") ?? '';
        res.venueEventUrl = eventEl?.href;
        res.soldOut = !!eventEl?.innerHTML.match(/uitverkocht|sold\s?out/i) ?? false;
        const startJaarMatch = eventEl.parentNode.parentNode.querySelector('.c-program__month')?.textContent.match(/\d\d\d\d/) ?? null;
        const jaar = (Array.isArray(startJaarMatch) && startJaarMatch.length) ? startJaarMatch[0] : (new Date()).getFullYear()
        const maandNaam = eventEl.parentNode.parentNode.querySelector('.c-program__month')?.textContent.match(/\w*/) ?? null;
        const maand = months[maandNaam];
        const dagMatch = eventEl.querySelector('.c-program__date')?.textContent.match(/\d+/);
        let dag;
        if (dagMatch && Array.isArray(dagMatch) && dagMatch.length){
          dag = dagMatch[0].padStart(2, '0');
        }
        if (dag && maand && jaar){
          res.startDate = `${jaar}-${maand}-${dag}`;
        } else {
          res.startDate = null;
        }
        return res;
      });
  }, {workerData, months: this.months})

  try {
    let lastWorkingEventDate = null;
    rawEvents.forEach((rawEvent) => {
      if (rawEvent.startDate) {
        lastWorkingEventDate = rawEvent.startDate;
      } else {
        rawEvent.startDate = lastWorkingEventDate;
      }
      return rawEvent
    })    
  } catch (dateMapError) {
    _t.wrappedHandleError(new ErrorWrapper({
      workerData, 
      error: dateMapError,
      remarks: 'startDate rawEvents mapper'
    }));
  }


  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );

};

// GET PAGE INFO

doornroosjeScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()

  let pageInfo;
  if (!event.venueEventUrl.includes('soulcrusher') && !event.venueEventUrl.includes('festival')){
    pageInfo = await page.evaluate(({months, event}) => {
      const res = {
        pageInfo: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
        errors: [],
      };
      res.image =
        document.querySelector(".c-header-event__image img")?.src ?? null;
      if (!res.image){
        res.errors.push({
          remarks: `image missing ${res.pageInfo}`
        })
      }
      res.priceTextcontent = 
        document.querySelector(".c-btn__price")?.textContent.trim() ?? '';



      // genre verwijderen en naar shorttext
      res.shortText = (event?.shortText ? event.shortText : '') + 
      Array.from(document.querySelectorAll('.c-event-row__title')).map(title => {
        if (title.textContent.includes('genre')){
          const row = title.parentNode.parentNode;
          return row.querySelector('.c-event-row__content')?.textContent.toLowerCase().trim();
        }
      })
        .filter(a=>a)
        .join('')

      const startDateRauwMatch = document
        .querySelector(".c-event-data")
        ?.innerHTML.match(
          /(\d{1,2})\s*(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s*(\d{4})/
        ); // welke mongool schrijft zo'n regex
      let startDate = event.startDate || null;
      if (!startDate && startDateRauwMatch && startDateRauwMatch.length) {
        const day = startDateRauwMatch[1];
        const month = months[startDateRauwMatch[2]];
        const year = startDateRauwMatch[3];
        startDate = `${year}-${month}-${day}`;
      } else if (!startDate){
        res.errors.push({
          remarks: `Geen startdate ${res.pageInfo}`,
          toDebug: {
            text: document
              .querySelector(".c-event-data")
              ?.innerHTML
          }
        })
        return res;
      }
  
      if (startDate) {
        let timeMatches = document
          .querySelector(".c-event-data")
          .innerHTML.match(/\d\d:\d\d/g);
  
        if (!timeMatches) {
          timeMatches = ['12:00:00']
        }

        if (timeMatches && timeMatches.length) {
          try {
            if (timeMatches.length === 3){
              res.startDateTime = new Date(
                `${startDate}:${timeMatches[1]}`
              ).toISOString();
              res.doorOpenDateTime = new Date(
                `${startDate}:${timeMatches[0]}`
              ).toISOString();
              res.endDateTime = new Date(
                `${startDate}:${timeMatches[2]}`
              ).toISOString();                            
            } else if (timeMatches.length == 2) {
              res.startDateTime = new Date(
                `${startDate}:${timeMatches[1]}`
              ).toISOString();
              res.doorOpenDateTime = new Date(
                `${startDate}:${timeMatches[0]}`
              ).toISOString();
            } else if (timeMatches.length == 1) {
              res.startDateTime = new Date(
                `${startDate}:${timeMatches[0]}`
              ).toISOString();
            }
          } catch (caughtError) {
            res.errors.push({
              error: caughtError,
              remarks:
                `fout bij tijd of datums. matches: ${timeMatches} datum: ${startDate} ${res.pageInfo}`,
            });
            return res;
          }
        }
      }


      // #region [rgba(100, 0, 0, 0.3)] longHTML

      const textSelector = '.s-event__container .c-intro, .s-event__container .s-event__content';
      const mediaSelector = [`.c-embed iframe` 
      ].join(', ');
      const removeEmptyHTMLFrom = textSelector
      const socialSelector = [
        ".c-btn--facebook",
        ".c-btn--twitter",
      ].join(', ');
      const removeSelectors = [
        "[class*='icon-']",
        "[class*='fa-']",
        ".fa"
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
    }, {months: this.months, event});
  } else { // dus festival
    pageInfo = await page.evaluate(({event}) => {
      const res = {
        pageInfo: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
        errors: [],
      };
      if (event.venueEventUrl.includes('soulcrusher')){
        res.startDateTime = new Date('2023-10-13T18:00:00.000Z').toISOString();
      } else {
        try {
          res.startDateTime = new Date(`${event?.startDate}T12:00:00`).toISOString();
        } catch (thisError) {
          const errorString = `fout bij tijd/datum festival of datums`; 
          res.errors.push({
            remarks: errorString,
          });        
          return res;
        }
      }
      res.image =
        document.querySelector(".c-festival-header__logo img")?.src ?? null;
      if (!res.image){
        res.errors.push({
          remarks: `image missing ${res.pageInfo}`
        })
      }

      res.priceTextcontent = 
        document.querySelector(".b-festival-content__container")?.textContent.trim() ?? '';
      
      res.textForHTML = (document.querySelector(".b-festival-content__container")?.innerHTML ?? '') + 
        (document.querySelector('.b-festival-line-up__grid')?.innerHTML ?? '')
      res.mediaForHTML = Array.from(document.querySelectorAll(".c-embed iframe"))
        .map(embed => embed.outerHTML)
      res.socialsForHTML = [];
      
  
      if (document.querySelector('.b-festival-line-up__title')) {
        const lineupRedux = Array.from(document.querySelectorAll('.b-festival-line-up__title'))
          .map(title => title.textContent)
          .join(', ');
        res.shortText += ' Met oa: '+lineupRedux
      }


      return res;
    }, {event});
  }
  
  return await this.getPageInfoEnd({pageInfo, stopFunctie, page, event})

};
