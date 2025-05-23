/* global document */
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/paradiso.js";
import getImage from "./gedeeld/image.js";
import {
  mapToStartDate,
  mapToStartTime,
  mapToShortDate,
  mapToDoorTime,
  combineStartTimeStartDate,
  combineDoorTimeStartDate,
} from "./gedeeld/datums.js";
import workTitleAndSlug from "./gedeeld/slug.js";
import terms from "../artist-db/store/terms.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 180023,
    waitUntil: "load",
    url: "https://www.paradiso.nl/nl",
  },
  singlePage: {
    timeout: 10000,
    waitUntil: "networkidle0",
  },
  app: {
    harvest: {
      dividers: [`+`],
      dividerRex: "[\\+]",
      artistsIn: ["title"],
    },
    mainPage: {
      requiredProperties: ["venueEventUrl", "title", "startDate"],
      asyncCheckFuncs: [
        "refused",
        "allowedEvent",
        "forbiddenTerms",
        "hasGoodTerms",
        "hasAllowedArtist",
        "spotifyConfirmation",
        "failure",
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

  const res = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData }) => ({
      anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${workerData.index}</a>`,
    }),
    { workerData }
  );

  await this.waitTime(250);

  // filter openen
  await page.evaluate(() => {
    Array.from(document.querySelectorAll(".chakra-button.css-cys37n"))
      .filter((knop) => knop.textContent.includes("type"))[0]
      .click();
  });
  await this.waitTime(250);

  // filter invoeren
  const aantalGeklikt = await page.evaluate(() => {
    const teKlikken = Array.from(document.querySelectorAll(".css-ymwss3"))
      .map((knop) => {
        const t = knop.textContent.trim().toLowerCase();
        if (t.includes("rock") || t.includes("punk")) {
          return knop;
        }
      })
      .filter((a) => a);
    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < teKlikken.length; i++) {
      setTimeout(() => {
        teKlikken[i].click();
      }, i * 150);
    }
    return teKlikken.length;
  });

  // wachten op aanklikken in page.evaluate
  await this.waitTime(50 + aantalGeklikt * 150);

  // verstuur filter
  await page.waitForSelector(".chakra-button.css-17dvuub");
  await page.click(".chakra-button.css-17dvuub");

  await this.waitTime(250);

  await this.autoScroll(page);
  await this.autoScroll(page);
  await this.autoScroll(page);
  await this.autoScroll(page);
  await this.autoScroll(page);

  // datum in concerten zetten
  await page.evaluate(() => {
    document.querySelectorAll(".css-1usmbod").forEach((datumGroep) => {
      const datum = datumGroep.textContent
        .toLowerCase()
        .trim()
        .substring(3, 10);
      const concertenOpDezeDatum =
        datumGroep.parentNode.querySelectorAll(".css-1agutam");
      // eslint-disable-next-line consistent-return
      concertenOpDezeDatum.forEach((concert) => {
        concert.setAttribute("date-datum", datum);
      });
    });
  });

  let rawEvents = await page.evaluate(
    ({ resBuiten, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll(".css-1agutam")).map((eventEl) => {
        // eslint-disable-next-line no-shadow
        const res = {
          ...resBuiten,
          errors: [],
        };

        res.cancelled = eventEl
          .querySelector(".chakra-skeleton")
          ?.textContent.toLowerCase()
          .includes("cancelled");
        if (res.cancelled) return res;

        res.title =
          eventEl.querySelector(".chakra-heading")?.textContent.trim() ?? "";
        const uaRex = new RegExp(unavailabiltyTerms.join("|"), "gi");
        res.unavailable = !!eventEl?.textContent.match(uaRex);
        if (res.unavailable) return res;

        res.shortText =
          eventEl.querySelector(".css-1ket9pb")?.textContent.trim() ?? "";

        const datum = eventEl.getAttribute("date-datum");

        res.mapToStartDate = datum;

        res.venueEventUrl = eventEl.href ?? null;
        res.soldOut = !!eventEl?.textContent.match(/uitverkocht|sold\s?out/i);
        return res;
      }),
    {
      workerData,
      resBuiten: res,
      unavailabiltyTerms: terms.unavailability,
    }
  );

  rawEvents = rawEvents
    .map((re) => workTitleAndSlug(re, this._s.app.harvest.possiblePrefix))
    .filter((event) => {
      return this.skipRegexCheck(event);
    })
    .filter((event) => !event.cancelled)
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

  const thisWorkersEvents = checkedEvents.filter((eventEl, index) => {
    return index % workerData.workerCount === workerData.index;
  });

  return this.mainPageEnd({ stopFunctie, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region      SINGLE PAGE
scraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const buitenRes = {
    anker: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
    errors: [],
  };

  await this.waitTime(250);

  let pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ buitenRes, event }) => {
      const res = { ...buitenRes };

      res.startDate = event.startDate;

      const t =
        document
          .querySelector(".css-65enbk")
          ?.textContent.toLowerCase()
          .trim() ?? "";
      res.doorTimeM = t.match(/doors.*(\d\d:\d\d)/);
      res.startTimeM = t.match(/main.*(\d\d:\d\d)/);
      if (Array.isArray(res.startTimeM)) {
        res.mapToStartTime = res.startTimeM[1];
        if (Array.isArray(res.doorTimeM)) {
          res.mapToDoorTime = res.doorTimeM[1];
        }
      } else if (Array.isArray(res.doorTimeM)) {
        res.mapToStartTime = res.doorTimeM[1];
      } else {
        res.startTimeM = t.match(/(\d\d:\d\d)/);
        if (Array.isArray(res.startTimeM)) {
          res.mapToStartTime = res.startTimeM[1];
        }
      }

      return res;
    },
    { buitenRes, event }
  );

  pageInfo = mapToStartTime(pageInfo);
  pageInfo = mapToDoorTime(pageInfo);
  pageInfo = combineStartTimeStartDate(pageInfo);
  pageInfo = combineDoorTimeStartDate(pageInfo);

  // const imageSrc = await page.evaluate(() => {
  //   return document.querySelector("[property='og:image']")?.content ?? "";
  // });

  // const imageRes = await getImage({
  //   _this: this,
  //   page,
  //   workerData,
  //   event,
  //   pageInfo,
  //   selectors: [],
  //   mode: "direct-input",
  //   imageSrc,
  // });

  // src instellen op imagewrapper img
  await page
    .evaluate(() => {
      const twittImg = document.querySelector("[name='twitter:image']").content;
      const dieImage = document.querySelector(".img-wrapper img");
      if (twittImg) {
        dieImage.src = twittImg;
        return twittImg;
      }

      const srcsetEl = document.querySelector(
        'source[srcset*="assets.paradiso.nl"][srcset*="1024"], source[srcset*="assets.paradiso.nl"][srcset*="1280"], source[srcset*="assets.paradiso.nl"], source[srcset]'
      );
      dieImage.src = srcsetEl.srcset.match(
        /(https?:\/\/[^\s]+?\.(webp|jpg|jpeg|png))/im
      )[0];

      return dieImage.src;
    })
    .catch((err) => {
      this.handleError(err, `fout srcset match ${pageInfo.anker}`);
    });

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: [".img-wrapper img"],
    mode: "image-src",
  });

  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: [
      '[href*="https://tickets.paradiso.nl"]',
      ".css-1yk0d0u",
      ".css-1623pe7",
      ".chakra-container",
    ],
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
