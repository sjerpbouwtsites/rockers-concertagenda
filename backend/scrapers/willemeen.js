/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/willemeen.js';
import getImage from './gedeeld/image.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const willemeeenScraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    waitUntil: 'load',
    url: 'https://www.willemeen.nl/programma/',
  },

  app: {
    mainPage: {
      requiredProperties: ['venueEventUrl', 'title', 'shortText', 'start'],
    },
    singlePage: {
      requiredProperties: ['price'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

willemeeenScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
willemeeenScraper.mainPageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);

  const isRefused = await this.rockRefuseListCheck(event, workingTitle);
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }

  const isAllowed = await this.rockAllowListCheck(event, workingTitle);
  if (isAllowed.success) {
    return isAllowed;
  }

  const hasGoodTerms = await this.hasGoodTerms(event);
  if (hasGoodTerms.success) {
    this.saveAllowedTitle(workingTitle);
    return hasGoodTerms;
  }

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  if (hasForbiddenTerms.success) {
    this.saveRefusedTitle(workingTitle);
    hasForbiddenTerms.success = false;
    return hasForbiddenTerms;
  }

  return {
    workingTitle,
    reason: 'niets gevonden. Willemeen heeft altijd expliciete genres dus NEE',
    event,
    success: false,
  };
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
willemeeenScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    return await this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  // zet date op verschillende items
  await page.evaluate(() => {
    document.querySelectorAll('.we__agenda-row').forEach((row) => {
      const dateText = row.querySelector('.we__agenda-item-date')?.textContent;
      row.querySelectorAll('.we__agenda-item').forEach((rowItem) => {
        rowItem.setAttribute('date-text', dateText);
      });
    });
  });

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData, months, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll('.we__agenda-item')).map((rawEvent) => {
        const title = rawEvent.querySelector('[data-text]')?.getAttribute('data-text') ?? '';
        const res = {
          pageInfo: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title,
        };
        res.venueEventUrl = rawEvent.querySelector('.stretched-link')?.href ?? '';
        res.shortText = rawEvent.querySelector('.we__agenda-item-genre')?.textContent ?? null;
        res.startTime = rawEvent.querySelector('.we__agenda-item-info')?.textContent ?? null;
        const dateText = rawEvent.getAttribute('date-text') ?? '';
        const dateM = dateText.match(/(?<day>\d\d)\s+(?<monthletters>\w+)/) ?? null;
        if (Array.isArray(dateM) && dateM.length === 3) {
          res.month = months[dateM[2]];
          res.year = new Date().getFullYear();
          res.day = dateM[1];
          const curM = new Date().getMonth() + 1;
          if (res.month < curM) {
            res.year += 1;
          }
          res.start = `${res.year}-${res.month}-${res.day}T${res.startTime}:00`;
        }

        const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
        res.unavailable = !!rawEvent.textContent.match(uaRex);
        res.soldOut = rawEvent?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;
        return res;
      }),
    { workerData, months: this.months, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms },
  );

  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents);
  const thisWorkersEvents = rawEvents.filter(
    (eventEl, index) => index % workerData.workerCount === workerData.index,
  );
  return await this.mainPageEnd({ stopFunctie, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region [rgba(120, 0, 0, 0.1)]      SINGLE PAGE
willemeeenScraper.singlePage = async function ({ page, url, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const pageInfo = {
    title: event.title,
    unavailable: event.unavailable,
    pageInfo: `<a class='page-info' class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
    errors: [],
  };

  // image zit in online dienst verstopt die 302 geeft.
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.main-img, .we_program_text_image')).forEach((el) => {
      if (!el.hasAttribute('data-src')) return null;
      const srcM = el.getAttribute('data-src').match(/ret_img\/(.*)/);
      if (srcM) {
        el.src = srcM[1];
      }
    });
  });

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: ['.main-img', '.we_program_text_image'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.ticket-col'],
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