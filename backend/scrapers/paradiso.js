/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/paradiso.js';
import getImage from './gedeeld/image.js';
import {
  mapToStartDate,
  mapToStartTime,
  mapToShortDate,
  combineStartTimeStartDate,
} from './gedeeld/datums.js';
import workTitleAndSlug from './gedeeld/slug.js';
import terms from '../artist-db/store/terms.js';

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 180023,
    waitUntil: 'load',
    url: 'https://www.paradiso.nl/nl',
  },
  singlePage: {
    timeout: 120024,
  },
  app: {
    harvest: {
      dividers: [`+`],
      dividerRex: "[\\+]",
      artistsIn: ['title'],
    },  
    mainPage: {
      requiredProperties: ['venueEventUrl', 'title', 'startDate'],
      asyncCheckFuncs: ['refused', 'allowedEvent', 'forbiddenTerms', 'hasGoodTerms', 'hasAllowedArtist', 'spotifyConfirmation', 'failure'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'start'],
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

  const res = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData }) => ({
      anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${workerData.index}</a>`,
    }),
    { workerData },
  );

  await this.waitTime(250);

  // filter openen
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.chakra-button.css-cys37n')).filter((knop) => knop.textContent.includes('type'))[0].click();
  });
  await this.waitTime(250);

  // filter invoeren
  const aantalGeklikt = await page.evaluate(() => {
    const teKlikken = Array.from(document.querySelectorAll('.css-ymwss3')).map((knop) => {
      const t = knop.textContent.trim().toLowerCase();
      if (t.includes('rock') || t.includes('punk')) {
        return knop;
      }
    }).filter((a) => a);
    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < teKlikken.length; i++) {
      setTimeout(() => {
        teKlikken[i].click();
      }, i * 150);
    }
    return teKlikken.length;
  });

  this.dirtyTalk(`paradiso klikte filters: ${aantalGeklikt}`);

  // wachten op aanklikken in page.evaluate
  await this.waitTime(50 + aantalGeklikt * 150);

  // verstuur filter
  await page.waitForSelector('.chakra-button.css-17dvuub');
  await page.click('.chakra-button.css-17dvuub');

  await this.waitTime(250);

  await this.autoScroll(page);
  await this.autoScroll(page);
  await this.autoScroll(page);
  await this.autoScroll(page);
  await this.autoScroll(page);

  // datum in concerten zetten
  await page.evaluate(() => {
    document.querySelectorAll('.css-1usmbod').forEach((datumGroep) => {
      const datum = datumGroep.textContent.toLowerCase().trim().substring(4, 10);
      const concertenOpDezeDatum = datumGroep.parentNode.querySelectorAll('.css-1agutam');
      // eslint-disable-next-line consistent-return
      concertenOpDezeDatum.forEach((concert) => {
        concert.setAttribute('date-datum', datum);
      });
    });    
  });
 
  let rawEvents = await page.evaluate(
    ({ resBuiten, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll('.css-1agutam')).map((eventEl) => {
        // eslint-disable-next-line no-shadow
        const res = {
          ...resBuiten,
          errors: [],
        };
        res.title = eventEl.querySelector('.chakra-heading')?.textContent.trim() ?? '';
        const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
        res.unavailable = !!eventEl?.textContent.match(uaRex);
        if (res.unavailable) return res;

        res.shortText = eventEl.querySelector('.css-1ket9pb')?.textContent.trim() ?? '';

        const tttt = eventEl.querySelector('.css-1kynn8g').textContent.trim().toLowerCase();
        const tijdVeldHeeftEchtTijd = /\d\d:\d\d/.test(tttt); // kan ook term hebben... pannekoeken
        const tijd = tijdVeldHeeftEchtTijd ? tttt : '20:00';

        const datum = eventEl.getAttribute('date-datum');

        res.mapToStartDate = datum;
        res.mapToStartTime = tijd;
 
        res.venueEventUrl = eventEl.href ?? null;
        res.soldOut = !!eventEl?.textContent.match(/uitverkocht|sold\s?out/i);
        return res;
      }),
    {
      workerData,
      resBuiten: res, 
      unavailabiltyTerms: terms.unavailability,
    },
  );

  rawEvents = rawEvents
    .map((event) => mapToStartDate(event, 'dag-maandNaam', this.months))
    .map(mapToStartTime)
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

  const buitenRes = {
    anker: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
    errors: [],
  };

  await this.waitTime(50);

  const pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ buitenRes, event }) => {
      const res = { ...buitenRes };

      res.startDate = event.startDate;

      return res;
    },
    { buitenRes, event },
  );

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: ['.img-wrapper picture img'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['[href*="https://tickets.paradiso.nl"]', '.css-1yk0d0u', '.css-1623pe7', '.chakra-container'],
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
