/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/iduna.js';
import getImage from './gedeeld/image.js';
import terms from './gedeeld/terms.js';

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },
  mainPage: {
    url: 'https://iduna.nl/evenementen/',
    waitUntil: 'load',
  },
  singlePage: {
    timeout: 20000,
  },
  app: {
    mainPage: {
      requiredProperties: ['venueEventUrl', 'title'],
      asyncCheckFuncs: ['allowed', 'event', 'refused', 'forbiddenTerms', 'emptySuccess'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'price', 'start'],
      asyncCheckFuncs: ['goodTerms', 'forbiddenTerms', 'saveAllowed', 'emptySuccess'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

scraper.listenToMasterThread();

// #region       MAIN PAGE
scraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    return this.mainPageEnd({ stopFunctie: null, rawEvents: availableBaseEvents });
  }
  const { stopFunctie, page } = await this.mainPageStart();

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ unavailabiltyTerms }) => {
      const events = Array.from(
        document.querySelectorAll('[data-genre*="metal"], [data-genre*="punk"]'),
      ).map((rawEvent) => {
        const title = rawEvent.querySelector('.card-titel-container')?.textContent ?? '';
        const venueEventUrl = rawEvent.hasAttribute('data-url') ? rawEvent.getAttribute('data-url') : null;
        const res = {
          title,
          venueEventUrl,
          errors: [],
        };
        res.shortText = rawEvent.querySelector('.card-subtitle')?.textContent ?? null;
        res.soldOut = Array.isArray(rawEvent.textContent.match(/uitverkocht|sold\sout/i));
        const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
        res.unavailable = rawEvent.textContent.match(uaRex);
        return res;
      });
      return events;
    }, { workerData, unavailabiltyTerms: terms.unavailability });
  
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  const eventGen = this.eventGenerator(rawEvents);
  // eslint-disable-next-line no-unused-vars
  const checkedEvents = await this.rawEventsAsyncCheck({
    eventGen,
    checkedEvents: [],
  });  
  
  this.saveBaseEventlist(workerData.family, checkedEvents);
    
  const thisWorkersEvents = checkedEvents.filter(
    (eventEl, index) => index % workerData.workerCount === workerData.index,
  );
    
  return this.mainPageEnd({ stopFunctie, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region      SINGLE PAGE
scraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ months, event }) => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };

      const startDateMatch =
        document
          .querySelector('#code_block-154-7')
          ?.textContent.match(/(\d+)\s+(\w+)\s+(\d\d\d\d)/) ?? null;
      if (startDateMatch && Array.isArray(startDateMatch) && startDateMatch.length > 3) {
        const dag = startDateMatch[1].padStart(2, '0');
        res.startDate = `${startDateMatch[3]}-${months[startDateMatch[2]]}-${dag}`;
      }
      if (!res.startDate) {
        res.errors.push({
          error: new Error(`geen startDate`),
          remarks: `geen startdate ${res.anker}`,
          toDebug: {
            event,
            text: document.querySelector('#code_block-154-7')?.textContent ?? 'geen code block met #code_block-154-7',
          },
        });
        return res;
      }

      const tijdenEl = document.getElementById('code_block-92-7');
      if (!tijdenEl) {
        res.errors.push({
          error: new Error('geen tijdenEl'),
          remarks: '#code_block-92-7 niet gevonden',
        });
        return res;
      }
      
      if (tijdenEl.textContent.match(/deur:\s?\d\d:\d\d/i)) {
        res.doorTime = tijdenEl.textContent.match(/deur:\s?\d\d:\d\d/i)[0].match(/\d\d:\d\d/);
        res.door = `${res.startDate}T${res.doorTime}:00`;
      }
      
      if (tijdenEl.textContent.match(/aanvang:\s?\d\d:\d\d/i)) {
        res.startTime = tijdenEl.textContent.match(/aanvang:\s?\d\d:\d\d/i)[0].match(/\d\d:\d\d/);
      }

      if (tijdenEl.textContent.match(/eindtijd:\s?\d\d:\d\d/i)) {
        res.endTime = tijdenEl.textContent.match(/eindtijd:\s?\d\d:\d\d/i)[0].match(/\d\d:\d\d/);
        res.end = `${res.startDate}T${res.endTime}:00`;
      }

      if (!res.startTime && tijdenEl.textContent.match(/\d\d:\d\d/)) {
        res.startTime = tijdenEl.textContent.match(/\d\d:\d\d/)[0];
      }

      if (res.startTime) {
        res.start = `${res.startDate}T${res.startTime}:00`;
      }
      
      return res;
    }, { months: this.months, event },
  );

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: [".event-page-header-image"],
    mode: 'background-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['#code_block-92-7'],
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
