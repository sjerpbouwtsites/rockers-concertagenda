/* global document */
import { workerData } from "worker_threads";
import { getImageByCanvas } from "./gedeeld/image.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/doornroosje.js";
import workTitleAndSlug from "./gedeeld/slug.js";
import {
  mapToShortDate,
  mapToDoorTime,
  mapToStartTime,
  combineDoorTimeStartDate,
  combineStartTimeStartDate,
} from "./gedeeld/datums.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 60000,
    url: "https://www.doornroosje.nl/?genre=metal%252Cpunk%252Cnoise-rock%252Cdark-folk%252Cdeathcore%252Cdesert-rock%252Cemo%252Cprogressieve-metal%252Cpunkrock%252Cspace-rock%252Ctrash%252Ccrossover-metal%252Cspace-metal",
    waitUntil: "load",
  },
  singlePage: {
    timeout: 15000,
    useCache: false,
  },
  app: {
    harvest: {
      dividers: [`+`],
      dividerRex: "[\\+]",
      artistsIn: ["title", "shortText"],
    },
    mainPage: {
      requiredProperties: ["venueEventUrl", "title"],
      asyncCheckFuncs: [
        "refused",
        "allowedEvent",
        "explicitEventGenres",
        "forbiddenTerms",
        "hasAllowedArtist",
        "hasGoodTerms",
        "spotifyConfirmation",
      ],
      skipEventRegexes: [/kids.*billies/im],
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

  await page.waitForSelector(".c-program__title");
  await this.waitTime(50);

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData, months }) =>
      Array.from(document.querySelectorAll(".c-program__item")).map(
        (eventEl) => {
          const title =
            eventEl
              .querySelector(".c-program__title--main")
              ?.textContent.trim() ?? null;

          const res = {
            anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} - main - ${title}</a>`,
            errors: [],
            title,
          };
          res.shortText =
            eventEl
              .querySelector(".c-program__title--small")
              ?.textContent.trim()
              .replace(res.title, "")
              .replace(/\s{2, 500}/g) ?? "";
          res.venueEventUrl = eventEl?.href;
          res.soldOut =
            !!eventEl?.innerHTML.match(/uitverkocht|sold\s?out/i) ?? false;
          const startJaarMatch =
            eventEl.parentNode.parentNode
              .querySelector(".c-program__month")
              ?.textContent.match(/\d\d\d\d/) ?? null;
          const jaar =
            Array.isArray(startJaarMatch) && startJaarMatch.length
              ? startJaarMatch[0]
              : new Date().getFullYear();
          const maandNaam =
            eventEl.parentNode.parentNode
              .querySelector(".c-program__month")
              ?.textContent.match(/\w*/) ?? null;
          const maand = months[maandNaam];
          const dagMatch = eventEl
            .querySelector(".c-program__date")
            ?.textContent.match(/\d+/);
          let dag;
          if (dagMatch && Array.isArray(dagMatch) && dagMatch.length) {
            dag = dagMatch[0].padStart(2, "0");
          }
          if (dag && maand && jaar) {
            res.startDate = `${jaar}-${maand}-${dag}`;
          } else {
            res.startDate = null;
          }
          return res;
        }
      ),
    { workerData, months: this.months }
  );

  try {
    let lastWorkingEventDate = null;
    rawEvents.forEach((rawEvent) => {
      if (rawEvent.startDate) {
        lastWorkingEventDate = rawEvent.startDate;
      } else {
        // eslint-disable-next-line no-param-reassign
        rawEvent.startDate = lastWorkingEventDate;
      }
      return rawEvent;
    });
  } catch (dateMapError) {
    this.handleError(dateMapError, "start rawEvents mapper");
  }

  rawEvents = rawEvents
    .map((re) => workTitleAndSlug(re, this._s.app.harvest.possiblePrefix))
    .filter((event) => {
      return this.skipRegexCheck(event);
    })
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

  let pageInfo = {
    anker: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
    errors: [],
  };
  if (
    !event.venueEventUrl.includes("soulcrusher") &&
    !event.venueEventUrl.includes("festival") &&
    !event.venueEventUrl.includes("sonic-whip")
  ) {
    pageInfo = await page
      .evaluate(
        // eslint-disable-next-line no-shadow
        ({ months, event }) => {
          const res = {
            anker: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
            errors: [],
          };

          // genre verwijderen en naar shorttext
          res.shortText =
            (event?.shortText ? event.shortText : "") +
            Array.from(document.querySelectorAll(".c-event-row__title"))
              .map((title) => {
                if (title.textContent.includes("genre")) {
                  const row = title.parentNode.parentNode;
                  return row
                    .querySelector(".c-event-row__content")
                    ?.textContent.toLowerCase()
                    .trim();
                }
                return null;
              })
              .filter((a) => a)
              .join("");

          const evData = document.querySelector(
            ".container.s-event .c-event-data"
          );
          const tijdTextMatches =
            evData?.textContent
              .replaceAll(/\s+\s/g, " ")
              .toLowerCase()
              .match(/\d\d:\d\d/g) ?? null;
          if (!Array.isArray(tijdTextMatches)) {
            res.mapToStartTime = "20:00";
            res.errors.push({
              error: new Error(`geen tijdTextMatches Doornroosje`),
              remarks: `${
                res.anker
              } ".container.s-event .c-event-data" bestaat: ${!!evData?.length}`,
            });
          } else {
            if (tijdTextMatches.length > 1) {
              res.mapToDoorTime = tijdTextMatches[0];
              res.mapToStartTime = tijdTextMatches[1];
            } else {
              res.mapToStartTime = tijdTextMatches[0];
            }
          }

          return res;
        },
        { months: this.months, event }
      )
      .catch((err) =>
        this.handleError(err, "ongevangen err pageInfo doornroosje")
      );
  } else {
    //TODO
    pageInfo = {
      corrupted: true,
      errors: [],
    };
    return this.singlePageEnd({
      pageInfo,
      stopFunctie,
      page,
      event,
      singlePageHTML: null,
    });
  }

  pageInfo.startDate = event.startDate;

  pageInfo = mapToDoorTime(pageInfo);
  pageInfo = mapToStartTime(pageInfo);
  pageInfo = combineDoorTimeStartDate(pageInfo);
  pageInfo = combineStartTimeStartDate(pageInfo);

  const imageRes = await getImageByCanvas(
    page,
    event,
    this,
    ".c-header-event__image img, .c-festival-header__logo img"
  ).catch(this.handleError);

  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;
  pageInfo.image = null;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: [".c-btn__price", ".c-intro__col"],
  });
  const uitverkocht = await page.evaluate(
    () => !!document.querySelector(".c-sold-out__title")
  );

  if (priceRes.errors.length && !uitverkocht) {
    pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
    pageInfo.price = priceRes.price;
  } else {
    pageInfo.price = null;
    pageInfo.soldOut = true;
  }

  const { mediaForHTML, textForHTML } = await longTextSocialsIframes(
    page,
    event,
    pageInfo
  );
  pageInfo.mediaForHTML = mediaForHTML;

  pageInfo.textForHTML = textForHTML;

  return this.singlePageEnd({
    pageInfo,
    stopFunctie,
    page,
    event,
    singlePageHTML: null,
  });
};
// #endregion                         SINGLE PAGE
