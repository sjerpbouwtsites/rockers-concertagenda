/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/paradiso.js';
import getImage from './gedeeld/image.js';
import {
  mapToStartDate,
  mapToShortDate,
} from './gedeeld/datums.js';
import workTitleAndSlug from './gedeeld/slug.js';
import terms from '../artist-db/store/terms.js';

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 120023,
    waitUntil: 'load',
    url: 'https://www.paradiso.nl/',
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

  await page.waitForSelector('.chakra-container');

  await this.autoScroll(page);
  await this.autoScroll(page);
  await page.evaluate(
    () =>
      document.querySelector('.css-16y59pb:last-child .chakra-heading')?.textContent ??
    'geen titel gevonden',
    { workerData },
  );
  
  await this.autoScroll(page);
  await this.autoScroll(page);
  await this.autoScroll(page);
  await this.autoScroll(page);
  await this.autoScroll(page);
  await this.autoScroll(page);
  await this.autoScroll(page);
  await this.autoScroll(page);
  await page.evaluate(
    // eslint-disable-next-line no-shadow
    () =>
      document.querySelector('.css-16y59pb:last-child .chakra-heading')?.textContent ??
      'geen titel gevonden',
    { workerData },
  );
 
  // DIT IS EEN VOLSLAGEN BIZARRE HACK EN IK HEB GEEN IDEE WAAROM DIT ZO MOET
  const datumRijMap = await page.evaluate(() => {
    const datumIdMap = {};
    document.querySelectorAll('.css-16y59pb').forEach((datumRij, index) => {
      // eslint-disable-next-line no-param-reassign
      datumRij.id = `${datumRij.className}-${index}`;
      const datumR = datumRij.textContent.trim().toLowerCase().substring(3, 10).trim() ?? '';
      datumIdMap[datumRij.id] = datumR;
    });
    return datumIdMap;
  });

  let rawEvents = await page.evaluate(
    ({ resBuiten, unavailabiltyTerms, datumRijMap1 }) =>
      Array.from(document.querySelectorAll('.css-1agutam')).map((rawEvent) => {
        // eslint-disable-next-line no-shadow
        const res = {
          ...resBuiten,
          errors: [],
        };
        res.title = rawEvent.querySelector('.chakra-heading')?.textContent.trim() ?? '';
        res.shortText = rawEvent.querySelector('.css-1ket9pb')?.textContent.trim() ?? '';
        
        const datumRij = rawEvent.parentNode.parentNode;
        res.datumRijClassNAme = datumRij.className;
        res.datumRijId = datumRij.id;
        res.datumRijDate = datumRijMap1[datumRij.id];
        res.mapToStartDate = datumRijMap1[datumRij.id];
 
        // if (!rawEvent.hasAttribute('data-date')) {
        //   res.XDATUMFAAL = 'hitler';
        // }
        // res.mapToStartDate = rawEvent.getAttribute('data-date');

        res.venueEventUrl = rawEvent.href ?? null;
        res.soldOut = !!rawEvent?.textContent.match(/uitverkocht|sold\s?out/i);
        const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
        res.unavailable = !!rawEvent?.textContent.match(uaRex);
        return res;
      }),
    {
      workerData,
      resBuiten: res, 
      unavailabiltyTerms: terms.unavailability,
      datumRijMap1: datumRijMap, 
    },
  );

  rawEvents = rawEvents
    .map((event) => {
      this.dirtyLog(event);
      return mapToStartDate(event, 'dag-maandNaam', this.months);
    })
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
scraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const buitenRes = {
    anker: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
    errors: [],
  };

  try {
    await page.waitForSelector('.css-tkkldl', {
      timeout: 3000,
    });
  } catch (caughtError) {
    buitenRes.errors.push({
      error: caughtError,
      remarks: `Paradiso wacht op laden single pagina\n${buitenRes.anker}`,
      errorLevel: 'notice',
    });
    return this.singlePageEnd({ pageInfo: buitenRes, stopFunctie, page });
  }

  await this.waitTime(500);

  const pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ buitenRes, event }) => {
      const res = { ...buitenRes };

      res.startDate = event.startDate;

      const contentBox1 = document.querySelector('.css-1irwsol')?.outerHTML ?? '';
      const contentBox2 = document.querySelector('.css-gwbug6')?.outerHTML ?? '';
      if (!contentBox1 && !contentBox2) {
        res.corrupted = 'geen contentboxes';
      }

      // try {
      //   const startDateMatch = document
      //     .querySelector('.css-tkkldl')
      //     ?.textContent.toLowerCase()
      //     .match(/(\d{1,2})\s+(\w+)/); // TODO paradiso kan nu niet omgaan met jaarrwisselingen.
      //   res.match = startDateMatch;
      //   if (startDateMatch && Array.isArray(startDateMatch) && startDateMatch.length === 3) {
      //     const monthName = months[startDateMatch[2]];
      //     if (!monthName) {
      //       res.errors.push({
      //         error: new Error(`month not found ${startDateMatch[2]}`),
      //         toDebug: startDateMatch,
      //       });
      //     }

      //     const curM = new Date().getMonth() + 1;
      //     let year = new Date().getFullYear();
      //     if (monthName < curM) {
      //       year += 1;
      //     }

      //     res.startDate = `${year}-${monthName}-${startDateMatch[1].padStart(2, '0')}`;
      //   }
      // } catch (caughtError) {
      //   res.errors.push({
      //     error: caughtError,
      //     remarks: `startDateMatch ${res.anker}`,
      //     toDebug: {
      //       event,
      //     },
      //   });
      // }

      let startTijd;
      let deurTijd;
      let eindTijd;
      const tijden = document.querySelector('.css-65enbk').textContent.match(/\d\d:\d\d/g);
      if (tijden.length > 2) {
        eindTijd = tijden[2];
      }
      if (tijden.length > 1) {
        deurTijd = tijden[1];
        startTijd = tijden[0];
      }
      if (tijden.length === 1) {
        startTijd = tijden[0];
      }
      if (!tijden.length) {
        res.errors.push({
          error: new Error(`Geen tijden gevonden ${res.anker}`),
        });
      }

      if (startTijd) {
        res.start = `${res.startDate}T${startTijd}:00`;
      }
      if (deurTijd) {
        res.door = `${res.startDate}T${deurTijd}:00`;
      }
      if (eindTijd) {
        res.end = `${res.startDate}T${eindTijd}:00`;
      }

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
    selectors: ['.css-xz41fi source', '.css-xz41fi source:last-of-type'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.css-f73q4m', '.price', '.chakra-container'],
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
