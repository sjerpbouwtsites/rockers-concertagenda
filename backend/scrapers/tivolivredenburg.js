/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/tivolivredenburg.js';
import getImage from './gedeeld/image.js';
import terms from './gedeeld/terms.js';
import {
  combineStartTimeStartDate, mapToStartDate, mapToStartTime, 
  mapToDoorTime, combineDoorTimeStartDate, mapToEndTime, combineEndTimeStartDate,
} from './gedeeld/datums.js';

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    waitUntil: 'load',
    url: 'https://www.tivolivredenburg.nl/agenda/?event_category=metal-punk-heavy',
  },
  app: {
    mainPage: {
      requiredProperties: ['venueEventUrl', 'title'],
      asyncCheckFuncs: ['allowed', 'event', 'refused', 'goodTerms', 'forbiddenTerms', 'isRock', 'saveRefused', 'emptyFailure'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'price', 'start'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

scraper.listenToMasterThread();

// #region       MAIN PAGE
scraper.mainPage = async function () {
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
      Array.from(document.querySelectorAll('.agenda-list-item')).map((eventEl) => {
        const title = eventEl.querySelector('.agenda-list-item__title')?.textContent.trim() ?? null;
        const res = {
          anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title,
        };
        res.shortText = eventEl.querySelector('.agenda-list-item__text')?.textContent.trim() ?? '';

        res.venueEventUrl = eventEl.querySelector('.agenda-list-item__title-link').href;
        const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
        res.unavailable = !!eventEl.textContent.match(uaRex);
        res.soldOut =
          !!eventEl
            .querySelector('.agenda-list-item__label')
            ?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;
        return res;
      }),
    { workerData, unavailabiltyTerms: terms.unavailability },
  );

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

  const cookiesNodig = await page.evaluate(() => document.querySelector('#eagerly-tools-cookie'));

  if (cookiesNodig) {
    await page.evaluate(() => {
      const label = document.querySelector('.cookie-field:not(.disabled) label');
      const accept = document.querySelector('#cookie-accept');
      label.click();
      accept.click();
    });
    await this.waitTime(1500);
  }

  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.lane--event time')).forEach((t) => {
      if (t?.parentNode?.previousElementSibling) {
        const tijdTekst = t.parentNode.previousElementSibling.textContent.toLowerCase();
        if (tijdTekst.includes('open')) t.classList.add('deur-tijd');
        if (tijdTekst.includes('aanvang')) t.classList.add('start-tijd');
        if (tijdTekst.includes('eind')) t.classList.add('eind-tijd');
      } else if (t.parentNode.classList.contains('event-cta')) {
        t.classList.add('datum-tijd');  
      }
    });
  });

  let pageInfo = {
    anker: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
    errors: [],
  };

  pageInfo.mapToStartDate = await page.evaluate(() => document.querySelector('.datum-tijd')?.textContent ?? null);
  pageInfo.mapToStartTime = await page.evaluate(() => document.querySelector('.start-tijd')?.textContent ?? null);
  pageInfo.mapToDoorTime = await page.evaluate(() => document.querySelector('.deur-tijd')?.textContent ?? null);
  pageInfo.mapToEndTime = await page.evaluate(() => document.querySelector('.eind-tijd')?.textContent ?? null);
  if (!pageInfo.mapToStartTime && pageInfo.mapToDoorTime) {
    pageInfo.mapToStartTime = pageInfo.mapToDoorTime;
    pageInfo.mapToDoorTime = null;
  }
  if (!pageInfo.mapToStartTime && pageInfo.mapToEndTime) {
    pageInfo.mapToStartTime = pageInfo.mapToEndTime;
    pageInfo.mapToEndTime = null;
  }

  pageInfo = mapToStartTime(pageInfo);
  pageInfo = mapToStartDate(pageInfo, 'dag-maandNaam-jaar', this.months);
  pageInfo = combineStartTimeStartDate(pageInfo);
  if (pageInfo.mapToDoorTime) {
    pageInfo = mapToDoorTime(pageInfo);
    pageInfo = combineDoorTimeStartDate(pageInfo);
  }
  if (pageInfo.mapToEndTime) {
    pageInfo = mapToEndTime(pageInfo);
    pageInfo = combineEndTimeStartDate(pageInfo);
  }

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: ['.img-container source:last-of-type'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.btn-group__price', '.event-cta'],
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
