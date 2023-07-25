import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

//#region [rgba(0, 60, 0, 0.3)]       SCRAPER CONFIG
const p60Scraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 60020,
    },    
    singlePage: {
      timeout: 30021
    },
    app: {
      mainPage: {
        url: "https://p60.nl/agenda",
        requiredProperties: ['venueEventUrl', 'title', 'start']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'start']
      }
    }
  }
}));
//#endregion                          SCRAPER CONFIG

p60Scraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.3)]      RAW EVENT CHECK
p60Scraper.singleRawEventCheck = async function (event) {
  let workingTitle = this.cleanupEventTitle(event.title);
  const isRefused = await this.rockRefuseListCheck(event, workingTitle)
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }

  return {
    reason: [isRefused.reason].join(';'),
    event,
    workingTitle,
    success: true
  }

}
//#endregion                          RAW EVENT CHECK

//#region [rgba(0, 180, 0, 0.3)]      SINGLE EVENT CHECK
p60Scraper.singleMergedEventCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);
  
  const isAllowed = await this.rockAllowListCheck(event, workingTitle)
  if (isAllowed.success) {
    return isAllowed;  
  }

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  if (hasForbiddenTerms.success) {
    this.saveRefusedTitle(workingTitle)
    hasForbiddenTerms.success = false;
    return hasForbiddenTerms;
  }

  this.saveAllowedTitle(workingTitle)  

  return {
    workingTitle,
    reason: [isAllowed.reason, hasForbiddenTerms.reason].join(';'),
    event,
    success: true
  }
};
//#endregion                          SINGLE EVENT CHECK

//#region [rgba(0, 240, 0, 0.3)]      MAIN PAGE
p60Scraper.mainPage = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.mainPageEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  } 

  const {stopFunctie, page} = await this.mainPageStart()

  await _t.autoScroll(page);

  let rawEvents = await page.evaluate(({workerData, unavailabiltyTerms}) => {
    return Array.from(document.querySelectorAll(".views-infinite-scroll-content-wrapper > .p60-list__item-container")).filter(itemEl => {
      return !!itemEl.querySelector('[href*=ticketmaster]')
    }).map(
      (itemEl) => {
        const title = itemEl.querySelector(
          ".p60-list__item__title"
        )?.textContent.trim() ?? '';

        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title
        };

        const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
        res.unavailable = !!itemEl.textContent.match(uaRex);
        res.soldOut = itemEl?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;

        res.venueEventUrl = itemEl.querySelector('.field-group-link')?.href;

        const doorB = itemEl.querySelector('.p60-list__item__date time')?.getAttribute('datetime')
        try {
          res.door = new Date(doorB).toISOString();
        } catch (caughtError) {
          res.errors.push({error: caughtError, remarks: `openDoorDateTime omzetten ${doorB}`,         
          })
        }

        const startTime = itemEl.querySelector('.field--name-field-aanvang')?.textContent.trim();
        let startB ;
        if (res.door){
          startB = doorB.replace(/T\d\d:\d\d/, `T${startTime}`);
          try {
            res.start = new Date(startB).toISOString();
          } catch (caughtError) {
            res.errors.push({error: caughtError, remarks: `start omzetten ${startB}` })
          }
        }

        res.shortText = itemEl.querySelector('.p60-list__item__description')?.textContent.trim() ?? '';
        return res;
      }
    );
  }, {workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms})
    
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.mainPageEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
};
//#endregion                          MAIN PAGE

//#region [rgba(120, 0, 0, 0.3)]     SINGLE PAGE
p60Scraper.singlePage = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.singlePageStart()

  if (event.unavailable){
    return await this.singlePageEnd({pageInfo: {}, stopFunctie, page})
  }
  
  const pageInfo = await page.evaluate(
    () => {
      const res = {

        pageInfo: `<a class='page-info' href='${location.href}'>${document.title}</a>`,
        errors: [],
      };

      return res;
    }, null
  );

  const imageRes = await this.getImage({page, event, pageInfo, selectors: ["[property='og:image']"], mode: 'weird-attr' })
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;  

  const priceRes = await this.getPriceFromHTML({page, event, pageInfo, selectors: ['.event-info__price', '.content-section__event-info'], });
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

     
    const textSelector = '.block-system-main-block .group-header .container .kmtContent';
    const mediaSelector = [
      //`.slick-track iframe`,
      `.video-embed-field-lazy`,
      `iframe[src*='bandcamp']`,
      `iframe[src*='spotify']`,
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
      `${textSelector} iframe`,
      `${textSelector} .video-embed-field-lazy`,
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
      
      if (bron.hasAttribute('data-video-embed-field-lazy')){


        return {
          outer: bron.getAttribute('data-video-embed-field-lazy').match(/<ifr.*>/),
          src: null,
          id: null,
          type: 'youtube'
        }
      }


      //      terugval???? nog niet bekend met alle opties.
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