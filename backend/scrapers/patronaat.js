import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";
import ErrorWrapper from "../mods/error-wrapper.js";
import * as _t from "../mods/tools.js";

//#region [rgba(0, 60, 0, 0.3)]       SCRAPER CONFIG
const patronaatScraper = new AbstractScraper(makeScraperConfig({
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 30034,
    },
    singlePage: {
      timeout: 20036,
    },
    app: {
      mainPage: {
        url: "https://patronaat.nl/programma/?type=event&s=&eventtype%5B%5D=178",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'start']
      }
    }
  },
}));
//#endregion                          SCRAPER CONFIG

patronaatScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.3)]      RAW EVENT CHECK
patronaatScraper.singleRawEventCheck = async function (event) {

  const workingTitle = this.cleanupEventTitle(event.title.toLowerCase());

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
  
};
//#endregion                          RAW EVENT CHECK

//#region [rgba(0, 180, 0, 0.3)]      SINGLE EVENT CHECK
//#endregion                          SINGLE EVENT CHECK

//#region [rgba(0, 240, 0, 0.3)]      MAIN PAGE
patronaatScraper.mainPage = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.mainPageEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  } 

  const {stopFunctie, page} = await this.mainPageStart()

  let rawEvents = await page.evaluate(({workerData, unavailabiltyTerms}) => {
    return Array.from(document.querySelectorAll(".overview__list-item--event"))
      .map((eventEl) => {
        const title = eventEl.querySelector(".event-program__name")?.textContent.trim();
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title
        };
        res.image =
          eventEl.querySelector(".event-program__image img")?.src ?? null;
        if (!res.image){
          res.errors.push({
            remarks: `image missing ${res.pageInfo}`
          })
        }          
        res.venueEventUrl = eventEl.querySelector("a[href]")?.href ?? null;
        res.shortText = eventEl
          .querySelector(".event-program__subtitle")
          ?.textContent.trim() ?? '';
        const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
        res.unavailable = !!eventEl.textContent.match(uaRex);          
        res.soldOut = !!(eventEl.querySelector('.event__tags-item--sold-out') ?? null)
        return res;
      });
  }, {workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms})
  rawEvents =rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.mainPageEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
};
//#endregion                          MAIN PAGE

//#region [rgba(120, 0, 0, 0.3)]     SINGLE PAGE
patronaatScraper.singlePage = async function ({ page, event }) {
 
  const {stopFunctie} =  await this.singlePageStart()

  const pageInfo = await page.evaluate(({months, event}) => {
    const res = {
      pageInfo: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
      errors: [],
    };

    try {
      res.startDatumM = document
        .querySelector(".event__info-bar--star-date")
        ?.textContent.toLowerCase()
        .match(/(\d{1,2})\s+(\w{3,4})\s+(\d\d\d\d)/);
      if (Array.isArray(res.startDatumM) && res.startDatumM.length >= 4) {
        let day = res.startDatumM[1].padStart(2, "0");
        let month = months[res.startDatumM[2]];
        let year = res.startDatumM[3];
        res.startDatum = `${year}-${month}-${day}`;
      }

      if (res.startDatum) {
        [
          ["doorOpenTime", ".event__info-bar--doors-open"],
          ["startTime", ".event__info-bar--start-time"],
          ["endTime", ".event__info-bar--end-time"],
        ].forEach((timeField) => {
          const [timeName, selector] = timeField;

          const mmm = document
            .querySelector(selector)
            ?.textContent.match(/\d\d:\d\d/);
          if (Array.isArray(mmm) && mmm.length === 1) {
            res[timeName] = mmm[0];
          }
        });

        if (!res.startTime) {
          res.startTime = res.doorOpenTime;
        } 
        if (!res.startTime){
          res.errors.push({
            remarks: `geen startTime ${res.pageInfo}`,
            toDebug: event
          })
        }

        if (res.doorOpenTime) {
          res.door = new Date(
            `${res.startDatum}T${res.doorOpenTime}:00`
          ).toISOString();
        }
        if (res.startTime) {
          res.start = new Date(
            `${res.startDatum}T${res.startTime}:00`
          ).toISOString();
        }
        if (res.endTime) {
          res.end = new Date(
            `${res.startDatum}T${res.endTime}:00`
          ).toISOString();
        }
      } else {
        res.errors.push({
          remarks: `geen startDate ${res.pageInfo}`,
          toDebug: event
        })
        return res;        
      }
    } catch (caughtError) { //TODO opsplitsen
      res.errors.push({
        error: caughtError,
        remarks: `Datum error patronaat ${res.pageInfo}.`,
        toDebug: event
      });
    }

    return res;
  }, {months: this.months, event}).catch(caughtError =>{
    _t.wrappedHandleError(new ErrorWrapper({
      error: caughtError,
      remarks: `page Info catch patronaat`,
      errorLevel: 'notice',
      workerData: workerData,
      toDebug: {
        event, 
        pageInfo
      }
    }))
  });


  const priceRes = await this.getPriceFromHTML({page, event, pageInfo, selectors: [".event__info-bar--ticket-price"], });
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


    
    const textSelector = '.event__content';
    const mediaSelector = [
      `iframe[src*='youtube']`,
      `iframe[src*='bandcamp']`,
      `iframe[src*='spotify']`,
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