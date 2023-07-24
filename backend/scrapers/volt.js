import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";
import {waitFor} from "../mods/tools.js"

//#region [rgba(0, 60, 0, 0.3)]       SCRAPER CONFIG
const voltScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),

  puppeteerConfig: {
    mainPage: {
      waitUntil: 'load'
    },
    app: {
      mainPage: {
        url: "https://www.poppodium-volt.nl/programma?f%5B0%5D=activity_itix_genres%3A9&f%5B1%5D=activity_itix_genres%3A30",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }    
  }  
}));
//#endregion                          SCRAPER CONFIG

voltScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.3)]      RAW EVENT CHECK
//#endregion                          RAW EVENT CHECK

//#region [rgba(0, 180, 0, 0.3)]      SINGLE EVENT CHECK
voltScraper.singleMergedEventCheck = async function (event) {

  const workingTitle = this.cleanupEventTitle(event.title);

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

  return {
    event,
    success: true,
    reason: "nothing found currently",
  };
  
};
//#endregion                          SINGLE EVENT CHECK

//#region [rgba(0, 240, 0, 0.3)]      BASE EVENT LIST
voltScraper.makeBaseEventList = async function () {
  
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  } 

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  try {
    await page.waitForSelector(".card-activity", {
      timeout: 1250,
    });

  } catch (error) {
    _t.handleError(error, workerData, "Volt wacht op laden eventlijst", 'close-thread', null);
  }

  let rawEvents = await page.evaluate(({workerData, unavailabiltyTerms}) => {
    return Array.from(document.querySelectorAll(".card-activity"))
      // .filter((rawEvent) => {
      //   const hasGenreName =
      //     rawEvent
      //       .querySelector(".card-activity-list-badge-wrapper")
      //       ?.textContent.toLowerCase()
      //       .trim() ?? "";
      //   return hasGenreName.includes("metal") || hasGenreName.includes("punk");
      // })
      .map((rawEvent) => {
        const anchor = rawEvent.querySelector('.card-activity__title a') ?? null;
        const title = anchor?.textContent.trim() ?? "";
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title
        };        
        res.venueEventUrl = anchor.hasAttribute("href") ? anchor.href : null;
        res.image = rawEvent.querySelector(".card-activity__image img")?.src ?? null;
        res.shortText = rawEvent.querySelector('.card-activity__image-badges')?.textContent ?? null;
        if (!res.image){
          res.errors.push({
            remarks: `image missing ${res.pageInfo}`
          })
        }        
        const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
        res.unavailable = !!rawEvent.textContent.match(uaRex);
        res.soldOut = rawEvent?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;
        return res;
      });
  }, {workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms})
    
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);
  
  //this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
  
};
//#endregion                          BASE EVENT LIST

// GET PAGE INFO

voltScraper.getPageInfo = async function ({ page, url, event}) {

  const {stopFunctie} =  await this.getPageInfoStart()

  const cookiesNodig = await page.evaluate(()=>{
    return document.querySelector('.cookiesjsr-btn.allowAll')
  })

  if (cookiesNodig){
    await page.evaluate(()=>{
      document.querySelector('.cookiesjsr-btn.allowAll').click()
    })
    await waitFor(1500)
  }

  const pageInfo = await page.evaluate(
    ({ months, event, url }) => {

      let res = {};
      res.title = event.title;
      res.unavailable= event.unavailable;
      res.pageInfo= `<a class='page-info' class='page-info' href='${url}'>${event.title}</a>`;
      res.errors = [];

      const startDateMatch = document.querySelector('.field--name-field-date')?.textContent.match(/(\d+)\s?(\w+)\s?(\d\d\d\d)/);
      if (Array.isArray(startDateMatch) && startDateMatch.length > 2) {
        const dag = startDateMatch[1].padStart(2, '0');
        const maandNaam = startDateMatch[2];
        const maand = months[maandNaam];
        const jaar = startDateMatch[3];
        res.startDate = `${jaar}-${maand}-${dag}`;
      } else {
        res.startDate = null;
      }

      const eersteTijdRij = document.querySelector('.activity-info-row');
      const tweedeTijdRij = document.querySelector('.activity-info-row + .activity-info-row');
      if (!eersteTijdRij && !tweedeTijdRij){
        res.errors.push({
          error: new Error('geen tijdrijen'),
        })
        return res;
      }
      
      const startTimeM = eersteTijdRij.textContent.match(/\d\d\s?:\s?\d\d/);
      const endTimeM = tweedeTijdRij?.textContent.match(/\d\d\s?:\s?\d\d/) ?? null;
      if (!Array.isArray(startTimeM)){
        res.errors.push({
          error: new Error('geen tijdmatch success'),
          toDebug: eersteTijdRij.textContent,
        })
        return res;        
      } 
      res.startTime = startTimeM[0].replaceAll(/\s/g, '');
      if (Array.isArray(endTimeM)){
        res.endTime = endTimeM[0].replaceAll(/\s/g, '');
      }

      try {
        if (res.startTime) {
          res.startDateTime = new Date(
            `${res.startDate}T${res.startTime}:00`
          ).toISOString();
        }
        
        if (res.endTime) {
          res.endDateTime = new Date(
            `${res.startDate}T${res.endTime}:00`
          ).toISOString();
        }
      } catch (error) {
        res.errors.push({
          error,
          remarks: `ongeldige tijden ${res.pageInfo}`,
        });
        return res;
      
      }
      res.priceTextcontent =
        document.querySelector(".activity-price")
          ?.textContent ?? '' ;


      return res;
    },
    { months: this.months, url, event}
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

    const textSelector = '.activity-content-wrapper > div:first-child';
    const mediaSelector = [
      `${textSelector} iframe[src*='youtube']`,
      `${textSelector} iframe[src*='bandcamp']`,
      `${textSelector} iframe[src*='spotify']`,
    ].join(", ");
    const removeEmptyHTMLFrom = textSelector;
    const socialSelector = [].join(", ");
    const removeSelectors = [
      "[class*='icon-']",
      "[class*='fa-']",
      ".fa",
      `${textSelector} script`,
      `${textSelector} noscript`,
      `${textSelector} style`,
      `${textSelector} meta`,
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
