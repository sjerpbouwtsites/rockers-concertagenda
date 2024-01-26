/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/neushoorn.js';
import getImage from './gedeeld/image.js';
import {
  mapToStartDate,
  combineDoorTimeStartDate,
  mapToDoorTime,
  mapToStartTime,
  combineStartTimeStartDate,
} from './gedeeld/datums.js';
import terms from './gedeeld/terms.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },
  mainPage: {
    url: 'https://neushoorn.nl/#/search?category=Heavy',
  },
  singlePage: {
    timeout: 20000,
  },
  app: {
    mainPage: {
      requiredProperties: ['venueEventUrl', 'title'],
      asyncCheckFuncs: ['allowed', 'event', 'refused', 'goodTerms', 'forbiddenTerms', 'custom1', 'saveRefused', 'emptyFailure'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'start'],
    },
  },
});
// #endregion           

scraper.asyncCustomCheck1 = async function (event, reasons) {
  const reasonsCopy = Array.isArray(reasons) ? reasons : [];
  let overdinges = null;
  if (event.title.toLowerCase().trim().match(/\s[-–]\s/)) {
    const a = event.title.toLowerCase().trim().replace(/\s[-–]\s.*/, '');
    overdinges = [a];
  }

  const isRockRes = await this.isRock(event, overdinges);
  reasonsCopy.push(isRockRes.reason);
  if (isRockRes.success) {
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveAllowedTitle',
      messageData: {
        string: event.title,
        reason: reasonsCopy.reverse().join(', '),
      },
    }); 
    return {
      event,
      reason: reasons.reverse().join(','),
      reasons: reasonsCopy,
      break: true,
      success: true,
    };
  }  
  return {
    break: false,
    success: null,
    event,
    reasons: reasonsCopy,
  };  
};

scraper.listenToMasterThread();

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
scraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    return this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  try {
    await page.waitForSelector('.productions__item', {
      timeout: this.singlePageTimeout,
    });
    await this.waitTime(50);
  } catch (caughtError) {
    this.handleError(
      caughtError,
      'Laad en klikwachten timeout neushoorn',
      'close-thread',
      null,
    );
    return this.mainPageEnd({ stopFunctie, page, rawEvents: [] });
  }

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll('.productions__item')).map((eventEl) => {
        const title = eventEl.querySelector(
          '.productions__item__content span:first-child',
        ).textContent;
        const res = {
          anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title,
        };
        res.shortText = eventEl.querySelector('.productions__item__subtitle')?.textContent ?? '';
        res.venueEventUrl = eventEl.href;
        const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
        res.unavailable = !!eventEl.textContent.match(uaRex);
        res.soldOut =
          !!eventEl.querySelector('.chip')?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;
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

// #region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
scraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  let pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ event }) => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };

      res.mapToStartDate =
        document
          .querySelector('.summary .summary__item:first-child')
          ?.textContent.trim()
          .toLowerCase() ?? '';
      const tweedeSuIt = document.querySelector('.summary .summary__item + .summary__item');
      if (tweedeSuIt.textContent.includes('-')) {
        const s = tweedeSuIt.textContent.split('-');
        tweedeSuIt.innerHTML = `<span class='deur'>${s[0]}</span><span class='start'>${s[1]}</span>'`;
      }
      res.mapToStartTime =
        document
          .querySelector('.summary .summary__item .start, .summary .summary__item + .summary__item')
          ?.textContent.trim()
          .toLowerCase() ?? '';
      res.mapToDoorTime =
        document.querySelector('.summary .summary__item .deur')?.textContent.trim().toLowerCase() ??
        '';

      return res;
    },
    { months: this.months, event },
  );

  pageInfo = mapToStartDate(pageInfo, 'dag-maandNaam', this.months);
  pageInfo = mapToStartTime(pageInfo);
  pageInfo = mapToDoorTime(pageInfo);
  pageInfo = combineStartTimeStartDate(pageInfo);
  pageInfo = combineDoorTimeStartDate(pageInfo);

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: ['.header--theatre'],
    mode: 'background-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.prices__item__price', '.prices', 'sidebar .tickets-button'],
  });
  const isGratis = await page.evaluate(() => !!document.querySelector('.tickets-button')?.textContent.match(/gratis/i) ?? null);
  if (pageInfo.errors.length && isGratis) {
    pageInfo.price = 0;
  } else {
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
