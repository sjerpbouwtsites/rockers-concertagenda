/* global document */
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/gebouwt.js";
import getImage from "./gedeeld/image.js";
import {
  mapToStartDate,
  combineDoorTimeStartDate,
  mapToDoorTime,
  mapToShortDate,
  mapToStartTime,
  combineStartTimeStartDate,
} from "./gedeeld/datums.js";
import workTitleAndSlug from "./gedeeld/slug.js";
import terms from "../artist-db/store/terms.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },
  mainPage: {
    url: "https://gebouw-t.nl/agenda/?genre=&search=&themes%5B%5D=gitaren",
  },
  singlePage: {
    timeout: 10000,
  },
  app: {
    harvest: {
      dividers: [`+`],
      dividerRex: "[\\+]|(?:s[-])",
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
      requiredProperties: ["venueEventUrl", "title", "start"],
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
    ({ workerData, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll(".event-card ")).map((eventEl) => {
        const title = eventEl.querySelector(".artist")?.textContent ?? "";
        const res = {
          anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title,
        };

        res.mapToStartDate =
          document
            .querySelector(".date")
            ?.textContent.trim()
            .toLowerCase()
            .replace("'", "") ?? "";

        res.venueEventUrl = eventEl.href;
        const uaRex = new RegExp(unavailabiltyTerms.join("|"), "gi");
        res.unavailable = !!eventEl.textContent.match(uaRex);
        res.soldOut = !!eventEl.querySelector(".status.soldout");
        res.shortText = eventEl.querySelector(".info-sub")?.textContent ?? null;
        return res;
      }),
    { workerData, unavailabiltyTerms: terms.unavailability }
  );

  rawEvents = rawEvents
    .map((re) => workTitleAndSlug(re, this._s.app.harvest.possiblePrefix))
    .filter((event) => {
      return this.skipRegexCheck(event);
    })
    .map((event) => mapToStartDate(event, "dag-maandNaam-jaar", this.months))
    .map(mapToShortDate)
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

      const lis = Array.from(document.querySelectorAll(".event-info-data li"));
      const openLi = lis.find((li) => li?.textContent?.includes("open"));
      let startLi = lis.find((li) => li?.textContent?.includes("aanvang"));
      if (!startLi) {
        startLi = document.querySelector(".event-info-data");
      }

      res.mapToStartTime = startLi.textContent.trim().toLowerCase() ?? "";
      res.mapToDoorTime = openLi
        ? openLi.textContent.trim().toLowerCase()
        : null;

      return res;
    },
    { months: this.months, event }
  );
  pageInfo.startDate = event.startDate;
  pageInfo = mapToStartTime(pageInfo);
  pageInfo = mapToDoorTime(pageInfo);
  pageInfo = combineStartTimeStartDate(pageInfo);
  pageInfo = combineDoorTimeStartDate(pageInfo);

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: [".image-wrapper img"],
    mode: "image-src",
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: [".ticket-price"],
  });

  if (pageInfo.errors.length) {
    pageInfo.price = 0;
  } else {
    pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
    pageInfo.price = priceRes.price;
  }

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
