/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/littledevil.js';
import { combineStartTimeStartDate, mapToStartDate, mapToStartTime } from './gedeeld/datums.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const littledevilScraper = new AbstractScraper({
  workerData: { ...workerData },
  mainPage: {
    timeout: 45000,
    url: 'https://www.littledevil.nl/calendar/',
  },
  singlePage: {
    timeout: 15000,
  },
  app: {
    mainPage: {
      requiredProperties: ['venueEventUrl', 'title', 'start'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

littledevilScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
littledevilScraper.mainPageAsyncCheck = async function (event) {
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
    this.saveRefusedTitle(workingTitle);
    hasForbiddenTerms.success = false;
    return hasForbiddenTerms;
  }

  this.saveAllowedTitle(workingTitle);

  return {
    workingTitle,
    reason: 'Little devil is gewoon cool',
    event,
    success: true,
  };
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
// littledevilScraper.singlePageAsyncCheck = async function(event){
//   let workingTitle = this.cleanupEventTitle(event.title);

//   return {
//     workingTitle,
//     reason: 'temp',
//     event,
//     success: true
//   }
// }
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
littledevilScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    return await this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
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
          pageInfo: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
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
              remarks: `price berekening met ${s} ${res.pageInfo}`,
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

  rawEvents = rawEvents.map((event) => mapToStartDate(event, 'dag-maandNaam', this.months));
  rawEvents = rawEvents.map((event) => mapToStartTime(event));
  rawEvents = rawEvents.map(combineStartTimeStartDate);
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents);
  const thisWorkersEvents = rawEvents.filter(
    (eventEl, index) => index % workerData.workerCount === workerData.index,
  );
  return await this.mainPageEnd({ stopFunctie, page, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
littledevilScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const pageInfo = {
    title: event.title,
    errors: [],
    pageInfo: `<a class='page-info' href='${event.title}'>${workerData.family} single - ${event.title}</a>`,
  };

  const imageRes = await this.getImage({
    page,
    event,
    pageInfo,
    selectors: ['.wp-post-image '],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const longTextRes = await longTextSocialsIframes(page, event, pageInfo);
  for (const i in longTextRes) {
    pageInfo[i] = longTextRes[i];
  }

  return await this.singlePageEnd({
    pageInfo,
    stopFunctie,
    page,
    event,
  });
};
// #endregion                         SINGLE PAGE
