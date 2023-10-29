/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/baroeg.js';
import getImage from './gedeeld/image.js';
import { combineStartTimeStartDate, mapToStartDate, mapToStartTime } from './gedeeld/datums.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const baroegScraper = new AbstractScraper({
  workerData: { ...workerData },
  mainPage: {
    timeout: 45000,
    url: 'https://baroeg.nl/agenda/',
  },
  singlePage: {
    timeout: 15000,
  },
  app: {
    mainPage: {
      requiredProperties: ['venueEventUrl', 'title', 'start'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'start'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

baroegScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
baroegScraper.mainPageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);
  const isRefused = await this.rockRefuseListCheck(event, workingTitle);
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }

  const isAllowed = await this.rockAllowListCheck(event, workingTitle);
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  if (hasForbiddenTerms.success) {
    this.saveRefusedTitle(workingTitle);
    hasForbiddenTerms.success = false;
    return hasForbiddenTerms;
  }

  this.saveAllowedTitle(workingTitle);

  return {
    workingTitle,
    reason: [isRefused.reason, isAllowed.reason, hasForbiddenTerms.reason].join(';'),
    event,
    success: true,
  };
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
baroegScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    return this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData }) =>
      Array.from(document.querySelectorAll('.wpt_listing .wp_theatre_event'))
        .map((eventEl) => {
          const venueEventUrl = eventEl.querySelector('.wp_theatre_event_title a + a').href;
          const categorieTeksten = Array.from(
            eventEl.querySelectorAll('.wpt_production_categories li'),
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
          let title = eventEl.querySelector('.wp_theatre_event_title')?.textContent.trim() ?? null;
          const res = {
            anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
          };

          res.soldOut = title.match(/uitverkocht|sold\s?out/i) ?? false;
          if (title.match(/uitverkocht|sold\s?out/i)) {
            title = title.replace(/uitverkocht|sold\s?out/i, '').replace(/^:\s+/, '');
          }
          res.title = title;

          res.shortText =
            eventEl.querySelector('.wp_theatre_prod_excerpt')?.textContent.trim() ?? null;
          res.shortText += categorieTeksten;

          res.venueEventUrl = venueEventUrl;

          res.mapToStartDate =
            eventEl
              .querySelector('.wp_theatre_event_startdate')
              ?.textContent.trim()
              .substring(3, 26) ?? '';
          res.mapToStartTime =
            eventEl.querySelector('.wp_theatre_event_starttime')?.textContent ?? '';

          return res;
        }),
    { workerData },
  );

  rawEvents = rawEvents.map((event) => mapToStartDate(event, 'dag-maandNummer-jaar', this.months));
  rawEvents = rawEvents.map(mapToStartTime);
  rawEvents = rawEvents.map(combineStartTimeStartDate);
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents);
  const thisWorkersEvents = rawEvents.filter(
    (eventEl, index) => index % workerData.workerCount === workerData.index,
  );
  return this.mainPageEnd({ stopFunctie, page, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
baroegScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ event }) => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };

      res.soldOut = !!(document.querySelector('.wp_theatre_event_tickets_status_soldout') ?? null);

      return res;
    },
    { event },
  );

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: [".hero-area [style*='background-image']"],
    mode: 'background-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.wp_theatre_event_tickets'],
  });
  pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
  pageInfo.price = priceRes.price;

  const { mediaForHTML, socialsForHTML, textForHTML } = await longTextSocialsIframes(
    page,
    event,
    pageInfo,
  );
  pageInfo.mediaForHTML = mediaForHTML;
  pageInfo.socialsForHTML = socialsForHTML;
  pageInfo.textForHTML = textForHTML;

  return this.singlePageEnd({
    pageInfo,
    stopFunctie,
    page,
    event,
  });
};
// #endregion                         SINGLE PAGE
