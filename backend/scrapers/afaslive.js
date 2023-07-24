import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

//#region [rgba(0, 60, 0, 0.3)]       SCRAPER CONFIG
const afasliveScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 40000,
  workerData: Object.assign({}, workerData),
  hasDecentCategorisation: false,
  puppeteerConfig: {
    mainPage: {
      timeout: 60043,
    },
    singlePage: {
      timeout: 20000
    },
    app: {
      mainPage: {
        url: "https://www.afaslive.nl/agenda",
        requiredProperties: ['venueEventUrl']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'startDateTime']
      }      
    }
  }
}));
//#endregion                          SCRAPER CONFIG

afasliveScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.3)]      RAW EVENT CHECK
afasliveScraper.singleRawEventCheck = async function(event){

  const workingTitle = this.cleanupEventTitle(event.title)

  const isRefused = await this.rockRefuseListCheck(event, workingTitle)
  if (isRefused.success) return {
    reason: isRefused.reason,
    event,
    success: false
  };

  const isAllowed = await this.rockAllowListCheck(event, workingTitle)
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTerms = await this.hasForbiddenTerms(event, ['title']);
  if (hasForbiddenTerms.success) {
    await this.saveRefusedTitle(workingTitle)
    return {
      reason: hasForbiddenTerms.reason,
      success: false,
      event
    }
  }

  const isRockRes = await this.isRock(event);
  if (isRockRes.success){
    await this.saveAllowedTitle(workingTitle)
  } else {
    await this.saveRefusedTitle(workingTitle)
  }
  return isRockRes;

  // return {
  //   reason: [isRefused.reason, isAllowed.reason, hasForbiddenTerms.reason].join(';'),
  //   event,
  //   success: true
  // }
}
//#endregion                          RAW EVENT CHECK

//#region [rgba(0, 180, 0, 0.3)]      SINGLE EVENT CHECK
//#endregion                          SINGLE EVENT CHECK

//#region [rgba(0, 240, 0, 0.3)]      BASE EVENT LIST
afasliveScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index);
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }  
  
  const {stopFunctie, page} = await this.makeBaseEventListStart()

  await _t.autoScroll(page);
  await _t.waitFor(750);
  
  await _t.autoScroll(page);
  await _t.waitFor(750);

  await _t.autoScroll(page);
  await _t.waitFor(750);

  await _t.autoScroll(page);
  await _t.waitFor(750);

  await _t.autoScroll(page);
  await _t.waitFor(750);
  
  await _t.autoScroll(page); // TODO hier wat aan doen. maak er een do while van met een timeout. dit is waardeloos.

  let rawEvents = await page.evaluate(({workerData}) => {
    return Array.from(document.querySelectorAll(".agenda__item__block "))
      .map((agendaBlock) => {
        const title = agendaBlock.querySelector(".eventTitle")?.textContent ?? "";
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],          
          title
        }
        res.venueEventUrl = agendaBlock.querySelector("a")?.href ?? null;
        res.image = agendaBlock.querySelector("img")?.src ?? null;
        res.soldOut = !!agendaBlock?.innerHTML.match(/uitverkocht|sold\s?out/i) ?? false;
        return res;
      })
      .filter(event => {
        return !event.title.toLowerCase().includes('productiedag')
      });
  }, {workerData})
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);
    
  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index);
  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents: thisWorkersEvents}
  );
};
//#endregion                          BASE EVENT LIST

afasliveScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()

  await _t.waitFor(250);

  const pageInfo = await page.evaluate(
    ({ months,event }) => {
      const res = {
        pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
        errors: [],
      };

      const timeTableEl = document.querySelector('.timetable')
      if (timeTableEl){
        const tijdenMatch = document.querySelector('.timetable')?.textContent.match(/\d\d:\d\d/);
        if (Array.isArray(tijdenMatch) && tijdenMatch.length){
          res.startTime = tijdenMatch[0];
        } 
      } else {
        const startEl = document.querySelector(
          ".eventInfo .tickets ~ p.align-mid ~ p.align-mid"
        );
        if (startEl) {
          const startmatch = startEl.textContent.match(/\d\d:\d\d/);
          if (startmatch && Array.isArray(startmatch) && startmatch.length) {
            res.startTime = startmatch[0];
          } else {
            res.errors.push({
              remarks: `Geen start tijd`,
              toDebug: {
                startDateText: startEl.textContent
              }
            })  
            return res;          
          }
        } else {
          res.errors.push({
            remarks: `geen startTime gevonden`,
            toDebug: {
              heeftTimeTable: !!document.querySelector('.timetable'),
              heeftStartEl: !!document.querySelector(
                ".eventInfo .tickets ~ p.align-mid ~ p.align-mid"
              )
            }
          })     
        }
      }

      if (document
        .querySelector(".eventTitle")
        ?.parentNode.querySelector("time")
        ?.textContent.match(/(\d+)\s+(\w+)\s+(\d\d\d\d)/)) {
        const startDateMatch =
        document
          .querySelector(".eventTitle")
          ?.parentNode.querySelector("time")
          ?.textContent.match(/(\d+)\s+(\w+)\s+(\d\d\d\d)/) ?? null;
        if (
          startDateMatch &&
        Array.isArray(startDateMatch) &&
        startDateMatch.length > 3
        ) {
          res.startDate = `${startDateMatch[3]}-${months[startDateMatch[2]]}-${
            startDateMatch[1]
          }`;
        } else {
          res.errors.push({
            remarks: `geen startdate`,
            toDebug: {
              startDateText: document
                .querySelector(".eventTitle")
                ?.parentNode.querySelector("time")
                ?.textContent
            }
          })        
          return res;
        }

        const doorEl = document.querySelector(
          ".eventInfo .tickets ~ p.align-mid"
        );
        if (doorEl) {
          const doormatch = doorEl.textContent.match(/\d\d:\d\d/);
          if (doormatch && Array.isArray(doormatch) && doormatch.length) {
            res.doorTime = doormatch[0];
          }
        }
      } else {
        res.heeftEventTitleMatch = false;
      } // alternatieve mogelijk legacy startDate

      try {
        if (res.startTime) {
          res.startDateTime = new Date(
            `${res.startDate}T${res.startTime}:00`
          ).toISOString();
        }

        if (res.doorTime) {
          res.doorOpenDateTime = new Date(
            `${res.startDate}T${res.doorTime}:00`
          ).toISOString();
        }
      } catch (errorCaught) {
        res.errors.push({
          error: errorCaught,
          remarks: `merge time date ${res.pageInfo}`,
          toDebug: {start: res.startTime, date: res.startDate}
        });
        return res;
      }

      res.soldOut = !!(document.querySelector('#tickets .soldout') ?? null)

      document.querySelectorAll("article .wysiwyg p").forEach(paragraph =>{
        const anker = paragraph.querySelector('a') ?? null;
        if (!anker) return
        if (anker.href.includes('eten-drinken') || anker.href.includes('Tassenbeleid')){
          paragraph.innerHTML = '';
        }
      })

      res.priceTextcontent = 
        document.querySelector("#tickets")?.textContent.trim() ?? '';
      return res;
    },
    { months: this.months,event }
  );

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

    const mediaSelector = '.video iframe, .spotify iframe';
    const textSelector = 'article .wysiwyg';
    const removeEmptyHTMLFrom = 'article .wysiwyg';
    const removeSelectors = []
    const socialSelector = [];
    const attributesToRemove = ['style', 'hidden', '_target', "frameborder", 'onclick', 'aria-hidden'];
    const attributesToRemoveSecondRound = ['class', 'id' ];      
    const removeHTMLWithStrings = ['Tassenbeleid']
    res.mediaForHTML = Array.from(document.querySelectorAll(mediaSelector))
      .map(bron => {
        return {
          outer: bron.outerHTML,
          src: bron.src,
          id: null,
          type: bron.src.includes('spotify') ? 'spotify' : 'youtube'
        }
      })

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

    res.textForHTML = Array.from(document.querySelectorAll(textSelector))
      .map(el => el.innerHTML)
      .join('')
    return res;
  })
  
}
// #endregion                        LONG HTML