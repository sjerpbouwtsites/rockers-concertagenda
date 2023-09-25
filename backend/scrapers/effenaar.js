/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/effenaar.js';
import getImage from './gedeeld/image.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const effenaarScraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 30013,
    url: 'https://www.effenaar.nl/agenda?genres.title=heavy',
  },
  singlePage: {
    timeout: 15014,
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

effenaarScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
effenaarScraper.mainPageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);

  const isRefused = await this.rockRefuseListCheck(event, workingTitle);
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }

  return {
    workingTitle,
    event,
    success: true,
    reason: isRefused.reason,
  };
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
effenaarScraper.singlePageAsyncCheck = async function (event) {
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
    workingTitle,
    reason: [isAllowed.reason, hasForbiddenTerms.reason].join(';'),
    event,
    success: true,
  };
};
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
effenaarScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    return await this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData }) =>
      Array.from(document.querySelectorAll('.search-and-filter .agenda-card')).map((eventEl) => {
        const title = eventEl.querySelector('.card-title')?.textContent.trim();
        const res = {
          anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title,
        };
        res.shortText = eventEl.querySelector('.card-subtitle')?.textContent ?? '';
        res.venueEventUrl = eventEl?.href ?? null;
        res.soldOut =
          !!eventEl
            .querySelector('.card-content .card-status')
            ?.innerHTML.match(/uitverkocht|sold\s?out/i) ?? null;
        return res;
      }),
    { workerData },
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
effenaarScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  await page.waitForSelector('.event-bar-inner-row');

  const pageInfo = await page.evaluate(
    ({ months, event }) => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };

      const dateText = document.querySelector('.header-meta-date')?.textContent.trim() ?? '';
      if (!dateText) {
        res.errors.push({
          remarks: `geen datumtext ${res.anker}`,
        });
        res.corrupted = 'geen datum tekst';
      } else {
        const [, dayNumber, monthName, year] = dateText.match(/(\d+)\s(\w+)\s(\d\d\d\d)/);
        const fixedDay = dayNumber.padStart(2, '0');
        const monthNumber = months[monthName];
        res.startDate = `${year}-${monthNumber}-${fixedDay}`;
      }

      let startTimeAr = [];
      let doorTimeAr = [];
      if (res.startDate) {
        startTimeAr = document.querySelector('.time-start-end')?.textContent.match(/\d\d:\d\d/);
        if (Array.isArray(startTimeAr) && startTimeAr.length) {
          res.startTime = startTimeAr[0];
        }
        doorTimeAr = document.querySelector('.time-open')?.textContent.match(/\d\d:\d\d/);
        if (Array.isArray(doorTimeAr) && doorTimeAr.length) {
          res.doorTime = doorTimeAr[0];
        }
        res.startString = `${res.startDate}T${res.startTime}:00`;
        res.openDoorDateTimeString = `${res.startDate}T${res.doorTime}:00`;
      }

      try {
        if (res.doorTime) {
          res.door = `${res.openDoorDateTimeString}`;
        }

        if (res.startTime) {
          res.start = `${res.startString}`;
        }
      } catch (caughtError) {
        res.errors.push({
          error: caughtError,
          remarks: `omzetten naar Date iso gaat fout ${res.anker}`,
          toDebug: {
            ars: `${startTimeAr.join('')} ${doorTimeAr.join('')}`,
            res,
            event,
          },
        });
      }

      return res;
    },
    { months: this.months, event },
  );

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: ['.header-image img'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.tickets-btn', '.tickets-dropdown'],
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
