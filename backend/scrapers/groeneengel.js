/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/groeneengel.js';
import getImage from './gedeeld/image.js';
import terms from './gedeeld/terms.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const groeneEngelScraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 25076,
    waitUntil: 'load',
    url: 'https://www.groene-engel.nl/programma/?filter=concert',
  },
  singlePage: {
    timeout: 20077,
  },
  app: {
    mainPage: {
      requiredProperties: ['venueEventUrl', 'title'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'price', 'start'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

groeneEngelScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
groeneEngelScraper.mainPageAsyncCheck = async function (event) {
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

  return {
    workingTitle,
    event,
    success: true,
    reason: [isRefused.reason, isAllowed.reason, hasForbiddenTerms.reason],
  };
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
groeneEngelScraper.singlePageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);

  const isAllowed = await this.rockAllowListCheck(event, workingTitle);
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTerms = await this.hasForbiddenTerms(event, ['title', 'textForHTML']);
  if (hasForbiddenTerms.success) {
    this.saveRefusedTitle(workingTitle);
    hasForbiddenTerms.success = false;
    return hasForbiddenTerms;
  }

  const hasGoodTerms = await this.hasGoodTerms(event, ['title', 'textForHTML']);
  if (hasGoodTerms.success) {
    this.saveAllowedTitle(workingTitle);
    return hasGoodTerms;
  }

  const isRockRes = await this.isRock(event);
  if (isRockRes.success) {
    this.saveAllowedTitle(workingTitle);
  } else {
    this.saveRefusedTitle(workingTitle);
  }
  return isRockRes;
};
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
groeneEngelScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    return await this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  let baseEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData, unavailabiltyTerms, months }) =>
      Array.from(document.querySelectorAll('.collection-wrapper .event-part')).map((eventEl) => {
        const title = eventEl.querySelector('.part-title')?.textContent ?? null;
        const res = {
          anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title,
        };
        res.venueEventUrl = eventEl.querySelector('.left-side')?.href ?? '';
        const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
        res.unavailable = !!eventEl.textContent.match(uaRex);
        res.soldOut =
          !!eventEl.querySelector('.bottom-bar')?.textContent.match(/uitverkocht|sold\s?out/i) ??
          null;

        res.startDateMatch =
          eventEl
            .querySelector('.date-label')
            ?.textContent.match(/\s(?<datum>\d{1,2}\s\w+\s\d\d\d\d)/) ?? null;
        if (res.startDateMatch && res.startDateMatch?.groups)
          res.startDateRauw = res.startDateMatch.groups.datum;

        res.dag = res.startDateMatch.groups.datum.split(' ')[0].padStart(2, '0');
        res.maand = res.startDateMatch.groups.datum.split(' ')[1];
        res.maand = months[res.maand];
        res.jaar = res.startDateMatch.groups.datum.split(' ')[2];

        res.startDate = `${res.jaar}-${res.maand}-${res.dag}`;

        return res;
      }),
    { workerData, unavailabiltyTerms: terms.unavailability, months: this.months },
  );

  baseEvents = baseEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, baseEvents);
  const thisWorkersEvents = baseEvents.filter(
    (eventEl, index) => index % workerData.workerCount === workerData.index,
  );
  return await this.mainPageEnd({ stopFunctie, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
groeneEngelScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const pageInfo = await page.evaluate(
    ({ event }) => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };

      let startEl;
      let deurEl;
      document.querySelectorAll('.time-tag ~ *').forEach((tijdEl) => {
        if (tijdEl.textContent.toLowerCase().includes('aanvang')) {
          startEl = tijdEl;
        }
        if (tijdEl.textContent.toLowerCase().includes('open')) {
          deurEl = tijdEl;
        }
      });

      if (!startEl) {
        res.errors.push({
          remarks: 'geen tijd el gevonden',
        });
      }

      res.startTijdMatch = startEl.textContent.match(/\d\d:\d\d/);
      if (deurEl) res.deurTijdMatch = deurEl.textContent.match(/\d\d:\d\d/);
      if (Array.isArray(res.startTijdMatch)) res.startTijd = res.startTijdMatch[0];
      if (Array.isArray(res.deurTijdMatch)) res.deurTijd = res.deurTijdMatch[0];

      try {
        res.start = `${event.startDate}T${res.startTijd}:00`;
        res.door = !res?.deurTijd ? null : `${event.startDate}T${res.deurTijd}:00`;
      } catch (error) {
        res.errors.push({
          error,
          remarks: `date ${event.startDate} time ${res.startTijd}`,
          toDebug: {
            startElT: startEl.textContent,
          },
        });
      }

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
    selectors: ['.img-wrapper img'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.main-ticket-info'],
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
  return await this.singlePageEnd({
    pageInfo,
    stopFunctie,
    page,
    event,
  });
};
// #endregion                         SINGLE PAGE