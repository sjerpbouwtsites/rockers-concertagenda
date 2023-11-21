/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/dehelling.js';
import getImage from './gedeeld/image.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const dehellingScraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 30011,
    url: 'https://dehelling.nl/agenda/?zoeken=&genre%5B%5D=heavy',
  },
  singlePage: {
    timeout: 10012,
  },
  app: {
    mainPage: {
      requiredProperties: ['venueEventUrl', 'title', 'start'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'price', 'start'],
      longHTMLnewStyle: true,
    },
  },
});
// #endregion                          SCRAPER CONFIG

dehellingScraper.listenToMasterThread();

// #region [rgba(60, 0, 0, 0.5)]      MAIN PAGE EVENT CHECK
dehellingScraper.mainPageAsyncCheck = async function (event) {
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
// dehellingScraper.singlePageAsyncCheck = async function (event) {
//   return {
//     reason: ['nothing found currently'].join(';'),
//     event,
//     success: true,
//   };
// };
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
dehellingScraper.mainPage = async function () {
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
    ({ workerData }) =>
      Array.from(document.querySelectorAll('.c-event-card'))
        .filter((eventEl) => {
          // TODO naar fatsoenlijke async check
          const tc = eventEl.querySelector('.c-event-card__meta')?.textContent.toLowerCase() ?? '';
          return !tc.includes('experimental') && !tc.includes('hiphop');
        })
        .map((eventEl) => {
          const schemaData = JSON.parse(
            eventEl.querySelector('[type="application/ld+json"]').innerHTML,
          );
          const title = schemaData?.name;

          const res = {
            anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
            title,
          };

          try {
            res.end = schemaData.endDate.replace(' ', 'T');
          } catch (caughtError) {
            res.errors.push({
              error: caughtError,
              remarks: `end date time datestring omzetting ${title} ${res.anker}`,
              toDebug: res,
            });
          }

          let startString;
          try {
            const metaEl = eventEl.querySelector('.c-event-card__meta') ?? null;
            if (metaEl) {
              const tijdMatch = metaEl.textContent.match(/(\d\d):(\d\d)/);
              if (tijdMatch && tijdMatch.length > 2) {
                res.startTime = tijdMatch[0];
                const hours = tijdMatch[1];
                const minutes = tijdMatch[2];
                startString = res.end.replace(
                  /T.*/,
                  `T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00`,
                );
                res.start = startString;
              }
            }
          } catch (caughtError) {
            res.errors.push({
              error: caughtError,
              remarks: `start date time eruit filteren error \n ${res.end} \n ${startString} ${title} ${res.anker}`,
              toDebug: res,
            });
          }

          res.soldOut = !!eventEl.querySelector('.c-event-card__banner--uitverkocht');

          if (!res.startTime && res.end) {
            res.start = res.end;
            res.end = null;
          }

          res.venueEventUrl = schemaData.url;
          res.shortText = schemaData?.description ?? null;

          return res;
        }),
    { workerData },
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
dehellingScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ event }) => {
      const res = {
        anker: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
        errors: [],
      };
      const lineupEl = document.querySelector('.c-event-content__lineup');
      if (lineupEl) {
        const lineup = Array.from(
          document.querySelectorAll('.u-section__inner.c-event-content__lineup li'),
        )
          .map((li) => li.textContent)
          .join(', ');

        res.shortText = `${event.shortText}. Lineup: ${lineup}`;
        lineupEl.parentNode.removeChild(lineupEl);
      }
      const shareEl = document.querySelector('.c-event-content__sharer');
      if (shareEl) {
        shareEl.parentNode.removeChild(shareEl);
      }

      return res;
    },
    { event },
  );

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: ['.img--cover img', '.u-section__inner img'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.c-event-meta__table'],
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
