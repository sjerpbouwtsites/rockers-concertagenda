import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";


//#region [rgba(0, 60, 0, 0.3)]       SCRAPER CONFIG
const gebrdenobelScraper = new AbstractScraper(
  makeScraperConfig({
    workerData: Object.assign({}, workerData),
    puppeteerConfig: {
      mainPage: {
        timeout: 15000,
      },
      singlePage: {
        timeout: 20000,
      },
      app: {
        mainPage: {
          url: "https://gebrdenobel.nl/programma/",
          requiredProperties: ["venueEventUrl", "title"],
        },
        singlePage: {
          requiredProperties: [
            "venueEventUrl",
            "title",
            "price",
            "start",
          ],
        },
      },
    },
  })
);
//#endregion                          SCRAPER CONFIG

gebrdenobelScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.3)]      RAW EVENT CHECK
gebrdenobelScraper.singleRawEventCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);
  const isRefused = await this.rockRefuseListCheck(event, workingTitle);
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused
  }

  return {
    workingTitle,
    event,
    success: true,
    reason: isRefused.reason,
  };  
}
//#endregion                          RAW EVENT CHECK

//#region [rgba(0, 180, 0, 0.3)]      SINGLE EVENT CHECK
gebrdenobelScraper.singleMergedEventCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);

  const isAllowed = await this.rockAllowListCheck(event, workingTitle);
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  if (hasForbiddenTerms.success) {
    this.saveRefusedTitle(workingTitle);
    hasForbiddenTerms.success = false;
    return hasForbiddenTerms;
  }

  this.saveAllowedTitle(workingTitle)

  return {
    workingTitle,
    event,
    success: true,
    reason: [isAllowed.reason, hasForbiddenTerms.reason].join(';'),
  }
};
//#endregion                          SINGLE EVENT CHECK

//#region [rgba(0, 240, 0, 0.3)]      MAIN PAGE
gebrdenobelScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(
    workerData.family
  );
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index
    );
    return await this.mainPageEnd({
      stopFunctie: null,
      rawEvents: thisWorkersEvents,
    });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  let punkMetalRawEvents = await page.evaluate(
    ({ workerData, unavailabiltyTerms }) => {
      return Array.from(document.querySelectorAll(".event-item"))
        .filter((eventEl) => {
          const tags =
            eventEl.querySelector(".meta-tag")?.textContent.toLowerCase() ?? "";
          return tags.includes("metal") || tags.includes("punk");
        })
        .map((eventEl) => {
          const title =
            eventEl.querySelector(".media-heading")?.textContent ?? null;
          const res = {
            pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
            title,
          };
          res.venueEventUrl =
            eventEl
              .querySelector(".jq-modal-trigger")
              ?.getAttribute("data-url") ?? "";
          const uaRex = new RegExp(unavailabiltyTerms.join("|"), "gi");
          res.unavailable = !!eventEl.textContent.match(uaRex);
          res.soldOut =
            !!eventEl
              .querySelector(".meta-info")
              ?.textContent.match(/uitverkocht|sold\s?out/i) ?? null;
          return res;
        });
    },
    { workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms }
  );

  punkMetalRawEvents = punkMetalRawEvents.map(this.isMusicEventCorruptedMapper);

  let rockRawEvents = await page.evaluate(
    ({ workerData }) => {
      return Array.from(document.querySelectorAll(".event-item"))
        .filter((eventEl) => {
          const tags =
            eventEl.querySelector(".meta-tag")?.textContent.toLowerCase() ?? "";
          return tags.includes("rock");
        })
        .map((eventEl) => {
          const title =
            eventEl.querySelector(".media-heading")?.textContent ?? null;
          const res = {
            pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
            title,
          };
          res.venueEventUrl =
            eventEl
              .querySelector(".jq-modal-trigger")
              ?.getAttribute("data-url") ?? "";

          res.soldOut = !!(
            eventEl
              .querySelector(".meta-info")
              ?.textContent.toLowerCase()
              .includes("uitverkocht") ?? null
          );
          return res;
        });
    },
    { workerData }
  );

  
  rockRawEvents = rockRawEvents.map(this.isMusicEventCorruptedMapper);
  
  const checkedRockEvents = [];
  while (rockRawEvents.length) {
    const thisRockRawEvent = rockRawEvents.shift();
    const tl = this.cleanupEventTitle(thisRockRawEvent.title);
    const isAllowed = await this.rockAllowListCheck(thisRockRawEvent, tl);
    if (isAllowed.success){
      checkedRockEvents.push(thisRockRawEvent);
      continue;
    }
    const isRockRefuse = await this.rockRefuseListCheck(thisRockRawEvent, tl);
    if (isRockRefuse.success){
      continue;
    }

    const isRockRes = await this.isRock(thisRockRawEvent);
    if (isRockRes.success) {
      checkedRockEvents.push(thisRockRawEvent);
    } 
  }

  const rawEvents = punkMetalRawEvents.concat(checkedRockEvents);
  this.saveBaseEventlist(workerData.family, rawEvents);
  const thisWorkersEvents = rawEvents.filter(
    (eventEl, index) => index % workerData.workerCount === workerData.index
  );
  return await this.mainPageEnd({
    stopFunctie,
    rawEvents: thisWorkersEvents,
  });
};
//#endregion                          MAIN PAGE

//#region [rgba(120, 0, 0, 0.3)]     SINGLE PAGE
gebrdenobelScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const cookiesNodig = await page.evaluate(() => {
    return document.querySelector(".consent__show");
  });

  if (cookiesNodig) {
    await page.waitForSelector(".consent__form__submit", {
      timeout: 2000,
    });
    await page.evaluate(() => {
      return document.querySelector(".consent__form__submit").click();
    });
    await page.waitForSelector(".contentBlocks", {
      timeout: 5000,
    });
  }

  const pageInfo = await page.evaluate(
    ({ months, event }) => {
      const res = {
        pageInfo: `<a class='page-info' href='${location.href}'>${document.title}</a>`,
        errors: [],
      };
      const eventDataRows = Array.from(
        document.querySelectorAll(".event-table tr")
      );
      const dateRow = eventDataRows.find((row) =>
        row.textContent.toLowerCase().includes("datum")
      );
      const timeRow = eventDataRows.find(
        (row) =>
          row.textContent.toLowerCase().includes("open") ||
          row.textContent.toLowerCase().includes("aanvang")
      );

      if (dateRow) {
        const startDateMatch = dateRow.textContent.match(
          /(\d+)\s?(\w+)\s?(\d{4})/
        );
        if (Array.isArray(startDateMatch) && startDateMatch.length === 4) {
          const day = startDateMatch[1].padStart(2, "0");
          const month = months[startDateMatch[2]];
          const year = startDateMatch[3];
          res.month = startDateMatch[2];
          res.startDate = `${year}-${month}-${day}`;
        }

        if (!timeRow) {
          res.start = new Date(
            `${res.startDate}T00:00:00`
          ).toISOString();
        } else {
          const timeMatch = timeRow.textContent.match(/\d\d:\d\d/);
          if (Array.isArray(timeMatch) && timeMatch.length) {
            res.start = new Date(
              `${res.startDate}T${timeMatch[0]}:00`
            ).toISOString();
          } else {
            res.start = new Date(
              `${res.startDate}T00:00:00`
            ).toISOString();
          }
        }
      }

      res.shortText =
        document.querySelector(".hero-cta_left__text p")?.textContent ?? "";
      if (document.querySelector("#shop-frame")) {
        document.querySelector("#shop-frame").innerHTML = "";
        document
          .querySelector("#shop-frame")
          .parentNode.removeChild(document.querySelector("#shop-frame"));
      }

      return res;
    },
    { months: this.months, event }
  );

  const imageRes = await this.getImage({page, event, pageInfo, selectors: [".hero img"], mode: 'image-src' })
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;  

  const priceRes = await this.getPriceFromHTML({page, event, pageInfo, selectors: [".event-table"], });
  pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
  pageInfo.price = priceRes.price;  

  const longTextRes = await longTextSocialsIframes(page)
  for (let i in longTextRes){
    pageInfo[i] = longTextRes[i]
  }

  return await this.singlePageEnd({ pageInfo, stopFunctie, page, event });

};
//#endregion                         SINGLE PAGE
// #region [rgba(60, 0, 0, 0.5)]     LONG HTML
async function longTextSocialsIframes(page){

  return await page.evaluate(()=>{
    const res = {}


    const textSelector = ".contentBlocks .lead, .contentBlocks .text";
    const mediaSelector = [
      `.contentBlocks .tm_video`,
      `.contentBlocks iframe[src*='spotify']`,
    ].join(", ");
    const removeEmptyHTMLFrom = textSelector;
    const socialSelector = [
      ".widget--social .btn[href*='facebook']",
      ".widget--social .btn[href*='fb.me']",
    ].join(", ");
    const removeSelectors = [
      "[class*='icon-']",
      "[class*='fa-']",
      ".fa",
      ".contentBlocks .video",
      ".contentBlocks iframe",
      ".contentBlocks script",
      ".contentBlocks img",
      ".contentBlocks #shop-frame",
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
    const removeHTMLWithStrings = ["Om deze content te kunnnen zien"];

    // eerst onzin attributes wegslopen
    const socAttrRemSelAdd = `${
      socialSelector ? `, ${socialSelector} *` : ""
    }`;
    document
      .querySelectorAll(`${textSelector} *${socAttrRemSelAdd}`)
      .forEach((elToStrip) => {
        attributesToRemove.forEach((attr) => {
          if (elToStrip.hasAttribute(attr)) {
            elToStrip.removeAttribute(attr);
          }
        });
      });

    // media obj maken voordat HTML verdwijnt
    res.mediaForHTML = Array.from(
      document.querySelectorAll(mediaSelector)
    ).map((bron) => {
      bron.className = "";
      // custom gebr de nobel
      if (bron.hasAttribute("data-video-id")) {
        return {
          outer: null,
          src: null,
          id: bron.getAttribute("data-video-id"),
          type: "youtube",
        };
      } else if (bron.src.includes("spotify")) {
        return {
          outer: bron.outerHTML,
          src: bron.src,
          id: null,
          type: "spotify",
        };
      }
      // end custom gebr de nobel

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

    // socials obj maken voordat HTML verdwijnt
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