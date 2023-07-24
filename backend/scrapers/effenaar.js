import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

//#region [rgba(0, 60, 0, 0.3)]       SCRAPER CONFIG
const effenaarScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 30013,
    },
    singlePage: {
      timeout: 15014
    },
    app: {
      mainPage: {
        url: 'https://www.effenaar.nl/agenda?genres.title=heavy',
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  }
}));
//#endregion                          SCRAPER CONFIG

effenaarScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.3)]      RAW EVENT CHECK
//#endregion                          RAW EVENT CHECK

//#region [rgba(0, 180, 0, 0.3)]      SINGLE EVENT CHECK
effenaarScraper.singleMergedEventCheck = async function(event){
 
  const workingTitle = this.cleanupEventTitle(event.title)

  const isRefused = await this.rockRefuseListCheck(event, workingTitle)
  if (isRefused.success) return {
    reason: isRefused.reason,
    event,
    success: false
  };
  
  const isAllowed = await this.rockAllowListCheck(event, workingTitle)
  if (isAllowed.success) return isAllowed;
  
  return {
    event,
    success: true,
    reason: "nothing found currently",
  };
  
}
//#endregion                          SINGLE EVENT CHECK

//#region [rgba(0, 240, 0, 0.3)]      BASE EVENT LIST
effenaarScraper.makeBaseEventList = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }    

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  let rawEvents = await page.evaluate(
    ({workerData}) => {
      return Array.from(
        document.querySelectorAll(".search-and-filter .agenda-card")
      )
        .map((eventEl) => {
          const title = eventEl.querySelector(".card-title")?.textContent.trim();
          const res = {
            pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],          
            title
          }
          res.shortText = eventEl.querySelector(".card-subtitle")?.textContent ?? '';
          res.venueEventUrl = eventEl?.href ?? null;
          res.soldOut = !!eventEl.querySelector('.card-content .card-status')?.innerHTML.match(/uitverkocht|sold\s?out/i) ?? null;
          return res;
        });
    },
    {workerData}
  )
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
};
//#endregion                          BASE EVENT LIST


// GET PAGE INFO

effenaarScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()

  await page.waitForSelector(".event-bar-inner-row");

  const pageInfo = await page.evaluate(({months, event}) => {
    const res = {
      pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
      errors: [],
    };
    res.image = document.querySelector(".header-image img")?.src ?? null;
    if (!res.image){
      res.errors.push({
        remarks: `image missing ${res.pageInfo}`
      })
    }  
    res.priceTextcontent = 
      document.querySelector(".tickets-btn")?.textContent ?? '';

    const dateText =
        document.querySelector(".header-meta-date")?.textContent.trim() ?? "";
    if (!dateText) {
      res.errors.push({
        remarks: `geen datumtext ${res.pageInfo}`,
      })
      res.corrupted = 'geen datum tekst';
    } else {
      const [, dayNumber, monthName, year] = dateText.match(
        /(\d+)\s(\w+)\s(\d\d\d\d)/
      );
      const fixedDay = dayNumber.padStart(2, "0");
      const monthNumber = months[monthName];
      res.startDate = `${year}-${monthNumber}-${fixedDay}`;
    }

    let startTimeAr = [],
      doorTimeAr = [];
    if (res.startDate){
      startTimeAr = document
        .querySelector(".time-start-end")
        ?.textContent.match(/\d\d:\d\d/);
      if (Array.isArray(startTimeAr) && startTimeAr.length) {
        res.startTime = startTimeAr[0];
      }
      doorTimeAr = document
        .querySelector(".time-open")
        ?.textContent.match(/\d\d:\d\d/);
      if (Array.isArray(doorTimeAr) && doorTimeAr.length) {
        res.doorTime = doorTimeAr[0];
      }
      res.startDateTimeString = `${res.startDate}T${res.startTime}:00`;
      res.openDoorDateTimeString = `${res.startDate}T${res.doorTime}:00`;
    }

  
    try {
      if (res.doorTime) {
        res.doorOpenDateTime = new Date(
          `${res.openDoorDateTimeString}`
        ).toISOString();
      }

      if (res.startTime) {
        res.startDateTime = new Date(
          `${res.startDateTimeString}`
        ).toISOString();
      }
    } catch (caughtError) {
      res.errors.push({
        error: caughtError,
        remarks: `omzetten naar Date iso gaat fout ${res.pageInfo}`,
        toDebug: {
          ars: `${startTimeAr.join("")} ${doorTimeAr.join("")}`,
          res, event
        }
      });
    }

    return res;
  },{ months: this.months,event});

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

    const textSelector = '#main .blocks .block';
    const mediaSelector = [`#main .blocks iframe` 
    ].join(', ');
    const removeEmptyHTMLFrom = textSelector
    const socialSelector = [
      ".external-link a[href*='facebook']",
      ".external-link a[href*='instagram']"
    ].join(', ');
    const removeSelectors = [
      "[class*='icon-']",
      "[class*='fa-']",
      ".fa",
      ".heeft-embed",
      ".heeft-cta"
    ].join(', ')
  
    const attributesToRemove = ['style', 'hidden', '_target', "frameborder", 'onclick', 'aria-hidden', 'allow', 'allowfullscreen', 'data-deferlazy','width', 'height'];
    const attributesToRemoveSecondRound = ['class', 'id' ];
    const removeHTMLWithStrings = [];

    //custom effenaar
    document.querySelectorAll('#main .blocks .block').forEach(
      block => {
        if (block.querySelector('.embed')) block.classList.add('heeft-embed')
        if (block.querySelector('.cta')) block.classList.add('heeft-cta')
      } 
    )
    //end custom effenaar

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
        bron.className = ''
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