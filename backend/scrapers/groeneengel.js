/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/groeneengel.js';
import getImage from './gedeeld/image.js';
import terms from './gedeeld/terms.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 25076,
    waitUntil: 'load',
    url: 'https://www.groene-engel.nl/programma/?filter=concert',
  },
  singlePage: {
    timeout: 20077,
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

scraper.listenToMasterThread();

// #region [rgba(60, 0, 0, 0.5)]      MAIN PAGE EVENT CHECK
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
    this.skipFurtherChecks.push(event.title);
    return {
      event,
      reason: reasons.reverse().join(','),
      success: true,
    };
  }

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
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveAllowedTitle',
      messageData: {
        string: event.title,
        reason: reasons.reverse().join(', '),
      },
    }); 
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
        reason: reasons.reverse().join(', '),
      },
    });    
    
    return {
      event,
      reason: reasons.reverse().join(','),
      success: false,
    };
  }

  this.talkToDB({
    type: 'db-request',
    subtype: 'saveAllowedTitle',
    messageData: {
      string: event.title,
      reason: reasons.reverse().join(', '),
    },
  }); 

  return {
    event,
    reason: reasons.reverse().join(', '),
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
        reason: reasons.reverse().join(', '),
      },
    });  
    return goodTermsRes;
  }  

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  reasons.push(hasForbiddenTerms.reason);
   
  const isRockRes = await this.isRock(event);
  if (isRockRes.success) {
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveAllowedTitle',
      messageData: {
        string: event.title,
        reason: reasons.reverse().join(', '),
      },
    }); 
    return isRockRes;
  }
  this.talkToDB({
    type: 'db-request',
    subtype: 'saveRefusedTitle',
    messageData: {
      string: event.title,
      reason: reasons.reverse().join(', '),
    },
  }); 

  return {
    event,
    success: true,
    reason: reasons.reverse().join(', '),
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

  let baseEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData, unavailabiltyTerms, months }) =>
      Array.from(document.querySelectorAll('.collection-wrapper .event-part')).map((eventEl) => {
        const title = eventEl.querySelector('.part-title')?.textContent ?? null;
        const res = {
          anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title,
        };
        res.venueEventUrl = eventEl.querySelector('.left-side')?.href ?? '';
        const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
        res.unavailable = !!eventEl.textContent.match(uaRex);
        res.soldOut =
          !!eventEl.querySelector('.bottom-bar')?.textContent.match(/uitverkocht|sold\s?out/i) ??
          null;

        res.startDateMatch =
          eventEl
            .querySelector('.date-label')
            ?.textContent.match(/\s(?<datum>\d{1,2}\s\w+\s\d\d\d\d)/) ?? null;
        if (res.startDateMatch && res.startDateMatch?.groups) {
          res.startDateRauw = res.startDateMatch.groups.datum;
        }

        res.dag = res.startDateMatch.groups.datum.split(' ')[0].padStart(2, '0');
        res.maand = res.startDateMatch.groups.datum.split(' ')[1];
        res.maand = months[res.maand];
        res.jaar = res.startDateMatch.groups.datum.split(' ')[2];

        res.startDate = `${res.jaar}-${res.maand}-${res.dag}`;

        return res;
      }),
    { workerData, unavailabiltyTerms: terms.unavailability, months: this.months },
  );

  baseEvents = baseEvents.map(this.isMusicEventCorruptedMapper);

  const eventGen = this.eventGenerator(baseEvents);
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

      let startEl;
      let deurEl;
      document.querySelectorAll('.time-tag ~ *').forEach((tijdEl) => {
        if (tijdEl.textContent.toLowerCase().includes('aanvang')) {
          startEl = tijdEl;
        }
        if (tijdEl.textContent.toLowerCase().includes('open')) {
          deurEl = tijdEl;
        }
      });

      if (!startEl) {
        res.errors.push({
          error: new Error('geen tijd el gevonden'),
        });
      }

      res.startTijdMatch = startEl.textContent.match(/\d\d:\d\d/);
      if (deurEl) res.deurTijdMatch = deurEl.textContent.match(/\d\d:\d\d/);
      if (Array.isArray(res.startTijdMatch)) res.startTijd = res.startTijdMatch[0];
      if (Array.isArray(res.deurTijdMatch)) res.deurTijd = res.deurTijdMatch[0];

      try {
        res.start = `${event.startDate}T${res.startTijd}:00`;
        res.door = !res?.deurTijd ? null : `${event.startDate}T${res.deurTijd}:00`;
      } catch (error) {
        res.errors.push({
          error,
          remarks: `date ${event.startDate} time ${res.startTijd}`,
          toDebug: {
            startElT: startEl.textContent,
          },
        });
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
    selectors: ['.img-wrapper img'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.main-ticket-info'],
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
