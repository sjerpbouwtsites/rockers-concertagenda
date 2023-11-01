/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/p60.js';
import getImage from './gedeeld/image.js';
import terms from './gedeeld/terms.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const p60Scraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 60020,
    url: 'https://p60.nl/agenda',
  },
  singlePage: {
    timeout: 30021,
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

p60Scraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
p60Scraper.mainPageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);
  const isRefused = await this.rockRefuseListCheck(event, workingTitle);
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }

  return {
    reason: [isRefused.reason].join(';'),
    event,
    workingTitle,
    success: true,
  };
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
p60Scraper.singlePageAsyncCheck = async function (event) {
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
p60Scraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    return this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  await this.autoScroll(page);

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData, unavailabiltyTerms }) =>
      Array.from(
        document.querySelectorAll(
          '.views-infinite-scroll-content-wrapper > .p60-list__item-container',
        ),
      )
        .filter((itemEl) => !!itemEl.querySelector('[href*=ticketmaster]'))
        .map((itemEl) => {
          const title = itemEl.querySelector('.p60-list__item__title')?.textContent.trim() ?? '';

          const res = {
            anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
            title,
          };

          const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
          res.unavailable = !!itemEl.textContent.match(uaRex);
          res.soldOut = itemEl?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;

          res.venueEventUrl = itemEl.querySelector('.field-group-link')?.href;

          const doorB = itemEl
            .querySelector('.p60-list__item__date time')
            ?.getAttribute('datetime');
          try {
            res.door = doorB;
          } catch (caughtError) {
            res.errors.push({ error: caughtError, remarks: `openDoorDateTime omzetten ${doorB}` });
          }

          const startTime = itemEl.querySelector('.field--name-field-aanvang')?.textContent.trim();
          let startB;
          if (res.door) {
            startB = doorB.replace(/T\d\d:\d\d/, `T${startTime}`);
            try {
              res.start = startB;
            } catch (caughtError) {
              res.errors.push({ error: caughtError, remarks: `start omzetten ${startB}` });
            }
          }

          res.shortText =
            itemEl.querySelector('.p60-list__item__description')?.textContent.trim() ?? '';
          return res;
        }),
    { workerData, unavailabiltyTerms: terms.unavailability },
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
p60Scraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  if (event.unavailable) {
    return this.singlePageEnd({ pageInfo: {}, stopFunctie, page });
  }

  const pageInfo = await page.evaluate(() => {
    const res = {
      anker: `<a class='page-info' href='${document.location.href}'>${document.title}</a>`,
      errors: [],
    };

    return res;
  }, null);

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: ["[property='og:image']"],
    mode: 'weird-attr',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.event-info__price', '.content-section__event-info'],
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
