import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";
import {waitFor} from "../mods/tools.js";

//#region [rgba(0, 60, 0, 0.3)]       SCRAPER CONFIG
const tivoliVredenburgScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      waitUntil: "load"
    },
    app: {
      mainPage: {
        url: "https://www.tivolivredenburg.nl/agenda/?event_category=metal-punk-heavy",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }    
  }
}));
//#endregion                          SCRAPER CONFIG

tivoliVredenburgScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.3)]      RAW EVENT CHECK
tivoliVredenburgScraper.singleRawEventCheck = async function (event) {

  const workingTitle = this.cleanupEventTitle(event.title);

  const isRefused = await this.rockRefuseListCheck(event, workingTitle)
  if (isRefused.success) return {
    reason: isRefused.reason,
    event,
    success: false
  };

  const isAllowed = await this.rockAllowListCheck(event, workingTitle)
  if (isAllowed.success) {
    return isAllowed
  }

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
  
};
//#endregion                          RAW EVENT CHECK

//#region [rgba(0, 180, 0, 0.3)]      SINGLE EVENT CHECK
//#endregion                          SINGLE EVENT CHECK

//#region [rgba(0, 240, 0, 0.3)]      BASE EVENT LIST
tivoliVredenburgScraper.makeBaseEventList = async function () {
  
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  } 

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  let rawEvents = await page.evaluate(({workerData, unavailabiltyTerms}) => {
    return Array.from(document.querySelectorAll(".agenda-list-item"))
      .map((eventEl) => {
        const title =
          eventEl
            .querySelector(".agenda-list-item__title")
            ?.textContent.trim() ?? null;
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title
        };
        res.shortText =
          eventEl
            .querySelector(".agenda-list-item__text")
            ?.textContent.trim() ?? '';
        res.image =
          eventEl
            .querySelector(".agenda-list-item__figure img")
            ?.src.replace(/-\d\d\dx\d\d\d.jpg/, ".jpg") ?? null;
        if (!res.image){
          res.errors.push({
            remarks: `image missing ${res.pageInfo}`
          })
        }      
        res.venueEventUrl = eventEl.querySelector(
          ".agenda-list-item__title-link"
        ).href;
        const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
        res.unavailable = !!eventEl.textContent.match(uaRex);        
        res.soldOut = !!eventEl.querySelector(".agenda-list-item__label")?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;
        return res;
      });
  }, {workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms})
  
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );

};
//#endregion                          BASE EVENT LIST


// GET PAGE INFO

tivoliVredenburgScraper.getPageInfo = async function ({ page, event }) {
 
  const {stopFunctie} =  await this.getPageInfoStart()

  const cookiesNodig = await page.evaluate(()=>{
    return document.querySelector('#eagerly-tools-cookie')
  })

  if (cookiesNodig){
    await page.evaluate(()=>{
      const label = document.querySelector(".cookie-field:not(.disabled) label");
      const accept = document.querySelector("#cookie-accept")
      label.click()
      accept.click();
    })
    await waitFor(1500)
  }

  const pageInfo = await page.evaluate(({event}) => {
    const res = {
      pageInfo: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
      errors: [],
    };
    res.priceTextcontent =
      document.querySelector(".btn-group__price")?.textContent.trim() ?? '';
    res.priceContexttext =
      document.querySelector(".event-cta")?.textContent.trim() ?? '';

    const startDateMatch = location.href.match(/\d\d-\d\d-\d\d\d\d/); //
    res.startDate = "";
    if (startDateMatch && startDateMatch.length) {
      res.startDate = startDateMatch[0].split("-").reverse().join("-");
    }

    if (!res.startDate || res.startDate.length < 7) {
      res.errors.push({
        remarks: `startdate mis ${res.pageInfo}`,
        toDebug: {
          text: `niet goed genoeg<br>${startDateMatch.join("; ")}<br>${res.startDate}`,
          res,event
        }
      });
      return res;
    }
    const eventInfoDtDDText = document
      .querySelector(".event__info .description-list")
      ?.textContent.replace(/[\n\r\s]/g, "")
      .toLowerCase();
    res.startTime = null;
    res.openDoorTime = null;
    res.endTime = null;
    const openMatch = eventInfoDtDDText.match(/open.*(\d\d:\d\d)/);
    const startMatch = eventInfoDtDDText.match(/aanvang.*(\d\d:\d\d)/);
    const endMatch = eventInfoDtDDText.match(/einde.*(\d\d:\d\d)/);

    if (Array.isArray(openMatch) && openMatch.length > 1) {
      try {
        res.openDoorTime = openMatch[1];
        res.doorOpenDateTime = res.startDate
          ? new Date(`${res.startDate}T${res.openDoorTime}:00`).toISOString()
          : null;
      } catch (caughtError) {
        res.errors.push({
          error: caughtError,
          remarks: `Open door ${res.pageInfo}`,
          toDebug:{
            text: eventInfoDtDDText,
            event
          }
        });
      }
    }
    if (Array.isArray(startMatch) && startMatch.length > 1) {
      try {
        res.startTime = startMatch[1];
        res.startDateTime = res.startDate
          ? new Date(`${res.startDate}T${res.startTime}:00`).toISOString()
          : null;
      } catch (caughtError) {
        res.errors.push({
          error: caughtError,
          remarks: `startTijd door ${res.pageInfo}`,
          toDebug: {
            matches:`${startMatch.join("")}`,
            event
          }
        });
      }
    }
    if (Array.isArray(endMatch) && endMatch.length > 1) {
      try {
        res.endTime = endMatch[1];
        res.endDateTime = res.startDate
          ? new Date(`${res.startDate}T${res.endTime}:00`).toISOString()
          : null;
      } catch (caughtError) {
        res.errors.push({
          error: caughtError,
          remarks: `endtijd ${res.pageInfo}`,
          toDebug: {
            text: eventInfoDtDDText,
            event
          }
        });
      }
    }

    return res;
  }, {event});

  const longTextRes = await longTextSocialsIframes(page)
  for (let i in longTextRes){
    pageInfo[i] = longTextRes[i]
  }

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page, event})

};

// #region [rgba(100, 0, 0, 0.3)] longHTML
async function longTextSocialsIframes(page){

  return await page.evaluate(()=>{
    const res = {}

      
    const textSelector = '.event-flow .event__text';
    const mediaSelector = [
      `${textSelector} iframe[src*='youtube']`,
      `${textSelector} iframe[src*='bandcamp']`,
      `${textSelector} iframe[src*='spotify']`,
    ].join(", ");
    const removeEmptyHTMLFrom = textSelector;
    const socialSelector = [
      `.description-list__detail a[href*='facebook'][href*='events']`
    ].join(", ");
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
    const removeHTMLWithStrings = ['Extra informatie', 'Let op bij het kopen'];

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