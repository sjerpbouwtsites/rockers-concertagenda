/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/nieuwenor.js';
import getImage from './gedeeld/image.js';
import terms from './gedeeld/terms.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 30053,
    url: 'https://nieuwenor.nl/programma',
  },
  singlePage: {
    timeout: 15014,
  },
  app: {
    mainPage: {
      requiredProperties: ['venueEventUrl', 'title', 'shortText'],
    },
    singlePage: {
      requiredProperties: ['start'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

scraper.listenToMasterThread();

// #region [rgba(60, 0, 0, 0.5)]      MAIN PAGE EVENT CHECK
scraper.mainPageAsyncCheck = async function (event) {
  const reasons = [];

  this.talkToDB({
    type: 'db-request',
    subtype: 'isRockEvent',
    messageData: {
      string: event.title,
    },
  });
  await this.checkDBhasAnswered();
  reasons.push(this.lastDBAnswer.reason);
  if (this.lastDBAnswer.success) {
    this.skipFurtherChecks.push(event.title);
    return {
      event,
      reason: reasons.reverse().join(','),
      success: true,
    };
  }  

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
    this.skipFurtherChecks.push(event.title);
    return {
      event,
      reason: reasons.reverse().join(','),
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
      reason: reasons.reverse().join(','),
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
        reason: reasons.join(', '),
      },
    });    
    
    return {
      event,
      reason: reasons.reverse().join(','),
      success: false,
    };
  }

  return {
    event,
    reason: reasons.join(', '),
    success: true,
  };
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 60, 0, 0.5)]      SINGLE PAGE EVENT CHECK
scraper.singlePageAsyncCheck = async function (event) {
  const reasons = [];
  
  if (this.skipFurtherChecks.includes(event.title)) {
    reasons.push("allready check main");
    return {
      event,
      reason: reasons.reverse().join(','),
      success: true,
    };    
  }

  const goodTermsRes = await this.hasGoodTerms(event);
  reasons.push(goodTermsRes.reason);
  if (goodTermsRes.success) {
    this.skipFurtherChecks.push(event.title);
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveAllowedTitle',
      messageData: {
        string: event.title,
        reason: reasons.join(', '),
      },
    });  
    return goodTermsRes;
  }  
 
  const isRockRes = await this.isRock(event);
  if (isRockRes.success) {
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveAllowedTitle',
      messageData: {
        string: event.title,
        reason: reasons.join(', '),
      },
    }); 
    return isRockRes;
  }
  this.talkToDB({
    type: 'db-request',
    subtype: 'saveRefusedTitle',
    messageData: {
      string: event.title,
      reason: reasons.join(', '),
    },
  }); 

  return {
    event,
    success: true,
    reason: reasons.join(', '),
  };
};
// #endregion                          SINGLE PAGE EVENT CHECK

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

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll('#events a[data-genres]')).map((eventEl) => {
        const genres = eventEl.hasAttribute('data-genres')
          ? eventEl.getAttribute('data-genres')
          : '';
        const title =
          eventEl.querySelector('figure + div > span:first-child')?.textContent.trim() ?? '';
        const res = {
          anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title,
        };
        res.shortText =
          `${genres}\n${eventEl
            .querySelector('figure + div > span:first-child + span')
            ?.textContent.trim()}` ?? '';
        res.venueEventUrl = eventEl?.href ?? null;
        res.startMatch = res.venueEventUrl.match(/(?<year>\d\d\d\d)\/(?<month>\d\d)\/(?<day>\d\d)/);
        if (Array.isArray) {
          res.startDate = `${res.startMatch.groups.year}-${res.startMatch.groups.month}-${res.startMatch.groups.day}`;
        }
        const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
        res.unavailable = !!eventEl.textContent.match(uaRex);
        res.soldOut =
          eventEl.querySelector('figure + div')?.innerHTML.match(/uitverkocht|sold\s?out/i) ?? null;
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

  const pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ event }) => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };

      res.startTijd = null;
      res.deurTijd = null;
      res.eindTijd = null;
      res.mapOver = Array.from(document.querySelectorAll('#pageContent + div .w-full div')).map(
        (a) => a.textContent.toLowerCase().replaceAll(/\s{2,100}/g, ' '),
      );

      res.mapOver.forEach((divInhoud) => {
        if (divInhoud.includes('open') && !res.deurTijd) {
          res.deurTijd = divInhoud.match(/\d\d:\d\d/)[0];
        } else if (divInhoud.includes('aanvang') && !res.startTijd) {
          res.startTijd = divInhoud.match(/\d\d:\d\d/)[0];
        } else if (divInhoud.includes('eind') && !res.eindTijd) {
          res.eindTijd = divInhoud.match(/\d\d:\d\d/)[0];
        }
      });

      if (res.startTijd) res.start = `${event.startDate}T${res.startTijd}:00`;
      if (res.deurTijd) res.door = `${event.startDate}T${res.deurTijd}:00`;
      if (res.eindTijd) res.end = `${event.startDate}T${res.eindTijd}:00`;

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
    selectors: ['.flickity-slider img'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  await page.evaluate(() => {
    const s = document.querySelector('.sticky');
    if (!s?.textContent.includes('€')) {
      const e = document.createElement('span');
      e.innerHTML = '€0.00';
      s.appendChild(e);
    }
  });
  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.sticky'],
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
