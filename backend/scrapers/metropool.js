/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/metropool.js';
import getImage from './gedeeld/image.js';
import terms from './gedeeld/terms.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const metropoolScraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 60000,
    waitUntil: 'load',
    url: 'https://metropool.nl/agenda',
  },
  singlePage: {
    timeout: 45000,
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

metropoolScraper.listenToMasterThread();

// #region [rgba(60, 0, 0, 0.5)]      MAIN PAGE EVENT CHECK
metropoolScraper.mainPageAsyncCheck = async function (event) {
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
    reason: reasons.join(', '),
    success: true,
  };
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
metropoolScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    return this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  await this.autoScroll(page);
  await this.autoScroll(page);
  await this.autoScroll(page);
  await this.autoScroll(page);

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll('a.card--event')).map((rawEvent) => {
        const title = rawEvent.querySelector('.card__title')?.textContent ?? null;
        const res = {
          anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title,
        };
        res.venueEventUrl = rawEvent?.href ?? null;
        const genres = rawEvent.dataset?.genres ?? '';
        const st = rawEvent.querySelector('.card__title card__title--sub')?.textContent ?? '';
        res.shortText = `${st} ${genres}`.trim();
        const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
        res.unavailable = !!rawEvent.textContent.match(uaRex);
        res.soldOut =
          !!rawEvent
            .querySelector('.card__title--label')
            ?.textContent.match(/uitverkocht|sold\s?out/i) ?? null;
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
metropoolScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ months, event }) => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };

      res.shortText =
        `${event?.shortText ?? ''} ${
          document.querySelector('.title-wrap-medium .text-support')?.textContent
        }` ?? '';
      res.shortText = res.shortText.replaceAll('undefined', '');
      res.shortText = res.shortText.trim();
      const startDateRauwMatch = document
        .querySelector('.event-title-wrap')
        ?.innerHTML.match(
          /(\d{1,2})\s*(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)\s*(\d{4})/,
        );

      if (!Array.isArray(startDateRauwMatch) || !startDateRauwMatch.length) {
        res.errors.push({
          error: new Error(`geen match startDate ${res.anker}`),
          toDebug: {
            text: document.querySelector('.event-title-wrap')?.innerHTML,
            res,
          },
        });
        return res;
      }

      const day = startDateRauwMatch[1];
      const month = months[startDateRauwMatch[2]];
      const year = startDateRauwMatch[3];
      const startDate = `${year}-${month}-${day}`;

      try {
        const startTimeMatch = document.querySelector('.beginTime')?.innerHTML.match(/\d\d:\d\d/);
        if (startTimeMatch && startTimeMatch.length) {
          res.start = `${startDate}T${startTimeMatch[0]}:00`;
        } else {
          res.errors.push({
            error: new Error(`wel datum, geen starttijd ${res.anker}`),
            toDebug: {
              text: document.querySelector('.beginTime')?.innerHTML,
              res,
            },
          });
          return res;
        }
        const doorTimeMatch = document.querySelector('.doorOpen')?.innerHTML.match(/\d\d:\d\d/);
        if (doorTimeMatch && doorTimeMatch.length) {
          res.door = `${startDate}T${doorTimeMatch[0]}:00`;
        }
      } catch (caughtError) {
        res.errors.push({
          error: caughtError,
          remarks: `start deurtijd match en of dateconversie ${res.anker}`,
          toDebug: {
            event,
          },
        });
      }

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
    selectors: ['.object-fit-cover'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.doorPrice', '.page-labels'],
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
