import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

//#region [rgba(0, 60, 0, 0.3)]       SCRAPER CONFIG
const paradisoScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 120022,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 120023,
      waitUntil: 'load'
    },
    singlePage: {
      timeout: 120024
    },
    app: {
      mainPage: {
        url: "https://www.paradiso.nl/",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'start']
      }
    }
  }
}));
//#endregion                          SCRAPER CONFIG

paradisoScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.3)]      RAW EVENT CHECK
paradisoScraper.singleRawEventCheck = async function (event) {
  
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
    hasForbiddenTerms.success = false;
    this.saveRefusedTitle(workingTitle)
    return hasForbiddenTerms
  }

  const hasGoodTermsRes = await this.hasGoodTerms(event);
  if (hasGoodTermsRes.success) {
    this.saveAllowedTitle(workingTitle)
    return hasGoodTermsRes;
  }

  const isRockRes = await this.isRock(event);
  if (isRockRes.success){
    this.saveAllowedTitle(workingTitle)
  } else {
    this.saveRefusedTitle(workingTitle)
  }
  return isRockRes;
  
};
//#endregion                          RAW EVENT CHECK

//#region [rgba(0, 180, 0, 0.3)]      SINGLE EVENT CHECK
//#endregion                          SINGLE EVENT CHECK

//#region [rgba(0, 240, 0, 0.3)]      MAIN PAGE
paradisoScraper.mainPage = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.mainPageEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  } 

  const {stopFunctie, page} = await this.mainPageStart()
  
  const res = await page.evaluate(({workerData}) => {
    return {
      pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${workerData.index}</a>`,
    }
  }, {workerData});

  let bla = '';
  await _t.autoScroll(page);
  bla = await page.evaluate(({workerData}) => {
    return document.querySelector('.css-16y59pb:last-child .chakra-heading')?.textContent ?? 'geen titel gevonden'
  }, {workerData});
  if (this.isForced) this.dirtyTalk(`na scroll 1 ${bla}`)
  
  await _t.autoScroll(page);
  bla = await page.evaluate(({workerData}) => {
    return document.querySelector('.css-16y59pb:last-child .chakra-heading')?.textContent ?? 'geen titel gevonden'
  }, {workerData});  
  if (this.isForced) this.dirtyTalk(`na scroll 2 ${bla}`)

  let rawEvents = await page.evaluate(
    ({resBuiten, unavailabiltyTerms}) => {

      return Array.from(document.querySelectorAll('.css-1agutam'))

        .map((rawEvent) => {
          const res = {
            ...resBuiten,
            errors: []
          }          
          res.title =
            rawEvent
              .querySelector(".chakra-heading")
              ?.textContent.trim() ?? "";
          res.shortText = 
            rawEvent
              .querySelector(".css-1ket9pb")
              ?.textContent.trim() ?? "";
          
          res.venueEventUrl = rawEvent.href ?? null
          res.soldOut = !!rawEvent?.textContent.match(/uitverkocht|sold\s?out/i);
          const uaRex = new RegExp(unavailabiltyTerms.join("|"), 'gi');
          res.unavailable = !!rawEvent?.textContent.match(uaRex);
          return res;
        });
    },
    {workerData, resBuiten: res,unavailabiltyTerms: AbstractScraper.unavailabiltyTerms}
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
paradisoScraper.singlePage = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.singlePageStart()

  const buitenRes = {
    pageInfo: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
    errors: [],
  };  
  
  try {
    await page.waitForSelector(".css-tkkldl", {
      timeout: 20000,
    });
  } catch (caughtError) {
    buitenRes.errors.push({
      error: caughtError,
      remarks: `Paradiso wacht op laden single pagina\n${buitenRes.pageInfo}`,
      errorLevel: 'notice'
    })
    return await this.singlePageEnd({pageInfo: buitenRes, stopFunctie, page})
  }

  const editedMonths = {
    jan: "01",
    feb: "02",
    mrt: "03",
    mar: "03",
    apr: "04",
    mei: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    okt: "10",
    nov: "11",
    dec: "12",
    januari: "01",
    februari: "02",
    maart: "03",
    april: "04",
    juni: "06",
    juli: "07",
    augustus: "08",
    september: "09",
    oktober: "10",
    november: "11",
    december: "12",      
    january: "01",
    february: "02",
    march: "03",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    october: "10",
  }

  await _t.waitFor(500);

  const pageInfo = await page.evaluate(
    ({ months, buitenRes }) => {
      const res = {...buitenRes};

      const contentBox1 =
        document.querySelector(".css-1irwsol")?.outerHTML ?? '';
      const contentBox2 =
        document.querySelector(".css-gwbug6")?.outerHTML ?? '';
      if (!contentBox1 && !contentBox2) {
        res.corrupted = 'geen contentboxes';
      }
      
      try {
        const startDateMatch = document.querySelector('.css-tkkldl')
          ?.textContent.toLowerCase()
          .match(/(\d{1,2})\s+(\w+)/); // TODO paradiso kan nu niet omgaan met jaarrwisselingen.
        res.match = startDateMatch
        if (
          startDateMatch &&
          Array.isArray(startDateMatch) &&
          startDateMatch.length === 3
        ) {
          const monthName = months[startDateMatch[2]];
          if (!monthName) {
            res.errors.push({

              remarks: `month not found ${startDateMatch[2]}`,
              toDebug: startDateMatch
            })
          }


          const curM = new Date().getMonth() + 1;
          let year = new Date().getFullYear();
          if (monthName < curM) {
            year = year + 1;
          }

          res.startDate = `${year}-${
            monthName
          }-${startDateMatch[1].padStart(2, "0")}`;
        }
      } catch (caughtError) {
        res.errors.push({ 
          error: caughtError, 
          remarks: `startDateMatch ${res.pageInfo}`, 
          toDebug: {
            event
          }});
      }

      let startTijd, deurTijd, eindTijd;
      const tijden = document.querySelector('.css-65enbk')
        .textContent.match(/\d\d:\d\d/g);
      if (tijden.length > 2){
        eindTijd = tijden[2]
      } 
      if (tijden.length > 1){
        deurTijd = tijden[1]
        startTijd = tijden[0]
      }
      if (tijden.length === 1){
        startTijd = tijden[0]
      } 
      if (!tijden.length){
        res.errors.push({
          remarks: `Geen tijden gevonden ${res.pageInfo}`,
        });        
      }

      if (startTijd){
        res.start = new Date(
          `${res.startDate}T${startTijd}:00`
        ).toISOString();        
      }
      if (deurTijd){
        res.door = new Date(
          `${res.startDate}T${deurTijd}:00`
        ).toISOString();        
      }
      if (eindTijd){
        res.end = new Date(
          `${res.startDate}T${eindTijd}:00`
        ).toISOString();        
      }      

      res.image = document.querySelector('.css-xz41fi source')?.srcset.split(' ')[0] ?? null;
      if (!res.image){
        res.image = document.querySelector('.css-xz41fi source:last-of-type')?.srcset.split(/\s/)[0] ?? null;
      }

      if (!res.image){
        res.errors.push({
          remarks: `image missing ${res.pageInfo}`
        })
      }
      
     
      return res;
    },
    { months: editedMonths, buitenRes }
  );

  const priceRes = await this.getPriceFromHTML({page, event, pageInfo, selectors: [".css-f73q4m", '.price', '.chakra-container'], });
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

 
    const textSelector = '.chakra-container .css-m8ufwp';
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