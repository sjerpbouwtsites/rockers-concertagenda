/* eslint-disable func-names */
/* global document */
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/victorie.js";
import getImage from "./gedeeld/image.js";
import {
  combineStartTimeStartDate,
  mapToStartDate,
  mapToStartTime,
  mapToDoorTime,
  combineDoorTimeStartDate,
  mapToShortDate,
} from "./gedeeld/datums.js";
import workTitleAndSlug from "./gedeeld/slug.js";
import terms from "../artist-db/store/terms.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },
  mainPage: {
    timeout: 45000,
    url: "https://www.podiumvictorie.nl/programma/",
  },
  singlePage: {
    timeout: 10000,
  },
  app: {
    harvest: {
      dividers: [`,`, ` en`],
      dividerRex: "[\\,]",
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
        "failure",
      ],
      // asyncCheckFuncs: ['allowed', 'event', 'refused', 'forbiddenTerms', 'emptySuccess'],
    },
    singlePage: {
      requiredProperties: ["venueEventUrl", "title", "start"],
      asyncCheckFuncs: ["success"],
      // asyncCheckFuncs: ['goodTerms', 'isRock', 'saveRefused', 'emptyFailure'],
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
      Array.from(document.querySelectorAll(".event-line")).map((eventEl) => {
        const venueEventUrl = eventEl.querySelector("a").href ?? "";
        const title = eventEl.querySelector("h2").textContent.trim() ?? "";
        const res = {
          title,
          errors: [],
          venueEventUrl,
          anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
        };
        res.shortText =
          eventEl.querySelector(".subtitles p")?.textContent.trim() ?? "";
        res.soldOut = !!eventEl.textContent
          .toLowerCase()
          .includes("uitverkocht");
        res.start = eventEl.querySelector("time").getAttribute("datetime");
        res.startDate = res.start.substring(0, 10);
        return res;
      }),
    { workerData }
  );

  rawEvents = rawEvents
    .map((re) => workTitleAndSlug(re, this._s.app.harvest.possiblePrefix))
    .filter((event) => {
      return this.skipRegexCheck(event);
    })
    .map((event) => mapToStartDate(event, "dag-maandNaam", this.months))
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

  let pageInfo = {
    title: event.title,
    errors: [],
    anker: `<a class='page-info' href='${event.venueEventUrl}'>${workerData.family} single - ${event.title}</a>`,
  };

  // classes zetten op info tabel
  await page.evaluate(() => {
    document.querySelectorAll("dt").forEach((dt) => {
      const blurb = dt.textContent.toLowerCase().trim().replaceAll(" ", "-");
      dt.parentNode.classList.add(blurb);
      console.log(dt.parentNode);
    });
  });

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: [".image-text-container .h-full"],
    mode: "image-src",
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const heeftPrijs = await page.evaluate(() => {
    return !!document.querySelector(".ticket, .deur-ticket");
  });

  if (heeftPrijs) {
    const priceRes = await this.getPriceFromHTML({
      page,
      event,
      pageInfo,
      selectors: [".ticket", ".deur-ticket"],
    });
    pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
    pageInfo.price = priceRes.price;
  } else {
    pageInfo.price = 0;
  }

  pageInfo.mapToDoorTime = await page.evaluate(() => {
    return document
      .querySelector(".deur-open")
      ?.textContent.trim()
      .toLowerCase();
  });
  pageInfo = mapToDoorTime(pageInfo);
  pageInfo = combineDoorTimeStartDate(pageInfo);

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
