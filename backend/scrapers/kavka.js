import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

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
          requiredProperties: ["venueEventUrl", "title", "startDateTime"],
        },
        singlePage: {
          requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
        }
      },
    },
  })
);

kavkaScraper.listenToMasterThread();

// MERGED ASYNC CHECK

kavkaScraper.singleMergedEventCheck = async function (event) {
  const tl = this.cleanupEventTitle(event.title);

  const isRefused = await this.rockRefuseListCheck(event, tl)
  if (isRefused.success) {
    return {
      reason: isRefused.reason,
      event,
      success: false
    }
  }

  const isAllowed = await this.rockAllowListCheck(event, tl)
  if (isAllowed.success) {
    return isAllowed;  
  }

  return {
    event,
    success: true,
    reason: "nothing found currently",
  };
};

// MAKE BASE EVENTS

kavkaScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }  

  const { stopFunctie, page } = await this.makeBaseEventListStart();

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
            res.startDateTime = new Date(res.dateStringAttempt).toISOString();
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
              res.doorOpenDateTime = new Date(
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
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
};

kavkaScraper.getPageInfo = async function ({ page, event }) {
  const { stopFunctie } = await this.getPageInfoStart();

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
      const imageEl =
        document.querySelector('div.desktop img[src*="kavka.be/wp-content"]') ??
        null;
      if (imageEl) { //TODO kan gewoon met selectors
        if (imageEl.hasAttribute("data-lazy-src")) {
          res.image = imageEl.getAttribute("data-lazy-src");
        } else if (imageEl.hasAttribute("src")) {
          res.image = imageEl.getAttribute("src");
        }
      }

      if (!res.image) {
        res.image =
          document.querySelector('img[src*="kavka.be/wp-content"]')?.src ?? "";
      }

      if (!res.image){
        res.errors.push({
          remarks: `image missing ${res.pageInfo}`
        })
      }

      res.priceTextcontent =
        document.querySelector(".prijzen")?.textContent.trim() ?? "";

      // #region [rgba(100, 0, 0, 0.3)] longHTML

      const textSelector = ".desktop .row-intro .entry-content";
      const mediaSelector = [].join(", ");
      const removeEmptyHTMLFrom = textSelector;
      const socialSelector = [
        ".desktop .btn[href*='facebook']"
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
      res.mediaForHTML = []
      // !mediaSelector.length ? '' : Array.from(
      //   document.querySelectorAll(mediaSelector)
      // ).map((bron) => {
      //   bron.className = "";
        
      //   // staat hier maar te staan wordt niet gebruikt
      //   if (bron.hasAttribute('src') && bron.getAttribute('src').includes('youtube')) {
      //     return {
      //       outer: null,
      //       src: null,
      //       id: bron.src.match(/vi\/(.*)\//),
      //       type: "youtube",
      //     };
      //   } else if (bron.src.includes("spotify")) {
      //     return {
      //       outer: bron.outerHTML,
      //       src: bron.src,
      //       id: null,
      //       type: "spotify",
      //     };
      //   }
        

      //   // terugval???? nog niet bekend met alle opties.
      //   return {
      //     outer: bron.outerHTML,
      //     src: bron.src,
      //     id: null,
      //     type: bron.src.includes("spotify")
      //       ? "spotify"
      //       : bron.src.includes("youtube")
      //         ? "youtube"
      //         : "bandcamp",
      //   };
      // });

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

      // #endregion longHTML

      return res;
    } catch (caughtError) {
      res.errors.push({
        error:caughtError,
        remarks: `page info top level trycatch ${res.pageInfo}`,

      });
    }
  }, {event});

  return await this.getPageInfoEnd({ pageInfo, stopFunctie, page });
};
