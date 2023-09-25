/* global document */
import { workerData } from 'worker_threads';
import longTextSocialsIframes from './longtext/gebrdenobel.js';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import getImage from './gedeeld/image.js';
import { waitTime } from '../mods/tools.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const gebrdenobelScraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 31005,
    url: 'https://gebrdenobel.nl/programma/',
  },
  singlePage: {
    timeout: 15004,
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

gebrdenobelScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
gebrdenobelScraper.mainPageAsyncCheck = async function (event) {
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
gebrdenobelScraper.singlePageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);

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
    event,
    success: true,
    reason: [isAllowed.reason, hasForbiddenTerms.reason].join(';'),
  };
};
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
gebrdenobelScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    return this.mainPageEnd({
      stopFunctie: null,
      rawEvents: thisWorkersEvents,
    });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  let punkMetalRawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll('.event-item'))
        .filter((eventEl) => {
          const tags = eventEl.querySelector('.meta-tag')?.textContent.toLowerCase() ?? '';
          return tags.includes('metal') || tags.includes('punk');
        })
        .map((eventEl) => {
          const title = eventEl.querySelector('.media-heading')?.textContent ?? null;
          const res = {
            pageInfo: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
            title,
          };
          res.venueEventUrl =
            eventEl.querySelector('.jq-modal-trigger')?.getAttribute('data-url') ?? '';
          const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
          res.unavailable = !!eventEl.textContent.match(uaRex);
          res.soldOut =
            !!eventEl.querySelector('.meta-info')?.textContent.match(/uitverkocht|sold\s?out/i) ??
            null;
          return res;
        }),
    { workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms },
  ); // page.evaluate

  punkMetalRawEvents = punkMetalRawEvents.map(this.isMusicEventCorruptedMapper);

  let rockRawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData }) =>
      Array.from(document.querySelectorAll('.event-item'))
        .filter((eventEl) => {
          const tags = eventEl.querySelector('.meta-tag')?.textContent.toLowerCase() ?? '';
          return tags.includes('rock');
        })
        .map((eventEl) => {
          const title = eventEl.querySelector('.media-heading')?.textContent ?? null;
          const res = {
            pageInfo: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
            title,
          };
          res.venueEventUrl =
            eventEl.querySelector('.jq-modal-trigger')?.getAttribute('data-url') ?? '';

          res.soldOut = !!(
            eventEl
              .querySelector('.meta-info')
              ?.textContent.toLowerCase()
              .includes('uitverkocht') ?? null
          );
          return res;
        }),
    { workerData },
  );

  rockRawEvents = rockRawEvents.map(this.isMusicEventCorruptedMapper);

  const checkedRockEvents = [];
  while (rockRawEvents.length) {
    const thisRockRawEvent = rockRawEvents.shift();
    const tl = this.cleanupEventTitle(thisRockRawEvent.title);
    const isAllowed = await this.rockAllowListCheck(thisRockRawEvent, tl);
    if (isAllowed.success) {
      checkedRockEvents.push(thisRockRawEvent);
      continue;
    }
    const isRockRefuse = await this.rockRefuseListCheck(thisRockRawEvent, tl);
    if (isRockRefuse.success) {
      continue;
    }

    const isRockRes = await this.isRock(thisRockRawEvent);
    if (isRockRes.success) {
      checkedRockEvents.push(thisRockRawEvent);
    }
  }

  const rawEvents = punkMetalRawEvents.concat(checkedRockEvents);

  // gebr de nobel cookies moet eerste laaten mislukken
  const eersteCookieEvent = { ...rawEvents[0] };
  eersteCookieEvent.title = `NEP EVENT VOOR COOKIES`;
  rawEvents.unshift(eersteCookieEvent);

  this.saveBaseEventlist(workerData.family, rawEvents);
  const thisWorkersEvents = rawEvents.filter(
    (eventEl, index) => index % workerData.workerCount === workerData.index,
  );
  return this.mainPageEnd({
    stopFunctie,
    rawEvents: thisWorkersEvents,
  });
};
// #endregion                          MAIN PAGE

gebrdenobelScraper.cookiesNodig = async function (page) {
  const nodig = await page.evaluate(() => document.querySelector('.consent__show'));

  if (nodig) {
    await page.waitForSelector('.consent__form__submit', {
      timeout: 5000,
    });

    await page.evaluate(() => document.querySelector('.consent__form__submit').click());

    await waitTime(3000);
    await page.reload();

    await page.waitForSelector('.event-table tr', {
      timeout: 2500,
    });
  }
  return true;
};

// #region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
gebrdenobelScraper.singlePage = async function ({ page, event }) {
  this.dirtyTalk(`single ${event.title}`);

  const { stopFunctie } = await this.singlePageStart();

  // cookies

  try {
    await this.cookiesNodig(page, event, stopFunctie);
  } catch (cookiesError) {
    return this.singlePageEnd({
      pageInfo: {
        errors: [
          {
            error: cookiesError,
            remarks: `cookies handling issue <a href='${event.venueEventUrl}'>${event.title}</a>`,
          },
        ],
      },
      stopFunctie,
      page,
      event,
    });
  } // eind cookies

  this.dirtyTalk('na cookies');

  const pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ months }) => {
      const res = {
        pageInfo: `<a class='page-info' href='${document.location.href}'>${document.title}</a>`,
        errors: [],
      };
      const eventDataRows = Array.from(document.querySelectorAll('.event-table tr'));
      const dateRow = eventDataRows.find((row) => row.textContent.toLowerCase().includes('datum'));
      const timeRow = eventDataRows.find(
        (row) =>
          row.textContent.toLowerCase().includes('open') ||
          row.textContent.toLowerCase().includes('aanvang'),
      );

      if (dateRow) {
        const startDateMatch = dateRow.textContent.match(/(\d+)\s?(\w+)\s?(\d{4})/);
        if (Array.isArray(startDateMatch) && startDateMatch.length === 4) {
          const day = startDateMatch[1].padStart(2, '0');
          const month = months[startDateMatch[2]];
          const year = startDateMatch[3];
          res.startDate = `${year}-${month}-${day}`;
        }

        if (!timeRow) {
          res.start = `${res.startDate}T00:00:00`;
        } else {
          const timeMatch = timeRow.textContent.match(/\d\d:\d\d/);
          if (Array.isArray(timeMatch) && timeMatch.length) {
            res.start = `${res.startDate}T${timeMatch[0]}:00`;
          } else {
            res.start = `${res.startDate}T00:00:00`;
          }
        }
      }

      res.shortText = document.querySelector('.hero-cta_left__text p')?.textContent ?? '';
      if (document.querySelector('#shop-frame')) {
        document.querySelector('#shop-frame').innerHTML = '';
        document
          .querySelector('#shop-frame')
          .parentNode.removeChild(document.querySelector('#shop-frame'));
      }

      return res;
    },
    { months: this.months, event },
  );

  this.dirtyTalk('voor getimage');

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: ['.hero img'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;
  this.dirtyTalk('na getimage');

  await page.evaluate(() => {
    document.querySelectorAll('.event-table tr').forEach((row) => {
      if (row.textContent.includes('€')) {
        row.classList.add('gebrdenobel-price-manual');
      }
    });
  });
  this.dirtyTalk('voor prijsres');
  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.gebrdenobel-price-manual', '.event-table'],
  });
  pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
  pageInfo.price = priceRes.price;
  this.dirtyTalk('na prijsres');
  this.dirtyTalk('voor lonjgtext');
  const { mediaForHTML, socialsForHTML, textForHTML } = await longTextSocialsIframes(
    page,
    event,
    pageInfo,
  );
  pageInfo.mediaForHTML = mediaForHTML;
  pageInfo.socialsForHTML = socialsForHTML;
  pageInfo.textForHTML = textForHTML;
  this.dirtyTalk('na lonjgtext');

  return this.singlePageEnd({
    pageInfo,
    stopFunctie,
    page,
    event,
  });
};
// #endregion                         SINGLE PAGE
