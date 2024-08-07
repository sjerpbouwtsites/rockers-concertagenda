/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/metropool.js';
import getImage from './gedeeld/image.js';
import {
  mapToStartDate,
  mapToShortDate,
} from './gedeeld/datums.js';
import workTitleAndSlug from './gedeeld/slug.js';
import terms from '../artist-db/store/terms.js';

// #region        SCRAPER CONFIG
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
    harvest: {
      dividers: [`+`],
      dividerRex: "[\\+]",
      artistsIn: ['title'],
    },     
    mainPage: {
      requiredProperties: ['venueEventUrl', 'title'],
      asyncCheckFuncs: ['refused', 'allowedEvent', 'forbiddenTerms', 'hasGoodTerms', 'hasAllowedArtist', 'spotifyConfirmation', 'failure'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'price', 'start'],
      asyncCheckFuncs: ['success'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

metropoolScraper.listenToMasterThread();

// #region       MAIN PAGE
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

  await page.evaluate(() => {
    document.querySelectorAll('.card__date--day span:first-child').forEach((dagSpan) => {
      dagSpan.parentNode.removeChild(dagSpan);
    });
  });

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll('a.card--event'))
        .map((rawEvent) => {
          const title = rawEvent.querySelector('.card__title')?.textContent ?? null;
          const res = {
            anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
            title,
          };
          res.venueEventUrl = rawEvent?.href ?? null;

          res.genres = rawEvent.querySelector("svg[src*='genre']")?.parentNode.textContent.trim().toLowerCase() ?? '';
          const st = rawEvent.querySelector('.card__title card__title--sub')?.textContent ?? '';
          res.shortText = `${st} ${res.genres}`.trim();
          const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
          res.unavailable = !!rawEvent.textContent.match(uaRex);

          res.mapToStartDate = rawEvent.querySelector('.card__date')?.textContent.trim().toLowerCase().replaceAll(/\s{2,100}/g, ' ') ?? '';

          res.soldOut =
          !!rawEvent
            .querySelector('.card__title--label')
            ?.textContent.match(/uitverkocht|sold\s?out/i) ?? null;
          return res;
        }),
    { workerData, unavailabiltyTerms: terms.unavailability },
  );

  rawEvents = rawEvents
    .map((event) => mapToStartDate(event, 'dag-maandNaam', this.months))
    .map(mapToShortDate)
    .map(this.isMusicEventCorruptedMapper)
    .map((re) => workTitleAndSlug(re, this._s.app.harvest.possiblePrefix));

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
     
      const startDate = event.startDate;

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
