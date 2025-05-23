/* global document */
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/melkweg.js";
import getImage from "./gedeeld/image.js";
import {
  combineDoorTimeStartDate,
  mapToShortDate,
  combineStartTimeStartDate,
} from "./gedeeld/datums.js";
import workTitleAndSlug from "./gedeeld/slug.js";
import terms from "../artist-db/store/terms.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 75073,
    waitUntil: "load",
    url: "https://www.melkweg.nl/nl/heavy/",
  },
  singlePage: {
    timeout: 15000,
  },
  app: {
    harvest: {
      dividers: [`+/`],
      dividerRex: "[\\+/]",
      artistsIn: ["title"],
    },
    mainPage: {
      requiredProperties: ["venueEventUrl", "title"],
      asyncCheckFuncs: [
        "refused",
        "allowedEvent",
        "forbiddenTerms",
        "hasGoodTerms",
        "hasAllowedArtist",
        "spotifyConfirmation",
      ],
    },
    singlePage: {
      requiredProperties: ["venueEventUrl", "title", "price", "start"],
      asyncCheckFuncs: ["success"],
    },
  },
});
// #endregion                          SCRAPER CONFIG

scraper.listenToMasterThread();

// #region       MAIN PAGE
scraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(
    workerData.family
  );
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index
    );
    return this.mainPageEnd({
      stopFunctie: null,
      rawEvents: thisWorkersEvents,
    });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  await this.autoScroll(page);

  // await page.evaluate(() => {
  //   document.querySelectorAll("[class*='styles_date']").forEach((dateEl) => {
  //     if (!dateEl.hasAttribute("datetime")) return;
  //     const dateW = dateEl.getAttribute("datetime").split("T")[0];
  //     dateEl.parentNode.parentNode
  //       .querySelectorAll("[class*='styles_event-list-day__list-item'] a")
  //       .forEach((dagItem) => dagItem.setAttribute("data-date", dateW));
  //   });
  // });

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData, unavailabiltyTerms }) =>
      Array.from(
        document.querySelectorAll(".styles_event-list-day__list-item__o6KTp")
      )
        // .filter((a, i) => {
        //   return i < 5;
        // })
        // .filter((eventEl) => {
        //   const anker = eventEl.querySelector("a") ?? null;
        //   const genre = anker?.hasAttribute("data-genres")
        //     ? anker?.getAttribute("data-genres")
        //     : "";
        //   const isHeavy = genre === "53"; // TODO kan ook direct met selectors.
        //   return isHeavy;
        // })
        .map((eventEl) => {
          const title =
            eventEl.querySelector('h3[class*="title"]')?.textContent ?? "";
          const res = {
            anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
            title,
          };
          res.eventGenres = Array.from(
            eventEl.querySelectorAll(
              ".styles_tags-list__tag__GWKrY span:first-child"
            )
          ).map((a) => a.textContent);

          const anchor = eventEl.querySelector("a");
          const datumVerpakking = eventEl.parentNode.parentNode;

          try {
            res.startDate = res.mapToStartDate = datumVerpakking
              .querySelector("[datetime]")
              .getAttribute("datetime");
          } catch (error) {
            res.errors.push({
              error: new Error(`geen datetime`),
              remark: `geen datetime in ${res.anker}`,
            });
            res.startDate = null;
          }

          res.shortText =
            eventEl
              .querySelector(".styles_event-compact__subtitle__yGojc")
              ?.textContent.trim()
              .toLowerCase() ?? "";
          res.venueEventUrl = anchor.href;
          const uaRex = new RegExp(unavailabiltyTerms.join("|"), "gi");
          res.unavailable = !!eventEl.textContent.match(uaRex);
          res.soldOut =
            !!eventEl
              .querySelector(".styles_label__p9pQy")
              ?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;
          return res;
        }),
    { workerData, unavailabiltyTerms: terms.unavailability }
  );

  rawEvents = rawEvents
    .map((re) => workTitleAndSlug(re, this._s.app.harvest.possiblePrefix))
    .filter((event) => {
      return this.skipRegexCheck(event);
    })
    .map(mapToShortDate)
    .map(this.isMusicEventCorruptedMapper);

  this.dirtyLog(rawEvents);

  const eventGen = this.eventGenerator(rawEvents);
  // eslint-disable-next-line no-unused-vars
  const checkedEvents = await this.rawEventsAsyncCheck({
    eventGen,
    checkedEvents: [],
  });

  this.saveBaseEventlist(workerData.family, checkedEvents);

  const thisWorkersEvents = checkedEvents.filter(
    (eventEl, index) => index % workerData.workerCount === workerData.index
  );

  return this.mainPageEnd({ stopFunctie, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region      SINGLE PAGE
scraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  let pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ event }) => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };
      res.start = document
        .querySelector("#content [datetime]")
        .dateTime.substring(0, 19);
      return res;
    },
    { event }
  );

  // const ogImage = await page.evaluate(() =>
  //   Array.from(document.head.children).find(
  //     (child) =>
  //       child.hasAttribute("property") &&
  //       child.getAttribute("property").includes("image")
  //   )
  // );
  // if (ogImage) {
  //   await page.evaluate((ogImageSrc) => {
  //     const imageNew = document.createElement("img");
  //     imageNew.src = ogImageSrc;
  //     imageNew.id = "inserted-image";
  //     document.body.appendChild(imageNew);
  //   }, ogImage);
  // }

  // const imageRes = await getImage({
  //   _this: this,
  //   page,
  //   workerData,
  //   event,
  //   pageInfo,
  //   selectors: [
  //     '[class*="styles_event-header__figure"] img',
  //     "#inserted-image",
  //   ],
  //   mode: "image-src",
  // });

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: [".styles_event-header__figure___Er_N img"],
    mode: "image-src",
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: [".styles_ticket-prices__cvJdR"],
  });

  // if (priceRes.errors.length) {
  //   this.dirtyDebug(priceRes);
  // }

  pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
  pageInfo.price = priceRes.price;

  const { mediaForHTML, textForHTML } = await longTextSocialsIframes(
    page,
    event,
    pageInfo
  );
  pageInfo.mediaForHTML = mediaForHTML;

  pageInfo.textForHTML = textForHTML;

  const singlePageHTML = await page.evaluate(() => {
    return document.body.parentNode.outerHTML;
  });

  return this.singlePageEnd({
    pageInfo,
    stopFunctie,
    page,
    event,
    singlePageHTML,
  });
};
// #endregion                         SINGLE PAGE
