/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/littledevil.js';
import getImage from './gedeeld/image.js';
import {
  combineStartTimeStartDate, mapToStartDate, mapToStartTime, 
  mapToDoorTime, combineDoorTimeStartDate,
} from './gedeeld/datums.js';

// #region [rgba(0, 60, 0, 0.5)]       SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },
  mainPage: {
    timeout: 45000,
    url: 'https://www.podiumvictorie.nl/programma/',
  },
  singlePage: {
    timeout: 15000,
  },
  app: {
    mainPage: {
      requiredProperties: ['venueEventUrl', 'title'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'start'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

scraper.listenToMasterThread();

// #region [rgba(50, 0, 0, 0.5)]      MAIN PAGE EVENT CHECK
scraper.mainPageAsyncCheck = async function (event) {
  const reasons = [];
  
  this.talkToDB({
    type: 'db-request',
    subtype: 'isAllowed',
    messageData: {
      string: event.title,
    },
  });
  await this.checkDBhasAnswered();
  reasons.push(this.lastDBAnswer.reason);
  if (this.lastDBAnswer.success) {
    return {
      event,
      reason: reasons.join(','),
      success: true,
    };
  }
  
  this.talkToDB({
    type: 'db-request',
    subtype: 'isRefused',
    messageData: {
      string: event.title,
    },
  });
  await this.checkDBhasAnswered();
  reasons.push(this.lastDBAnswer.reason);
  if (this.lastDBAnswer.success) {
    return {
      event,
      reason: reasons.join(','),
      success: false,
    };
  }

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  reasons.push(hasForbiddenTerms.reason);
  if (hasForbiddenTerms.success) {
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveRefusedTitle',
      messageData: {
        string: event.title,
        reason: hasForbiddenTerms.reason,
      },
    });    
    
    return {
      event,
      reason: reasons.join(','),
      success: false,
    };
  }

  return {
    reason: reasons.join(', '),
    event,
    success: true,
  };
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
scraper.singlePageAsyncCheck = async function (event) {
  const reasons = [];
  this.talkToDB({
    type: 'db-request',
    subtype: 'isAllowed',
    messageData: {
      string: event.title,
    },
  });
  await this.checkDBhasAnswered();
  reasons.push(this.lastDBAnswer.reason);
  if (this.lastDBAnswer.success) {
    return {
      event,
      reason: reasons.join(','),
      success: true,
    };
  }

  const hasGoodTerms = await this.hasGoodTerms(event);
  reasons.push(hasGoodTerms.reason);
  if (hasGoodTerms.success) {
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveAllowedTitle',
      messageData: {
        string: event.title,
        reason: hasGoodTerms.reason,
      },
    });
    
    return {
      event,
      reason: reasons.join(','),
      success: true,
    };
  }

  const isRock = await this.isRock(event);
  reasons.push(isRock.reason);
  if (isRock.success) {
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveAllowedTitle',
      messageData: {
        string: event.title,
        reason: isRock.reason,
      },
    });
    
    return {
      event,
      reason: reasons.join(','),
      success: true,
    };
  }

  this.talkToDB({
    type: 'db-request',
    subtype: 'saveRefusedTitle',
    messageData: {
      string: event.title,
      reason: reasons.join(','),
    },
  });
  
  return {
    event,
    reason: reasons.join(','),
    success: false,
  };
};
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 0, 60, 0.5)]      MAIN PAGE
scraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );

    return this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  const rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData }) =>
      Array.from(document.querySelectorAll('.program.row[data-genre*="live"]')).map((eventEl) => {
        const venueEventUrl = eventEl.querySelector('a').href ?? '';
        const title = eventEl.querySelector('.program-desc h4').textContent.trim() ?? '';
        const res = {
          title,
          errors: [],
          venueEventUrl,
          anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
        };
        res.shortText = eventEl.querySelector('h4 + p')?.textContent.trim() ?? '';
        res.soldOut = !!eventEl.querySelector('.uitverkocht');
        return res;
      }),   
    { workerData },
  );

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

// #region [rgba(60, 60, 0, 0.1)]     SINGLE PAGE
scraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  let pageInfo = {
    title: event.title,
    errors: [],
    anker: `<a class='page-info' href='${event.venueEventUrl}'>${workerData.family} single - ${event.title}</a>`,
  };

  await page.evaluate(() => {
    const s = document.querySelector('header[style*="background"]').getAttribute('style').replace("url('/", "url('https://www.podiumvictorie.nl/");
    document.querySelector('header[style*="background"]').setAttribute('style', s);
    return s;
  });

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: ['header[style*="background"]'],
    mode: 'background-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.show-info .columns + .columns'],
  });
  
  const isGratis = await page.evaluate(() => !document.querySelector('.show-info .columns + .columns')?.textContent.match(/€/i) ?? null);
  if (pageInfo.errors.length && isGratis) {
    pageInfo.price = 0;
  } else {
    pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
    pageInfo.price = priceRes.price;
  }

  pageInfo.mapToStartDate = await page.evaluate(() => document.querySelector('.show-info')?.textContent ?? null);
  pageInfo.mapToStartTime = await page.evaluate(() => {
    const r = document.querySelector('.show-info')?.textContent.match(/deur.*/i);
    if (Array.isArray(r)) return r[0].replace('.', ':');
    return null;
  });
  pageInfo.mapToDoorTime = await page.evaluate(() => {
    const r = document.querySelector('.show-info')?.textContent.match(/aanvang.*/i);
    if (Array.isArray(r)) return r[0].replace('.', ':');
    return null;
  });
  pageInfo = mapToStartTime(pageInfo);
  pageInfo = mapToDoorTime(pageInfo);
  pageInfo = mapToStartDate(pageInfo, 'dag-maandNaam-jaar', this.months);
  pageInfo = combineStartTimeStartDate(pageInfo);
  pageInfo = combineDoorTimeStartDate(pageInfo);

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
