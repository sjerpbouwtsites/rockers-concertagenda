/* eslint-disable no-await-in-loop */
/* global document */
import { workerData } from 'worker_threads';
import longTextSocialsIframes from './longtext/gebrdenobel.js';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import getImage from './gedeeld/image.js';
import terms from './gedeeld/terms.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const scraper = new AbstractScraper({
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
  
  if (event.title.toLowerCase().includes("nep event")) {
    reasons.push("NEP EVENT");
    return {
      event,
      reason: reasons.reverse().join(','),
      success: false,
    };        
  }

  if (this.skipFurtherChecks.includes(event.title)) {
    reasons.push("allready check main");
    return {
      event,
      reason: reasons.reverse().join(','),
      success: true,
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
  
  // const isRockRes = await this.isRock(event);
  // if (isRockRes.success) {
  //   this.talkToDB({
  //     type: 'db-request',
  //     subtype: 'saveAllowedTitle',
  //     messageData: {
  //       string: event.title,
  //       reason: reasons.join(', '),
  //     },
  //   }); 
  //   return isRockRes;
  // }
  // this.talkToDB({
  //   type: 'db-request',
  //   subtype: 'saveRefusedTitle',
  //   messageData: {
  //     string: event.title,
  //     reason: reasons.join(', '),
  //   },
  // }); 

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
            anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
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
    { workerData, unavailabiltyTerms: terms.unavailability },
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
            anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
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

scraper.cookiesNodig = async function (page) {
  const nodig = await page.evaluate(() => document.querySelector('.consent__show'));

  if (nodig) {
    await page.waitForSelector('.consent__form__submit', {
      timeout: 5000,
    });

    await page.evaluate(() => document.querySelector('.consent__form__submit').click());

    await this.waitTime(3000);
    await page.reload();

    await page.waitForSelector('.event-table tr', {
      timeout: 2500,
    });
  }
  return true;
};

// #region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
scraper.singlePage = async function ({ page, event }) {
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

  const pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ months }) => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${document.title}</a>`,
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

  await page.evaluate(() => {
    document.querySelectorAll('.event-table tr').forEach((row) => {
      if (row.textContent.includes('€')) {
        row.classList.add('gebrdenobel-price-manual');
      }
    });
  });

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.gebrdenobel-price-manual', '.event-table'],
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
