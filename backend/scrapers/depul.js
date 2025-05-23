/* global document */
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/depul.js";
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

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 35000,
    url: "https://www.livepul.com/agenda/",
  },
  singlePage: {
    timeout: 10000,
  },
  app: {
    mainPage: {
      requiredProperties: ["venueEventUrl", "title"],
      asyncCheckFuncs: ["refused", "allowedEvent"],
      skipEventRegexes: [/lusion/im, /soul!\s?power!\slive!/im],
    },
    singlePage: {
      requiredProperties: ["venueEventUrl", "title", "price", "start"],
      // asyncCheckFuncs: ['goodTerms', 'isRock', 'saveRefused', 'emptyFailure'],
      asyncCheckFuncs: ["hasGoodTerms"],
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
  await this.waitTime(50);

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ months, workerData }) =>
      Array.from(document.querySelectorAll(".agenda-item")).map((rawEvent) => {
        const title = rawEvent.querySelector("h2")?.textContent.trim() ?? "";
        const res = {
          anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} - main - ${title}</a>`,
          errors: [],
          title,
        };
        res.shortText =
          rawEvent.querySelector(".text-box .desc")?.textContent.trim() ?? "";

        res.soldOut = !!rawEvent.querySelector("._soldout");

        res.mapToStartDate =
          rawEvent
            .querySelector(".time")
            ?.textContent.replaceAll(/\s{1,500}/g, " ") ?? "";

        res.venueEventUrl = rawEvent.querySelector("a")?.href ?? null;
        return res;
      }),
    { months: this.months, workerData }
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

  return this.mainPageEnd({ stopFunctie, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region      SINGLE PAGE
scraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  // op tabel classnames zetten
  await page.evaluate(() => {
    document.querySelectorAll(".inner li").forEach((li) => {
      var a = li.textContent.toLowerCase();
      var c = a;
      Array.from(li.querySelectorAll("*")).forEach((aaa) => {
        c = c.replace(aaa.textContent.toLowerCase(), "");
      });
      c = c.split(" ")[0].trim();
      if (c) {
        li.classList.add(c);
      }
    });
  });

  let pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ months, event }) => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };

      res.mapToDoorTime =
        document.querySelector(".inner .open")?.textContent ?? null;
      res.mapToStartTime =
        document.querySelector(".inner .aanvang")?.textContent ?? null;
      if (!res.mapToStartTime) res.mapToStartTime = res.mapToDoorTime;

      return res;
    },
    { months: this.months, event }
  );
  pageInfo.startDate = event.startDate;
  pageInfo = mapToStartTime(pageInfo);
  pageInfo = combineStartTimeStartDate(pageInfo);
  pageInfo = mapToDoorTime(pageInfo);
  pageInfo = combineDoorTimeStartDate(pageInfo);

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: ["#agenda-title-bar"],
    mode: "background-src",
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  // heeft term gratis
  const heeftTermGratis = await page.evaluate(() => {
    return (
      document
        .querySelector(".column.right .inner")
        ?.textContent.toLowerCase()
        .includes("gratis") ?? false
    );
  });

  if (!heeftTermGratis) {
    const priceRes = await this.getPriceFromHTML({
      page,
      event,
      pageInfo,
      selectors: [".ticketprijs", ".avondkassa"],
    });
    this.dirtyTalk(`${event.title} heeft gratis ${heeftTermGratis}`);
    pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
    pageInfo.price = priceRes.price;
  } else {
    pageInfo.price = 0;
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
