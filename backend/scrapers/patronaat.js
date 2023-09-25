/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/patronaat.js';
import ErrorWrapper from '../mods/error-wrapper.js';
import * as _t from '../mods/tools.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const patronaatScraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 30034,
    url: 'https://patronaat.nl/programma/?type=event&s=&eventtype%5B%5D=178',
  },
  singlePage: {
    timeout: 20036,
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

patronaatScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
patronaatScraper.mainPageAsyncCheck = async function (event) {
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

  const hasGoodTermsRes = await this.hasGoodTerms(event);
  if (hasGoodTermsRes.success) {
    this.saveAllowedTitle(workingTitle);
    return hasGoodTermsRes;
  }

  const isRockRes = await this.isRock(event, [workingTitle]);
  if (isRockRes.success) {
    this.saveAllowedTitle(workingTitle);
  } else {
    this.saveRefusedTitle(workingTitle);
  }
  return isRockRes;
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
patronaatScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    return await this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  let rawEvents = await page.evaluate(.
    // eslint-disable-next-line no-shadow
    ({ workerData, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll('.overview__list-item--event')).map((eventEl) => {
        const title = eventEl.querySelector('.event-program__name')?.textContent.trim();
        const res = {
          pageInfo: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title,
        };

        res.venueEventUrl = eventEl.querySelector('a[href]')?.href ?? null;
        res.shortText = eventEl.querySelector('.event-program__subtitle')?.textContent.trim() ?? '';
        const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
        res.unavailable = !!eventEl.textContent.match(uaRex);
        res.soldOut = !!(eventEl.querySelector('.event__tags-item--sold-out') ?? null);
        return res;
      }),
    { workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms },
  );
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents);
  const thisWorkersEvents = rawEvents.filter(
    (eventEl, index) => index % workerData.workerCount === workerData.index,
  );
  return await this.mainPageEnd({ stopFunctie, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
patronaatScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const pageInfo = await page
    .evaluate(
      ({ months, event }) => {
        const res = {
          pageInfo: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
          errors: [],
        };

        try {
          res.startDatumM = document
            .querySelector('.event__info-bar--star-date')
            ?.textContent.toLowerCase()
            .match(/(\d{1,2})\s+(\w{3,4})\s+(\d\d\d\d)/);
          if (Array.isArray(res.startDatumM) && res.startDatumM.length >= 4) {
            const day = res.startDatumM[1].padStart(2, '0');
            const month = months[res.startDatumM[2]];
            const year = res.startDatumM[3];
            res.startDatum = `${year}-${month}-${day}`;
          }

          if (res.startDatum) {
            [
              ['doorOpenTime', '.event__info-bar--doors-open'],
              ['startTime', '.event__info-bar--start-time'],
              ['endTime', '.event__info-bar--end-time'],
            ].forEach((timeField) => {
              const [timeName, selector] = timeField;

              const mmm = document.querySelector(selector)?.textContent.match(/\d\d:\d\d/);
              if (Array.isArray(mmm) && mmm.length === 1) {
                res[timeName] = mmm[0];
              }
            });

            if (!res.startTime) {
              res.startTime = res.doorOpenTime;
            }
            if (!res.startTime) {
              res.errors.push({
                remarks: `geen startTime ${res.pageInfo}`,
                toDebug: event,
              });
            }

            if (res.doorOpenTime) {
              res.door = `${res.startDatum}T${res.doorOpenTime}:00`;
            }
            if (res.startTime) {
              res.start = `${res.startDatum}T${res.startTime}:00`;
            }
            if (res.endTime) {
              res.end = `${res.startDatum}T${res.endTime}:00`;
            }
          } else {
            res.errors.push({
              remarks: `geen startDate ${res.pageInfo}`,
              toDebug: event,
            });
            return res;
          }
        } catch (caughtError) {
          // TODO opsplitsen
          res.errors.push({
            error: caughtError,
            remarks: `Datum error patronaat ${res.pageInfo}.`,
            toDebug: event,
          });
        }

        return res;
      },
      { months: this.months, event },
    )
    .catch((caughtError) => {
      _t.wrappedHandleError(
        new ErrorWrapper({
          error: caughtError,
          remarks: 'page Info catch patronaat',
          errorLevel: 'notice',
          workerData,
          toDebug: {
            event,
            pageInfo,
          },
        }),
      );
    });

  const imageRes = await this.getImage({
    page,
    event,
    pageInfo,
    selectors: ['.event__visual img'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.event__info-bar--ticket-price'],
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
