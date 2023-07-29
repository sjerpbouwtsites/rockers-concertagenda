import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

//#region [rgba(0, 60, 0, 0.3)]       SCRAPER CONFIG
const kavkaScraper = new AbstractScraper(
  makeScraperConfig({
    workerData: Object.assign({}, workerData),
    puppeteerConfig: {
      mainPage: {
        timeout: 35015,
      },
      singlePage: {
        timeout: 30016,
      },
      app: {
        mainPage: {
          url: "https://kavka.be/programma/",
          requiredProperties: ["venueEventUrl", "title", "start"],
        },
        singlePage: {
          requiredProperties: ['venueEventUrl', 'title', 'price', 'start']
        }
      },
    },
  })
);
//#endregion                          SCRAPER CONFIG

kavkaScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.3)]      RAW EVENT CHECK
kavkaScraper.singleRawEventCheck = async function (event) {
  let workingTitle = this.cleanupEventTitle(event.title);
  const isRefused = await this.rockRefuseListCheck(event, workingTitle)
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }

  return {
    workingTitle,
    reason: [isRefused.reason].join(';'),
    event,
    success: true
  }

}
//#endregion                          RAW EVENT CHECK

//#region [rgba(0, 180, 0, 0.3)]      SINGLE EVENT CHECK
kavkaScraper.singleMergedEventCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);
  
  const isAllowed = await this.rockAllowListCheck(event, workingTitle)
  if (isAllowed.success) {
    return isAllowed;  
  }

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  if (hasForbiddenTerms.success) {
    this.saveRefusedTitle(workingTitle)
    hasForbiddenTerms.success = false;
    return hasForbiddenTerms
  }

  this.saveAllowedTitle(workingTitle)  

  return {
    reason: [isAllowed.reason, hasForbiddenTerms.reason].join(';'),
    workingTitle,
    event,
    success: true
  }
};
//#endregion                          SINGLE EVENT CHECK

//#region [rgba(0, 240, 0, 0.3)]      MAIN PAGE
kavkaScraper.mainPage = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.mainPageEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }  

  const { stopFunctie, page } = await this.mainPageStart();

  let rawEvents = await page.evaluate(
    ({ months, workerData, unavailabiltyTerms }) => {
      return Array.from(document.querySelectorAll(".events-list > a"))
        .filter((rawEvent) => {
          return Array.from(rawEvent.querySelectorAll(".tags"))
            .map((a) => a.textContent.trim().toLowerCase())
            .join(' ').includes("metal");
        })
        .map((rawEvent) => {
          let startTimeM,
            startDateEl,
            startDate,
            startDay,
            startMonthName,
            startMonth,
            startMonthJSNumber,
            refDate,
            startYear;

          const title =
            rawEvent
              .querySelector("article h3:first-child")
              ?.textContent.trim() ?? null;

          const res = {

            pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
            title,
          };
          if (rawEvent.querySelector(".cancelled")) {
            res.unavailable = 'cancelled'
          }

          // TODO BELACHELIJK GROTE TRY CATHC
          try {
            startDateEl = rawEvent.querySelector("date .date") ?? null;
            startDay =
              startDateEl
                .querySelector(".day")
                ?.textContent.trim()
                ?.padStart(2, "0") ?? null;
            startMonthName =
              startDateEl.querySelector(".month")?.textContent.trim() ?? null;
            startMonth = months[startMonthName];
            startMonthJSNumber = Number(startMonth) - 1;
            refDate = new Date();
            startYear = refDate.getFullYear();
            if (startMonthJSNumber < refDate.getMonth()) {
              startYear = startYear + 1;
            }
            startDate = `${startYear}-${startMonth}-${startDay}`;
            startTimeM = rawEvent
              .querySelector(".loc-time time")
              ?.textContent.match(/\d\d:\d\d/);
            if (
              startTimeM &&
              Array.isArray(startTimeM) &&
              startTimeM.length > 0
            ) {
              res.dateStringAttempt = `${startDate}T${startTimeM[0]}:00`;
            } else {
              res.dateStringAttempt = `${startDate}T19:00:00`;
            }
            res.start = new Date(res.dateStringAttempt).toISOString();
          } catch (caughtError) {
            res.errors.push({
              error: caughtError,
              remarks: `kkgrote trycatch baseEventList iduna ${res.pageInfo}.`,
              toDebug: res
            });
          }

          try {
            if (
              startTimeM &&
              Array.isArray(startTimeM) &&
              startTimeM.length > 1
            ) {
              res.dateStringAttempt = `${startDate}T${startTimeM[1]}:00`;
              res.door = new Date(
                res.dateStringAttempt
              ).toISOString();
            }            
          } catch (error) {
            res.errors.push({
              remarks: `openDoorDateTime faal ${res.pageInfo}`,
            })
          }

          const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
          res.unavailable = !!rawEvent.textContent.match(uaRex);
          res.soldOut = !!rawEvent.querySelector(".badge")?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;

          res.shortText =
            rawEvent.querySelector("article h3 + p")?.textContent.trim() ?? "";
          res.venueEventUrl = rawEvent?.href ?? null;

          return res;
        });
    },
    { months: this.months, workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms }
  )

  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.mainPageEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
};
//#endregion                          MAIN PAGE

//#region [rgba(120, 0, 0, 0.3)]     SINGLE PAGE
kavkaScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  await page.waitForSelector('img[src*="kavka.be/wp-content"].lazyloaded',{
    timeout: 1500,
  }).catch(err => {
    // niets doen.
  })

  const pageInfo = await page.evaluate(({event}) => {
    const res = {

      pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
      errors: [],
    };
    try {

      return res;
    } catch (caughtError) {
      res.errors.push({
        error:caughtError,
        remarks: `page info top level trycatch ${res.pageInfo}`,

      });
    }
  }, {event});

  const imageRes = await this.getImage({page, event, pageInfo, selectors: ['img[src*="uploads"][src*="kavka"]', 'img[src*="kavka.be/wp-content"]'], mode: 'image-src' })
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({page, event, pageInfo, selectors: [".prijzen"], });
  pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
  pageInfo.price = priceRes.price;  

  const longTextRes = await longTextSocialsIframes(page, event, pageInfo)
  for (let i in longTextRes){
    pageInfo[i] = longTextRes[i]
  }

  return await this.singlePageEnd({ pageInfo, stopFunctie, page });
};
//#endregion                         SINGLE PAGE
// #region [rgba(60, 0, 0, 0.5)]     LONG HTML
async function longTextSocialsIframes(page, event, pageInfo){

  return await page.evaluate(({event})=>{
    const res = {}


    const textSelector = ".desktop .row-intro .entry-content";
    const mediaSelector = [].join(", ");
    const removeEmptyHTMLFrom = textSelector;
    const socialSelector = [
      ".desktop .btn[href*='facebook']"
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
    res.mediaForHTML = []

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