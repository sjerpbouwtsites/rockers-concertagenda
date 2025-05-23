/* global document */
import { workerData } from "worker_threads";
import longTextSocialsIframes from "./longtext/afaslive.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import getImage from "./gedeeld/image.js";
import {
  mapToStartTime,
  combineDoorTimeStartDate,
  mapToStartDate,
  mapToShortDate,
  mapToDoorTime,
  combineStartTimeStartDate,
} from "./gedeeld/datums.js";
import workTitleAndSlug from "./gedeeld/slug.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },
  mainPage: {
    timeout: 120043,
    url: "https://www.afaslive.nl/agenda",
  },
  singlePage: {
    timeout: 15000,
  },
  app: {
    harvest: {
      dividers: [`+`, "&"],
      dividerRex: "[\\+&]",
      artistsIn: ["title"],
    },
    mainPage: {
      requiredProperties: ["venueEventUrl"],
      asyncCheckFuncs: [
        "refused",
        "allowedEvent",
        "hasAllowedArtist",
        "spotifyConfirmation",
        "getMetalEncyclopediaConfirmation",
        "failure",
      ],
      skipEventRegexes: [/world\s?series\s?of\s?darts/im, /productiedag/im],
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

  await this.autoScroll(page);
  await this.waitTime(750);
  await this.autoScroll(page);
  await this.waitTime(750);
  await this.autoScroll(page);
  await this.waitTime(750);
  await this.autoScroll(page);

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData }) =>
      Array.from(document.querySelectorAll(".grid-item article")).map(
        (agendaBlock) => {
          const title =
            agendaBlock.querySelector("label")?.textContent.trim() ?? "";
          const res = {
            anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
            title,
          };
          res.venueEventUrl = agendaBlock.querySelector("a")?.href ?? null;

          res.mapToStartDate = agendaBlock
            .querySelector("datetime")
            ?.textContent.trim();
          res.soldOut =
            !!agendaBlock?.innerHTML.match(/uitverkocht|sold\s?out/i) ?? false;
          return res;
        }
      ),
    { workerData }
  );

  rawEvents = rawEvents
    .map(workTitleAndSlug)
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

  await this.waitTime(125);

  let pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ event }) => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };

      const timeTableText =
        document
          .querySelector(".dates + .timesTable")
          ?.textContent.trim()
          .toLowerCase() ?? "";

      const dtM = timeTableText.match(/deuren.*(\d\d:\d\d)/);
      if (Array.isArray(dtM)) {
        res.mapToDoorTime = dtM[1];
      }

      const stM = timeTableText.match(/aanvang.*(\d\d:\d\d)/);
      if (Array.isArray(stM)) {
        res.mapToStartTime = stM[1];
      }

      if (!res.mapToStartTime && res.mapToDoorTime) {
        res.mapToStartTime = res.mapToDoorTime;
        res.mapToDoorTime = null;
      } else if (!res.mapToStartTime && !res.mapToDoorTime) {
        res.mapToStartTime = "20:00";
      }

      document.querySelectorAll("article .wysiwyg p").forEach((paragraph) => {
        const anker = paragraph.querySelector("a") ?? null;
        if (!anker) return;
        if (
          anker.href.includes("eten-drinken") ||
          anker.href.includes("Tassenbeleid")
        ) {
          // eslint-disable-next-line no-param-reassign
          paragraph.innerHTML = "";
        }
      });

      return res;
    },
    { event }
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
    selectors: ["figure img"],
    mode: "image-src",
  });

  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: [".jspPane", "#tickets"],
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
