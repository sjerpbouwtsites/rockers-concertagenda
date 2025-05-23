/* global document */
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/baroeg.js";
import getImage from "./gedeeld/image.js";
import {
  mapToShortDate,
  combineStartTimeStartDate,
  mapToStartDate,
  mapToStartTime,
} from "./gedeeld/datums.js";
import workTitleAndSlug from "./gedeeld/slug.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },
  mainPage: {
    timeout: 45000,
    url: "https://baroeg.nl/agenda/",
  },
  singlePage: {
    timeout: 15000,
  },
  app: {
    harvest: {
      dividers: [`+`],
      dividerRex: "[\\+]",
      artistsIn: ["title", "shortText"],
    },
    mainPage: {
      requiredProperties: ["venueEventUrl", "title", "start"],
      // baroeg heeft een betrouwbare eigen categorisering
      asyncCheckFuncs: [
        "refused",
        "allowedEvent",
        "explicitEventGenres",
        "hasAllowedArtist",
        "spotifyConfirmation",
        "failure",
      ],
    },
    singlePage: {
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

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData }) =>
      Array.from(document.querySelectorAll(".wpt_listing .wp_theatre_event"))
        .map((eventEl) => {
          const venueEventUrl = eventEl.querySelector(
            ".wp_theatre_event_title a + a"
          ).href;
          const categorieTeksten = Array.from(
            eventEl.querySelectorAll(".wpt_production_categories li")
          ).map((li) => {
            const categorieNaam = li.textContent.toLowerCase().trim();
            return categorieNaam;
          });
          return {
            eventEl,
            categorieTeksten,
            venueEventUrl,
          };
        })
        .filter((eventData) => eventData)
        .map(({ eventEl, categorieTeksten, venueEventUrl }) => {
          let title =
            eventEl
              .querySelector(".wp_theatre_event_title")
              ?.textContent.trim() ?? null;
          const res = {
            anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
          };

          res.soldOut = title.match(/uitverkocht|sold\s?out/i) ?? false;
          if (title.match(/uitverkocht|sold\s?out/i)) {
            title = title
              .replace(/uitverkocht|sold\s?out/i, "")
              .replace(/^:\s+/, "");
          }
          res.title = title;

          res.eventGenres = Array.from(
            eventEl.querySelectorAll(".wpt_production_category")
          ).map((c) => c.textContent);

          res.shortText =
            eventEl
              .querySelector(".wp_theatre_prod_excerpt")
              ?.textContent.trim() ?? null;
          // res.shortText += categorieTeksten;

          res.venueEventUrl = venueEventUrl;

          res.mapToStartDate =
            eventEl
              .querySelector(".wp_theatre_event_startdate")
              ?.textContent.trim()
              .substring(3, 26) ?? "";
          res.mapToStartTime =
            eventEl.querySelector(".wp_theatre_event_starttime")?.textContent ??
            "";

          return res;
        }),
    { workerData }
  );

  rawEvents = rawEvents
    .map((re) => workTitleAndSlug(re, this._s.app.harvest.possiblePrefix))
    .filter((event) => {
      return this.skipRegexCheck(event);
    })
    .map((event) => mapToStartDate(event, "dag-maandNummer-jaar", this.months))
    .map(mapToStartTime)
    .map(mapToShortDate)
    .map(combineStartTimeStartDate)
    .map(this.isMusicEventCorruptedMapper);

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

  return this.mainPageEnd({
    stopFunctie,
    page,
    rawEvents: thisWorkersEvents,
  });
};
// #endregion                          MAIN PAGE

// #region      SINGLE PAGE
scraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ event }) => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };

      res.soldOut = !!(
        document.querySelector(".wp_theatre_event_tickets_status_soldout") ??
        null
      );

      return res;
    },
    { event }
  );

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: [".hero-area [style*='background-image']"],
    mode: "background-src",
  });

  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: [".wp_theatre_event_tickets"],
  });

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
