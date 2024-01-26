/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/occii.js';
import getImage from './gedeeld/image.js';
import { mapToStartDate, mapToStartTime } from './gedeeld/datums.js';
import terms from './gedeeld/terms.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 90000,
    url: 'https://occii.org/events/categories/rock/',
  },
  singlePage: {
    timeout: 45000,
  },
  app: {
    mainPage: {
      requiredProperties: ['venueEventUrl'],
      asyncCheckFuncs: ['allowed', 'event', 'refused', 'forbiddenTerms', 'emptySuccess'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'price', 'start'],
      asyncCheckFuncs: ['custom1', 'emptySuccess'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

scraper.listenToMasterThread();

scraper.asyncCustomCheck1 = async function (event, reasons) {
  const reasonsCopy = Array.isArray(reasons) ? reasons : [];
  const ss = !(event?.genres?.include('electronic') ?? false);
  if (ss) {
    reasonsCopy.reasons.push('not electronic');
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
      reason: reasonsCopy.reverse().join(','),
      reasons:reasonsCopy,
      success: true,
      break: true,
    };
  } 
  reasonsCopy.reasons.push('electronic');

  this.talkToDB({
    type: 'db-request',
    subtype: 'savRefusedTitle',
    messageData: {
      string: event.title,
      reason: reasonsCopy.reverse().join(', '),
    },
  });   
  return {
    break: false,
    success: false,
    event,
    reasons: reasonsCopy,
    reason: reasonsCopy.reverse().join(', '),
  };  
};

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
    ({ workerData, unavailabiltyTerms }) => {
      // al geweest
      const rm = document.querySelector('h1 ~ h1 + .occii-events-display-container');
      rm.parentNode.removeChild(rm);

      return Array.from(
        document.querySelectorAll('.occii-events-display-container .occii-event-display'),
      ).map((occiiEvent) => {
        const firstAnchor = occiiEvent.querySelector('a');
        const { title } = firstAnchor;
        const res = {
          anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title,
        };

        const eventText = occiiEvent.textContent.toLowerCase();
        const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
        res.unavailable = !!occiiEvent.textContent.match(uaRex);
        res.soldOut = !!eventText.match(/uitverkocht|sold\s?out/i) ?? false;
        res.venueEventUrl = firstAnchor.href;
        res.shortText = occiiEvent.querySelector('.occii-events-description')?.textContent ?? null;
        return res;
      });
    },
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

      res.mapToStartDate = document
        .querySelector('.occii-event-date-highlight')
        .textContent.split(' ')
        .splice(1, 4)
        .join(' ');
      res.mapToStartTime = document.querySelector('.occii-event-details').textContent;

      res.genre = Array.from(
        document.querySelectorAll('.event-categories [href*="events/categories"]'),
      ).map((cats) => cats.textContent.toLowerCase().trim());

      return res;
    },
    { months: this.month, event },
  );

  pageInfo = mapToStartDate(pageInfo, 'maand-dag-jaar', this.months);
  pageInfo = mapToStartTime(pageInfo);
  pageInfo.start = `${pageInfo.startDate}T${pageInfo.startTime}`;

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: ['.wp-post-image'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  await page.evaluate(() => {
    const t =
      document.querySelector('.occii-single-event, .occii-event-details')?.textContent ?? '';
    const priceM = t.match(/€.*/);
    if (priceM) {
      let p = priceM[0];
      if (!p.match(/\d+,\d/) && p.match(/\d+-\d/)) {
        p = p.replace(/-\d/, '');
      }
      const priceEl = document.createElement('div');
      priceEl.id = 'occii-temp-price';
      priceEl.innerHTML = p;
      document.body.appendChild(priceEl);
    }
  });

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['#occii-temp-price', '.occii-single-event', '.occii-event-details'],
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
