import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import { neushoornMonths } from "../mods/months.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

//#region [rgba(0, 60, 0, 0.3)]       SCRAPER CONFIG
const neushoornScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    singlePage: {
      timeout: 20000
    },
    app: {
      mainPage: {
        url: "https://neushoorn.nl/#/search?category=Heavy",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'start']
      }
    }
  }
}));
//#endregion                          SCRAPER CONFIG

neushoornScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.3)]      RAW EVENT CHECK
neushoornScraper.singleRawEventCheck = async function(event){

  const workingTitle = this.cleanupEventTitle(event.title);

  const isRefused = await this.rockRefuseListCheck(event, workingTitle)
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused
  }

  const isAllowed = await this.rockAllowListCheck(event, workingTitle)
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  if (hasForbiddenTerms.success) {
    this.saveRefusedTitle(workingTitle)
    hasForbiddenTerms.success = false;
    return hasForbiddenTerms
  }

  const hasGoodTermsRes = await this.hasGoodTerms(event);
  if (hasGoodTermsRes.success) {
    this.saveAllowedTitle(workingTitle)
    return hasGoodTermsRes;
  }

  let overdinges = null;
  if (workingTitle.match(/\s[-–]\s/)) {
    const a = workingTitle.replace(/\s[-–]\s.*/,'');
    overdinges = [a]
  }

  const isRockRes = await this.isRock(event, overdinges);
  if (isRockRes.success){
    this.saveAllowedTitle(workingTitle)
  } else {
    this.saveRefusedTitle(workingTitle)
  }
  return isRockRes;

}
//#endregion                          RAW EVENT CHECK

//#region [rgba(0, 180, 0, 0.3)]      SINGLE EVENT CHECK
//#endregion                          SINGLE EVENT CHECK

//#region [rgba(0, 240, 0, 0.3)]      MAIN PAGE
neushoornScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.mainPageEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }  

  const {stopFunctie, page} = await this.mainPageStart()

  try {
    await page.waitForSelector(".productions__item", {
      timeout: this.singlePageTimeout,
    });
    await _t.waitTime(50);
  } catch (caughtError) {
    _t.handleError(caughtError, workerData, `Laad en klikwachten timeout neushoorn`, 'close-thread', null);
    return await this.mainPageEnd({
      stopFunctie, page, rawEvents:[]}
    );
  }

  let rawEvents = await page.evaluate(({workerData,unavailabiltyTerms}) => {
    return Array.from(document.querySelectorAll(".productions__item"))
      .map(
        (eventEl) => {
        
          const title = eventEl.querySelector(
            ".productions__item__content span:first-child"
          ).textContent;
          const res = {
            pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],          
            title
          }  
          res.shortText = eventEl.querySelector('.productions__item__subtitle')?.textContent ?? '';
          res.venueEventUrl = eventEl.href;
          const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
          res.unavailable = !!eventEl.textContent.match(uaRex);          
          res.soldOut = !!eventEl.querySelector(".chip")?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;
          return res;
        }
      );
  }, {workerData,unavailabiltyTerms: AbstractScraper.unavailabiltyTerms})
    
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.mainPageEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
};
//#endregion                          MAIN PAGE

//#region [rgba(120, 0, 0, 0.3)]     SINGLE PAGE
neushoornScraper.singlePage = async function ({ page,event }) {
  
  const {stopFunctie} =  await this.singlePageStart()
  
  const pageInfo = await page.evaluate(
    ({ months, event }) => {
      const res = {
        pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
        errors: [],
      };

      const dateTextcontent =
        document.querySelector(".summary .summary__item:first-child")
          ?.textContent ?? "";
      const dateTextMatch = dateTextcontent.match(/\w+\s?(\d+)\s?(\w+)/);

      if (dateTextMatch && dateTextMatch.length === 3) {
        //
        const month = months[dateTextMatch[2]];
        const curM = new Date().getMonth() + 1;
        let year = new Date().getFullYear();
        if (month < curM) {
          year = year + 1;
        }
        const day = dateTextMatch[1].padStart(2, "0");
        res.startDate = `${year}-${month}-${day}`;
      } else {
        res.errors.push({
          remarks: `geen startDate ${res.pageInfo}`,
          toDebug:{
            text:  document.querySelector(".summary .summary__item:first-child")
              ?.textContent,
          }
        })
      }

      const timeTextcontent =
        document.querySelector(".summary .summary__item + .summary__item")
          ?.textContent ?? "";
      const timeTextMatch = timeTextcontent.match(
        /(\d{2}:\d{2}).*(\d{2}:\d{2})/
      );
      if (timeTextMatch && timeTextMatch.length === 3 && res.startDate) {
        res.door = new Date(
          `${res.startDate}T${timeTextMatch[1]}`
        ).toISOString();
        res.start = new Date(
          `${res.startDate}T${timeTextMatch[2]}`
        ).toISOString();
      } else {
        res.start = new Date(
          `${res.startDate}T${timeTextMatch[1]}`
        ).toISOString();
      }

      try {
        const summaryEl = document.querySelector(".content .summary");
        const longEl = summaryEl.parentNode;
        longEl.removeChild(summaryEl);
        res.longTextHTML = longEl.innerHTML;
      } catch (caughtError) {
        res.errors.push({
          error: caughtError,
          remarks: `longTextHTML faal ${res.pageInfo}`, 
          toDebug: {
            event
          }
        });
      }

      return res;
    },
    { months: neushoornMonths, event }
  );

  const imageRes = await this.getImage({page, event, pageInfo, selectors: [".header--theatre"], mode: 'background-src' })
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;  

  const priceRes = await this.getPriceFromHTML({page, event, pageInfo, selectors: [".prices__item__price", ".prices"], });
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

      
    const textSelector = 'sidebar + .content';
    const mediaSelector = [".responsive-embed iframe, .tophits iframe"].join(", ");
    const removeEmptyHTMLFrom = textSelector;
    const socialSelector = [
      ".links-list__link[href*='facebook'][href*='events']"
    ].join(", ");
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
      `${textSelector} .responsive-embed`,
      `${textSelector} .summary`,

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
      
    
      if (bron.hasAttribute('src') && bron.getAttribute('src').includes('youtube')) {
        return {
          outer: bron.outerHTML,
          src: bron.src,
          id: null,
          type: "youtube",
        };
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