import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

//#region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const willemeeenScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),

  puppeteerConfig: {
    mainPage: {
      waitUntil: 'load'
    },
    app: {
      mainPage: {
        url: "https://www.willemeen.nl/programma/",
        requiredProperties: ['venueEventUrl', 'title', 'shortText', 'start']
      },
      singlePage: {
        requiredProperties: ['price']
      }
    }    
  }  
}));
//#endregion                          SCRAPER CONFIG

willemeeenScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.1)]      RAW EVENT CHECK
willemeeenScraper.singleRawEventCheck = async function (event) {
  let workingTitle = this.cleanupEventTitle(event.title);

  const isRefused = await this.rockRefuseListCheck(event, workingTitle)
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }

  const isAllowed = await this.rockAllowListCheck(event, workingTitle)
  if (isAllowed.success) {
    return isAllowed;
  }

  const hasGoodTerms = await this.hasGoodTerms(event)
  if (hasGoodTerms.success) {
    this.saveAllowedTitle(workingTitle)
    return hasGoodTerms;
  }

  const hasForbiddenTerms = await this.hasForbiddenTerms(event)
  if (hasForbiddenTerms.success) {
    this.saveRefusedTitle(workingTitle)
    hasForbiddenTerms.success = false;
    return hasForbiddenTerms;
  }

  return {
    workingTitle,
    reason: 'niets gevonden. Willemeen heeft altijd expliciete genres dus NEE',
    event,
    success: false
  }

}
//#endregion                          RAW EVENT CHECK

//#region [rgba(0, 180, 0, 0.1)]      SINGLE EVENT CHECK
//#endregion                          SINGLE EVENT CHECK

//#region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
willemeeenScraper.mainPage = async function () {
  
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.mainPageEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  } 

  const {stopFunctie, page} = await this.mainPageStart()

  // zet date op verschillende items
  await page.evaluate(()=>{
    document.querySelectorAll('.we__agenda-row').forEach(row => {
      const dateText = row.querySelector('.we__agenda-item-date')?.textContent;
      row.querySelectorAll('.we__agenda-item').forEach(rowItem => {
        rowItem.setAttribute('date-text', dateText)
      })
    })
  });

  let rawEvents = await page.evaluate(({workerData, months, unavailabiltyTerms}) => {
    return Array.from(document.querySelectorAll(".we__agenda-item"))
      .map((rawEvent) => {
        const title = rawEvent.querySelector('[data-text]')?.getAttribute('data-text') ?? '';
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title
        };        
        res.venueEventUrl = rawEvent.querySelector('.stretched-link')?.href ?? '';
        res.shortText = rawEvent.querySelector('.we__agenda-item-genre')?.textContent ?? null;
        res.startTime = rawEvent.querySelector('.we__agenda-item-info')?.textContent ?? null; 
        const dateText = rawEvent.getAttribute('date-text') ?? '';  
        const dateM = dateText.match(/(?<day>\d\d)\s+(?<monthletters>\w+)/) ?? null;
        if (Array.isArray(dateM) && dateM.length === 3){
          res.month = months[dateM[2]];
          res.year = new Date().getFullYear();
          res.day = dateM[1];
          const curM = new Date().getMonth() + 1;
          if (res.month < curM) {
            res.year = res.year + 1;
          }        
          res.start = `${res.year}-${res.month}-${res.day}T${res.startTime}:00`
        }
        
        const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
        res.unavailable = !!rawEvent.textContent.match(uaRex);
        res.soldOut = rawEvent?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;
        return res;
      });
  }, {workerData, months:this.months, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms})
    
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);
  
  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.mainPageEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
  
};
//#endregion                          MAIN PAGE

//#region [rgba(120, 0, 0, 0.1)]      SINGLE PAGE
willemeeenScraper.singlePage = async function ({ page, url, event}) {

  const {stopFunctie} =  await this.singlePageStart()

  const pageInfo = {
    title: event.title,
    unavailable : event.unavailable,
    pageInfo : `<a class='page-info' class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
    errors: []
  }     

  // image zit in online dienst verstopt die 302 geeft.
  await page.evaluate(()=>{
    Array.from(document.querySelectorAll('.main-img, .we_program_text_image')).forEach(el=>{
      if (!el.hasAttribute('data-src')) return null
      const srcM = el.getAttribute('data-src').match(/ret_img\/(.*)/);
      if (srcM){
        el.src = srcM[1]
      }
    })
  })

  const imageRes = await this.getImage({page, event, pageInfo, selectors: ['.main-img', '.we_program_text_image'], mode: 'image-src' })
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image; 

  const priceRes = await this.getPriceFromHTML({page, event, pageInfo, selectors: [".ticket-col"], });
  pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
  pageInfo.price = priceRes.price; 
  
  const longTextRes = await longTextSocialsIframes(page, event, pageInfo)
  for (let i in longTextRes){
    pageInfo[i] = longTextRes[i]
  }

  return await this.singlePageEnd({pageInfo, stopFunctie, page, event})
};
//#endregion                         SINGLE PAGE

// #region [rgba(60, 0, 0, 0.3)]     LONG HTML
async function longTextSocialsIframes(page, event, pageInfo){

  return await page.evaluate(({event})=>{
    const res = {}
    const textSelector = '.we_program_text_image';
    const mediaSelector = [
      `.we__agenda-content-wr-single iframe[src*='spotify']`,
      `.we__agenda-content-wr-single iframe[src*='youtube']`
    ].join(", ");
    const removeEmptyHTMLFrom = textSelector;
    const socialSelector = [
      `.links-col [href*="facebook.com/events"]`
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
      `${textSelector} h1`,
      `${textSelector} img`,
      `${textSelector} iframe`,
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

      // terugval???? nog niet bekend met alle opties.
      if (!bron?.src && bron.hasAttribute('data-src')){
        bron.src = bron.getAttribute('data-src')
        bron.removeAttribute('data-src')
      }
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
  }, {event})
  
}
// #endregion                        LONG HTML
