import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

//#region [rgba(0, 60, 0, 0.3)]       SCRAPER CONFIG
const melkwegScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 60062,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 75073,
      waitUntil: 'load'
    },
    singlePage: {
      timeout: 20074
    },
    app: {
      mainPage: {
        url: "https://www.melkweg.nl/nl/agenda",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'start']
      }
    }
  }
}));
//#endregion                          SCRAPER CONFIG

melkwegScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.3)]      RAW EVENT CHECK
melkwegScraper.singleRawEventCheck = async function(event){

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

  const hasGoodTermsRes = await this.hasGoodTerms(event);
  if (hasGoodTermsRes.success) {
    await this.saveAllowedTitle(workingTitle)
    return hasGoodTermsRes;
  }

  const isRockRes = await this.isRock(event, [workingTitle]);
  if (isRockRes.success){
    await this.saveAllowedTitle(workingTitle)
  } else {
    await this.saveRefusedTitle(workingTitle)
  }
  return isRockRes;
}
//#endregion                          RAW EVENT CHECK

//#region [rgba(0, 180, 0, 0.3)]      SINGLE EVENT CHECK
//#endregion                          SINGLE EVENT CHECK

//#region [rgba(0, 240, 0, 0.3)]      MAIN PAGE
melkwegScraper.mainPage = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.mainPageEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }  

  const {stopFunctie, page} = await this.mainPageStart()

  let rawEvents = await page.evaluate(({workerData,unavailabiltyTerms}) => {
    return Array.from(document.querySelectorAll("[data-element='agenda'] li[class*='event-list-day__list-item']"))
      .filter((eventEl) => {
        const anker = eventEl
          .querySelector('a') ?? null;
        const genre = anker?.hasAttribute('data-genres') 
          ? anker?.getAttribute('data-genres') 
          : '';
        const isHeavy = genre === '53'; //TODO kan ook direct met selectors.
        return isHeavy;
      })
      .map((eventEl) => {
        const title = eventEl.querySelector('h3[class*="title"]')?.textContent ?? "";
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],          
          title,
        }
        const tags =
        eventEl
          .querySelector('[class*="styles_tags-list"]')
          ?.textContent.toLowerCase().split(` . `).join(' - ') ?? "";        
        const anchor = eventEl.querySelector("a");
        let shortTitle = 
        eventEl.querySelector('[class*="subtitle"]')?.textContent ?? "";
        shortTitle = shortTitle ? `<br>${shortTitle}` : '';
        res.shortText = `${tags} ${shortTitle}`;
        res.venueEventUrl = anchor.href;
        const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
        res.unavailable = !!eventEl.textContent.match(uaRex);        
        res.soldOut = !!eventEl.querySelector("[class*='styles_event-compact__text']")?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;
        return res;
      });
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
melkwegScraper.singlePage = async function ({ page, event }) {

  const {stopFunctie} =  await this.singlePageStart()
  
  
  const pageInfo = await page.evaluate(({event}) => {
    const res = {
      pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
      errors: [],
    };
    try {
      res.start = new Date(
        document
          .querySelector('[class*="styles_event-header"] time')
          ?.getAttribute("datetime") ?? null
      ).toISOString();
    } catch (caughtError) {

      res.errors.push({
        error: caughtError,
        remarks: `start faal ${res.pageInfo}`,
        toDebug: {
          text: document.querySelector('[class*="styles_event-header"] time')
            ?.outerHTML ?? 'geen time element',
          res, event
        }
      });
    }

    res.image =
      document.querySelector('[class*="styles_event-header__figure"] img')
        ?.src ?? null;
    if (!res.image){
      res.errors.push({
        remarks: `image missing ${res.pageInfo}`
      })
    }

    return res;
  }, {event});

  const priceRes = await this.getPriceFromHTML({page, event, pageInfo, selectors: ['[class*="styles_ticket-prices"]'], });
  pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
  pageInfo.price = priceRes.price;  

  const longTextRes = await longTextSocialsIframes(page)
  for (let i in longTextRes){
    pageInfo[i] = longTextRes[i]
  }

  return await this.singlePageEnd({pageInfo, stopFunctie, page, event})

};
//#endregion                         SINGLE PAGE
// #region [rgba(60, 0, 0, 0.5)]     LONG HTML
async function longTextSocialsIframes(page){

  return await page.evaluate(()=>{
    const res = {}


    const textSelector = '[class*="styles_event-info__text-column"]';
    const mediaSelector = ["[class*='styles_embed__media-container'] iframe"].join(", ");
    const removeEmptyHTMLFrom = textSelector;
    const socialSelector = [
      "[class*='styles_event-meta-data'] [href*='facebook']"
    ].join(", ");
    const removeSelectors = [
      "[class*='icon-']",
      "[class*='fa-']",
      ".fa",
      `${textSelector} script`,
      `${textSelector} img`
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
    document
      .querySelectorAll(`${textSelector} *${socAttrRemSelAdd}${mediaAttrRemSelAdd}`)
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
          if (el.href.includes("facebook")) {
            el.textContent = "Facebook";
          } else if (el.href.includes("twitter")) {
            el.textContent = "Tweet";
          } else {
            el.textContent = "Onbekende social";
          }
        }
        el.className = "";
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
    document.querySelectorAll(`${textSelector} *`).forEach((elToStrip) => {
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
  })
  
}
// #endregion                        LONG HTML