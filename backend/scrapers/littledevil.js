/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/littledevil.js';
import getImage from './gedeeld/image.js';
import {
  mapToStartDate,
  combineDoorTimeStartDate,
  mapToDoorTime,
  mapToShortDate,
  mapToStartTime,
  combineStartTimeStartDate,
} from './gedeeld/datums.js';
import workTitleAndSlug from './gedeeld/slug.js';
import terms from '../artist-db/store/terms.js';

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },
  mainPage: {
    timeout: 45000,
    url: 'https://www.littledevil.nl/calendar/',
  },
  singlePage: {
    timeout: 15000,
  },
  app: {
    harvest: {
      dividers: [`+`],
      dividerRex: "[\\+]",
      artistsIn: ['title'],
    }, 
    mainPage: {
      requiredProperties: ['venueEventUrl', 'title', 'start'],
      asyncCheckFuncs: ['refused', 'allowedEvent', 'forbiddenTerms', 'hasGoodTerms'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title'],
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
    ({ workerData }) =>
      Array.from(document.querySelectorAll('.entry-content .bericht')).map((eventEl) => {
        const venueEventUrl = eventEl.querySelector('.titelbericht a').href ?? '';
        const title = eventEl.querySelector('.titelbericht').textContent.trim() ?? '';
        const res = {
          title,
          errors: [],
          venueEventUrl,
          anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
        };
        const ct = eventEl.querySelector('.contentbericht')?.textContent ?? '';
        const scheiding = ct.includes('/') ? '/' : '|';
        const spl = ct.split(scheiding);
        const catTeksten = spl
          .filter(
            (catT) =>
              !catT.includes('tba') &&
              !catT.includes('€') &&
              !catT.includes(',-') &&
              !catT.match(/\d\d/) &&
              !catT.includes('gratis'),
          )
          .map((a) => a.trim())
          .join(' - ');

        res.price = '';
        const s = spl[spl.length - 1];
        res.spl = spl;
        if (s.includes('gratis')) {
          res.price = 0;
        } else if (s.includes('tba')) {
          res.price = null;
        } else {
          try {
            const mmm = s
              .replace('-', '00')
              .replace(',', '.')
              .match(/(\d+)([,.]?)(\d{1,2})/);
            if (mmm) {
              res.price = Number(mmm[0]);
            } else {
              res.price = null;
            }
          } catch (error) {
            res.price = null;
            res.errors.push({
              error: new Error(`price berekening met ${s} ${res.anker}`),
            });
          }
        }

        const startTimeM = ct.match(/(\d{1,2})\s?[:.]?\s?(\d\d)?/);
        if (startTimeM) {
          res.mapToStartTime = startTimeM[0].replace('.', ':').padEnd(5, ':00');
        } else {
          res.mapToStartTime = '20:00';
        }

        res.shortText = catTeksten;
        res.soldOut = eventEl.textContent.match(/uitverkocht|sold\s?out/i) ?? false;

        res.mapToStartDate =
          eventEl.querySelector('.einddatumbericht')?.textContent.toLowerCase() ?? '';

        return res;
      }),
    { workerData },
  );

  rawEvents = rawEvents
    .map((event) => mapToStartDate(event, 'dag-maandNaam', this.months))
    .map((event) => mapToStartTime(event))
    .map(mapToShortDate)
    .map(combineStartTimeStartDate)
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
scraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const pageInfo = {
    title: event.title,
    errors: [],
    anker: `<a class='page-info' href='${event.venueEventUrl}'>${workerData.family} single - ${event.title}</a>`,
  };

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: ['.wp-post-image '],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

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
