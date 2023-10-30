/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/melkweg.js';
import getImage from './gedeeld/image.js';
import terms from './gedeeld/terms.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const melkwegScraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 75073,
    waitUntil: 'load',
    url: 'https://www.melkweg.nl/nl/agenda',
  },
  singlePage: {
    timeout: 20074,
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

melkwegScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
melkwegScraper.mainPageAsyncCheck = async function (event) {
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
melkwegScraper.mainPage = async function () {
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
    ({ workerData, unavailabiltyTerms }) =>
      Array.from(
        document.querySelectorAll("[data-element='agenda'] li[class*='event-list-day__list-item']"),
      )
        .filter((eventEl) => {
          const anker = eventEl.querySelector('a') ?? null;
          const genre = anker?.hasAttribute('data-genres')
            ? anker?.getAttribute('data-genres')
            : '';
          const isHeavy = genre === '53'; // TODO kan ook direct met selectors.
          return isHeavy;
        })
        .map((eventEl) => {
          const title = eventEl.querySelector('h3[class*="title"]')?.textContent ?? '';
          const res = {
            anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
            title,
          };
          const tags =
            eventEl
              .querySelector('[class*="styles_tags-list"]')
              ?.textContent.toLowerCase()
              .split(' . ')
              .join(' - ') ?? '';
          const anchor = eventEl.querySelector('a');
          let shortTitle = eventEl.querySelector('[class*="subtitle"]')?.textContent ?? '';
          shortTitle = shortTitle ? `<br>${shortTitle}` : '';
          res.shortText = `${tags} ${shortTitle}`;
          res.venueEventUrl = anchor.href;
          const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
          res.unavailable = !!eventEl.textContent.match(uaRex);
          res.soldOut =
            !!eventEl
              .querySelector("[class*='styles_event-compact__text']")
              ?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;
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
melkwegScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ event }) => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };
      try {
        res.start =
          document.querySelector('[class*="styles_event-header"] time')?.getAttribute('datetime') ??
          null;
      } catch (caughtError) {
        res.errors.push({
          error: caughtError,
          remarks: `start faal ${res.anker}`,
          toDebug: {
            text:
              document.querySelector('[class*="styles_event-header"] time')?.outerHTML ??
              'geen time element',
            res,
            event,
          },
        });
      }

      return res;
    },
    { event },
  );

  const ogImage = await page.evaluate(() => Array.from(document.head.children)
    .find((child) => child.hasAttribute('property') && child.getAttribute('property').includes('image')));
  if (ogImage) {
    await page.evaluate((ogImageSrc) => {
      const imageNew = document.createElement('img');
      imageNew.src = ogImageSrc;
      imageNew.id = 'inserted-image';
      document.body.appendChild(imageNew);
    }, ogImage);
  }

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: ['[class*="styles_event-header__figure"] img', '#inserted-image'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['[class*="styles_ticket-prices"]'],
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
