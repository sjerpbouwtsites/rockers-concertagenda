/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/cpunt.js';
import getImage from './gedeeld/image.js';
import terms from '../artist-db/store/terms.js';
import {
  mapToDoorTime, combineStartTimeStartDate, mapToStartTime, 
  mapToShortDate, mapToStartDate, combineDoorTimeStartDate, 
} from './gedeeld/datums.js';
import workTitleAndSlug from './gedeeld/slug.js';

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },
  launchOptions: {
    headless: false,
  },
  mainPage: {
    timeout: 30014,
    waitUntil: 'load',
    url: 'https://www.cpunt.nl/agenda?q=&genre=metalpunkheavy&StartDate=&EndDate=#filter',
  },
  singlePage: {
    timeout: 30012,
  },
  app: {
    harvest: {
      dividers: [`&`],
      dividerRex: "[&]", 
      artistsIn: ['title', 'shortText'],
    },
    mainPage: {
      requiredProperties: ['venueEventUrl', 'title'],
      asyncCheckFuncs: ['refused', 'allowedEvent', 'forbiddenTerms'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'start'],
      asyncCheckFuncs: ['success'],
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
      Array.from(document.querySelectorAll('#filter .article-wrapper')).map((rawEvent) => {
        const title = rawEvent.querySelector('.article-title')?.textContent ?? null;
        const res = {
          anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} - main - ${title}</a>`,
          errors: [],
        };

        res.title = title;
        const anchor = rawEvent.querySelector('.absolute-link') ?? null;
        res.venueEventUrl = anchor?.href ?? null;
        
        res.mapToStartDate = rawEvent.querySelector('.article-info .article-date')?.textContent.trim() ?? '';
        res.mapToStartTime = rawEvent.querySelector('.article-info .article-time')?.textContent.trim().replace('.', ":") ?? '';
        const artInfoText =
          rawEvent.querySelector('.article-info')?.textContent.toLowerCase() ?? '';
        const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
        res.unavailable = !!rawEvent.textContent.match(uaRex);
        res.soldOut = !!artInfoText.match(/wachtlijst|uitverkocht/i);
        res.shortText = rawEvent.querySelector('.article-content .article-category')?.textContent.trim() ?? '';
        return res;
      }),
    { workerData, unavailabiltyTerms: terms.unavailability },
  );
  
  rawEvents = rawEvents
    .map((re) => mapToStartDate(re, 'dag-maandNaam-jaar', this.months))
    .map(mapToShortDate)
    .map(mapToStartTime)
    .map(combineStartTimeStartDate)
    .map((re) => workTitleAndSlug(re, this._s.app.harvest.possiblePrefix))
    .map(this.isMusicEventCorruptedMapper);

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
  
  return this.mainPageEnd({ stopFunctie, page, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region      SINGLE PAGE
scraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  await page
    .waitForSelector('#main .content-blocks', {
      timeout: 7500,
    });

  let pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ months, event }) => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${document.title}</a>`,
        errors: [],
      };

      const dd = document.querySelector('.article-time .icon-deuren-open');
      res.mapToDoorTime = dd ? dd.parentNode?.textContent.trim().replace('.', ':') : null;

      return res;
    },
    { months: this.months, event },
  );
  
  pageInfo = mapToDoorTime(pageInfo);
  pageInfo.startDate = event.startDate;
  pageInfo = combineDoorTimeStartDate(pageInfo);

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: [".bg-image[style*='background']"],
    mode: 'background-src',
  });

  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const viaTicketMaster = await page.evaluate(() => !!document.querySelector('.tickets-wrapper a[href*="ticketmaster"]') && !document.querySelector('.price'));

  if (viaTicketMaster) {
    pageInfo.price = null;
  } else {
    const priceRes = await this.getPriceFromHTML({
      page,
      event,
      pageInfo,
      selectors: ['.article-price'],
    });
    pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
    pageInfo.price = priceRes.price;
  }

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
