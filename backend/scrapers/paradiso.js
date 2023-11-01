/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/paradiso.js';
import getImage from './gedeeld/image.js';
import terms from './gedeeld/terms.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const paradisoScraper = new AbstractScraper({
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
    mainPage: {
      requiredProperties: ['venueEventUrl', 'title'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'price', 'start'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

paradisoScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
paradisoScraper.mainPageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);

  const isRefused = await this.rockRefuseListCheck(event, workingTitle);
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }

  const isAllowed = await this.rockAllowListCheck(event, workingTitle);
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  if (hasForbiddenTerms.success) {
    hasForbiddenTerms.success = false;
    this.saveRefusedTitle(workingTitle);
    return hasForbiddenTerms;
  }

  const hasGoodTermsRes = await this.hasGoodTerms(event);
  if (hasGoodTermsRes.success) {
    this.saveAllowedTitle(workingTitle);
    return hasGoodTermsRes;
  }

  const isRockRes = await this.isRock(event);
  if (isRockRes.success) {
    this.saveAllowedTitle(workingTitle);
  } else {
    this.saveRefusedTitle(workingTitle);
  }
  return isRockRes;
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
paradisoScraper.mainPage = async function () {
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
  await page.evaluate(
    () =>
      document.querySelector('.css-16y59pb:last-child .chakra-heading')?.textContent ??
      'geen titel gevonden',
    { workerData },
  );

  await this.autoScroll(page);
  await page.evaluate(
    // eslint-disable-next-line no-shadow
    () =>
      document.querySelector('.css-16y59pb:last-child .chakra-heading')?.textContent ??
      'geen titel gevonden',
    { workerData },
  );

  let rawEvents = await page.evaluate(
    ({ resBuiten, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll('.css-1agutam')).map((rawEvent) => {
        // eslint-disable-next-line no-shadow
        const res = {
          ...resBuiten,
          errors: [],
        };
        res.title = rawEvent.querySelector('.chakra-heading')?.textContent.trim() ?? '';
        res.shortText = rawEvent.querySelector('.css-1ket9pb')?.textContent.trim() ?? '';

        res.venueEventUrl = rawEvent.href ?? null;
        res.soldOut = !!rawEvent?.textContent.match(/uitverkocht|sold\s?out/i);
        const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
        res.unavailable = !!rawEvent?.textContent.match(uaRex);
        return res;
      }),
    { workerData, resBuiten: res, unavailabiltyTerms: terms.unavailability },
  );

  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents);
  const thisWorkersEvents = rawEvents.filter(
    (eventEl, index) => index % workerData.workerCount === workerData.index,
  );
  return this.mainPageEnd({ stopFunctie, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
paradisoScraper.singlePage = async function ({ page, event }) {
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

  const editedMonths = {
    jan: '01',
    feb: '02',
    mrt: '03',
    mar: '03',
    apr: '04',
    mei: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    okt: '10',
    nov: '11',
    dec: '12',
    januari: '01',
    februari: '02',
    maart: '03',
    april: '04',
    juni: '06',
    juli: '07',
    augustus: '08',
    september: '09',
    oktober: '10',
    november: '11',
    december: '12',
    january: '01',
    february: '02',
    march: '03',
    may: '05',
    june: '06',
    july: '07',
    august: '08',
    october: '10',
  };

  await this.waitTime(500);

  const pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ months, buitenRes }) => {
      const res = { ...buitenRes };

      const contentBox1 = document.querySelector('.css-1irwsol')?.outerHTML ?? '';
      const contentBox2 = document.querySelector('.css-gwbug6')?.outerHTML ?? '';
      if (!contentBox1 && !contentBox2) {
        res.corrupted = 'geen contentboxes';
      }

      try {
        const startDateMatch = document
          .querySelector('.css-tkkldl')
          ?.textContent.toLowerCase()
          .match(/(\d{1,2})\s+(\w+)/); // TODO paradiso kan nu niet omgaan met jaarrwisselingen.
        res.match = startDateMatch;
        if (startDateMatch && Array.isArray(startDateMatch) && startDateMatch.length === 3) {
          const monthName = months[startDateMatch[2]];
          if (!monthName) {
            res.errors.push({
              error: new Error(`month not found ${startDateMatch[2]}`),
              toDebug: startDateMatch,
            });
          }

          const curM = new Date().getMonth() + 1;
          let year = new Date().getFullYear();
          if (monthName < curM) {
            year += 1;
          }

          res.startDate = `${year}-${monthName}-${startDateMatch[1].padStart(2, '0')}`;
        }
      } catch (caughtError) {
        res.errors.push({
          error: caughtError,
          remarks: `startDateMatch ${res.anker}`,
          toDebug: {
            event,
          },
        });
      }

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
    { months: editedMonths, buitenRes },
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
