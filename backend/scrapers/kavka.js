/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/kavka.js';
import getImage from './gedeeld/image.js';
import terms from './gedeeld/terms.js';
import { handleError } from '../mods/tools.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const kavkaScraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 35015,
    url: 'https://kavka.be/programma/',
  },
  singlePage: {
    timeout: 30016,
  },
  app: {
    mainPage: {
      requiredProperties: ['venueEventUrl', 'title', 'start'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'price', 'start'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

kavkaScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
kavkaScraper.mainPageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);
  const isRefused = await this.rockRefuseListCheck(event, workingTitle);
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }

  return {
    workingTitle,
    reason: [isRefused.reason].join(';'),
    event,
    success: true,
  };
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
kavkaScraper.singlePageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);

  const isAllowed = await this.rockAllowListCheck(event, workingTitle);
  if (isAllowed.success) {
    return isAllowed;
  }

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  if (hasForbiddenTerms.success) {
    this.saveRefusedTitle(workingTitle);
    hasForbiddenTerms.success = false;
    return hasForbiddenTerms;
  }

  this.saveAllowedTitle(workingTitle);

  return {
    reason: [isAllowed.reason, hasForbiddenTerms.reason].join(';'),
    workingTitle,
    event,
    success: true,
  };
};
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
kavkaScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    await this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ months, workerData, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll('.events-list > a'))
        .filter((rawEvent) =>
          Array.from(rawEvent.querySelectorAll('.tags'))
            .map((a) => a.textContent.trim().toLowerCase())
            .join(' ')
            .includes('metal'),
        )
        .map((rawEvent) => {
          let startTimeM;
          let startDateEl;
          let startDate;
          let startDay;
          let startMonthName;
          let startMonth;
          let startMonthJSNumber;
          let refDate;
          let startYear;

          const title =
            rawEvent.querySelector('article h3:first-child')?.textContent.trim() ?? null;

          const res = {
            anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
            title,
          };
          if (rawEvent.querySelector('.cancelled')) {
            res.unavailable = 'cancelled';
          }

          // TODO BELACHELIJK GROTE TRY CATHC
          try {
            startDateEl = rawEvent.querySelector('date .date') ?? null;
            startDay =
              startDateEl.querySelector('.day')?.textContent.trim()?.padStart(2, '0') ?? null;
            startMonthName = startDateEl.querySelector('.month')?.textContent.trim() ?? null;
            startMonth = months[startMonthName];
            startMonthJSNumber = Number(startMonth) - 1;
            refDate = new Date();
            startYear = refDate.getFullYear();
            if (startMonthJSNumber < refDate.getMonth()) {
              startYear += 1;
            }
            startDate = `${startYear}-${startMonth}-${startDay}`;
            startTimeM = rawEvent.querySelector('.loc-time time')?.textContent.match(/\d\d:\d\d/);
            if (startTimeM && Array.isArray(startTimeM) && startTimeM.length > 0) {
              res.dateStringAttempt = `${startDate}T${startTimeM[0]}:00`;
            } else {
              res.dateStringAttempt = `${startDate}T19:00:00`;
            }
            res.start = res.dateStringAttempt;
          } catch (caughtError) {
            res.errors.push({
              error: caughtError,
              remarks: `kkgrote trycatch baseEventList iduna ${res.anker}.`,
              toDebug: res,
            });
          }

          try {
            if (startTimeM && Array.isArray(startTimeM) && startTimeM.length > 1) {
              res.dateStringAttempt = `${startDate}T${startTimeM[1]}:00`;
              res.door = res.dateStringAttempt;
            }
          } catch (error) {
            res.errors.push({
              remarks: `openDoorDateTime faal ${res.anker}`,
            });
          }

          const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
          res.unavailable = !!rawEvent.textContent.match(uaRex);
          res.soldOut =
            !!rawEvent.querySelector('.badge')?.textContent.match(/uitverkocht|sold\s?out/i) ??
            false;

          res.shortText = rawEvent.querySelector('article h3 + p')?.textContent.trim() ?? '';
          res.venueEventUrl = rawEvent?.href ?? null;

          return res;
        }),
    { months: this.months, workerData, unavailabiltyTerms: terms.unavailability },
  );

  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents);
  
  const thisWorkersEvents = rawEvents.filter(
    (eventEl, index) => index % workerData.workerCount === workerData.index,
  );

  return this.mainPageEnd({ stopFunctie, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
kavkaScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  await page
    .waitForSelector('img[src*="kavka.be/wp-content"].lazyloaded', {
      timeout: 1500,
    })
    .catch(() => {
      // niets doen.
    });

  const pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ event }) => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };
      try {
        return res;
      } catch (caughtError) {
        res.errors.push({
          error: caughtError,
          remarks: `page info top level trycatch ${res.anker}`,
        });
      }
      return true;
    },
    { event },
  );

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: ['img[src*="uploads"][src*="kavka"]', 'img[src*="kavka.be/wp-content"]'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.prijzen'],
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

  return this.singlePageEnd({ pageInfo, stopFunctie, page });
};
// #endregion                         SINGLE PAGE
