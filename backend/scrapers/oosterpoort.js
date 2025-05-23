/* global document */
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import longTextSocialsIframes from "./longtext/oosterpoort.js";
import getImage from "./gedeeld/image.js";
import { mapToShortDate } from "./gedeeld/datums.js";
import workTitleAndSlug from "./gedeeld/slug.js";
import terms from "../artist-db/store/terms.js";

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 60017,
    url: "https://www.spotgroningen.nl/programma/#genres=muziek&subgenres=metal-heavy,pop-rock",
  },
  singlePage: {
    timeout: 15000,
    waitTime: "load",
  },
  app: {
    harvest: {
      dividers: [`+`, `&`],
      dividerRex: "[\\+&]",
      artistsIn: ["title"],
    },
    mainPage: {
      requiredProperties: ["venueEventUrl", "title", "start"],
      asyncCheckFuncs: [
        "allowedEvent",
        "refused",
        "hasAllowedArtist",
        "forbiddenTerms",
        "hasGoodTerms",
        "spotifyConfirmation",
        "failure",
      ],
      // asyncCheckFuncs: ['allowed', 'event', 'refused', 'forbiddenTerms', 'isRock', 'saveRefused', 'emptyFailure'],
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

  await this.waitTime(50);

  const cookiesNodig = await page.evaluate(() =>
    document.querySelector("html").classList.contains("has-open-cookie")
  );

  if (cookiesNodig) {
    await page.evaluate(() => {
      document.querySelector("[name*='marketing']")?.click();
      document.querySelector(".cookie__settings .cookie__process")?.click();
      document.querySelector(".cookie__accept.button")?.click();
    });
    await this.waitTime(50);
  }

  //  await this.autoScroll(page);
  await this.autoScroll(page);

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll(".program__list .program__item"))
        .filter((eventEl) => !eventEl.classList.contains("is-hidden"))
        .map((eventEl) => {
          const title =
            eventEl.querySelector(".program__content h2").textContent ?? "";

          const res = {
            anker: `<a class='page-info' href="${document.location.href}">${workerData.family} - main - ${title}</a>`,
            errors: [],
            title,
          };

          res.shortText =
            eventEl.querySelector(".program__content h2")?.textContent ?? "";

          const ddd = eventEl
            .querySelector(".program__date")
            .getAttribute("datetime");
          res.start = ddd;
          res.startDate = ddd.substring(0, 10);
          res.startTime = ddd.substring(11, 16);

          res.venueEventUrl =
            eventEl.querySelector(".program__link")?.href ?? null;
          const uaRex = new RegExp(unavailabiltyTerms.join("|"), "gi");
          res.unavailable = !!eventEl.textContent.match(uaRex);
          res.soldOut =
            !!eventEl
              .querySelector(".program__status")
              ?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;
          res.longText =
            eventEl.querySelector(".program__content")?.textContent ?? null; // tijdelijk om in te controleren
          return res;
        }),
    {
      workerData,
      unavailabiltyTerms: terms.unavailability,
    }
  );

  this.dirtyLog(rawEvents);

  rawEvents = rawEvents
    .map((re) => workTitleAndSlug(re, this._s.app.harvest.possiblePrefix))
    // .filter((event) => {
    //   return this.skipRegexCheck(event);
    // })
    .map(mapToShortDate);
  //.map(this.isMusicEventCorruptedMapper);
  this.dirtyLog(rawEvents);

  const eventGen = this.eventGenerator(rawEvents);
  // eslint-disable-next-line no-unused-vars
  const checkedEvents = await this.rawEventsAsyncCheck({
    eventGen,
    checkedEvents: [],
  });

  this.dirtyLog(checkedEvents);

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

  const cookiesReq = await page.evaluate(() => {
    return (
      document.querySelector(".overlay.cookie") ||
      document.querySelector(".cookie__accept")
    );
  });
  if (cookiesReq) {
    await page.evaluate(() => {
      const b1 = document.querySelector(".cookie__accept");
      const b2 = document.querySelector("[name*=marketing]");
      const b3 = document.querySelector(".cookie__process.overlay__button");
      [b1, b2, b3]
        .filter((b) => !!b)
        .forEach((b) => {
          b.click();
        });
    });
  }

  await this.waitTime(1000);

  const pageInfo = await page
    .evaluate(
      // eslint-disable-next-line no-shadow
      ({ event }) => {
        const res = {
          anker: `<a class='page-info' href='${document.location.href}'>${document.title}</a>`,
          errors: [],
        };

        try {
          if (
            document.querySelector(".event__cta") &&
            document.querySelector(".event__cta").hasAttribute("disabled")
          ) {
            res.soldOut += true;
          }
        } catch (caughtError) {
          res.errors.push({
            error: caughtError,
            remarks: `check if disabled fail  ${res.anker}`,
            toDebug: event,
          });
        }

        return res;
      },
      { event }
    )
    .catch((caughtError) => {
      this.handleError(caughtError, "pageInfo catch", "notice", {
        event,
        pageInfo,
      });
    });

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: [".hero__image", ".festival__header__image"],
    mode: "image-src",
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: [".event__pricing__costs", ".festival__tickets__toggle"],
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
