/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/dbs.js';
import getImage from './gedeeld/image.js';
import terms from './gedeeld/terms.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const dbsScraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 60045,
    waitUntil: 'domcontentloaded',
    url: 'https://www.dbstudio.nl/agenda/',
  },
  singlePage: {
    timeout: 45000,
  },
  app: {
    mainPage: {
      requiredProperties: ['venueEventUrl', 'title', 'start'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'price', 'start'],
      asyncCheckFuncs: ['allowed', 'event', 'refused', 'goodTerms', 'forbiddenTerms', 'saveAllowed'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

dbsScraper.listenToMasterThread();

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
dbsScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    return this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  await page.waitForSelector('.fusion-events-post');
  await this.waitTime(100);

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ months, workerData, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll('.fusion-events-post')).map((eventEl) => {
        let title = eventEl.querySelector('.fusion-events-meta .url')?.textContent.trim() ?? null;
        if (title.match(/sold\s?out|uitverkocht/i)) {
          title = title.replace(/\*?(sold\s?out|uitverkocht)\s?\*?\s?/i, '');
        }
        const res = {
          anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} - main - ${title}</a>`,
          errors: [],
          title,
        };

        const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
        res.unavailable = !!eventEl.textContent.match(uaRex);

        res.venueEventUrl = eventEl.querySelector('.fusion-events-meta .url')?.href ?? null;

        const startDateMatch =
          eventEl.querySelector('.tribe-event-date-start')?.textContent.match(/(\d+)\s+(\w+)/) ??
          null;
        if (startDateMatch) {
          res.day = startDateMatch[1];
          const monthName = startDateMatch[2];
          res.month = months[monthName];
          res.day = res.day.padStart(2, '0');
          const yearMatch = eventEl
            .querySelector('.tribe-event-date-start')
            ?.textContent.match(/\d{4}/);
          if (!yearMatch || !Array.isArray(yearMatch) || yearMatch.length < 1) {
            res.year = new Date().getFullYear();
          } else {
            res.year = yearMatch[1];
          }
          res.year = res.year || new Date().getFullYear();
          const timeMatch = eventEl
            .querySelector('.tribe-event-date-start')
            ?.textContent.match(/\d{1,2}:\d\d/);
          if (!timeMatch || !Array.isArray(timeMatch) || timeMatch.length < 1) {
            res.time = '12:00';
          } else {
            res.time = timeMatch[0].padStart(5, '0');
            res.startDate = `${res.year}-${res.month}-${res.day}`;
            res.start = `${res.startDate}T${res.time}:00`;
          }
        }

        try {
          const endDateEl = eventEl.querySelector('.tribe-event-time') ?? null;
          if (res.startDate && endDateEl) {
            if (endDateEl) {
              const endDateM = endDateEl.textContent.toLowerCase().match(/\d{1,2}:\d\d/);
              if (Array.isArray(endDateM) && endDateM.length > 0) {
                res.endTime = endDateM[0].padStart(5, '0');
                res.end = `${res.startDate}T${res.endTime}:00`;
                if (res.end === res.start) {
                  res.end = null;
                }
              }
            }
          }
        } catch (caughtError) {
          res.errors.push({
            error: caughtError,
            remarks: `Wirwar datums e.d. ${title}`,
            toDebug: res,
          });
        }

        return res;
      }),
    { months: this.months, workerData, unavailabiltyTerms: terms.unavailability },
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
  
  return this.mainPageEnd({ stopFunctie, page, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
dbsScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const pageInfo = await page.evaluate(
    () => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${document.title}</a>`,
        errors: [],
      };

      res.shortText =
        document
          .querySelector('.tribe-events-event-categories')
          ?.textContent.toLowerCase()
          .replace('concert, ', '')
          .replace('concert', '')
          .trim() ?? '';
      res.ticketURL = document.querySelector('.tribe-events-event-url a')?.href ?? null;
      if (!res.ticketURL) {
        res.price = '0';
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
    selectors: ['.tribe-events-event-image .wp-post-image'],
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

  if (pageInfo.ticketURL && !pageInfo.unavailable) {
    if (this.debugPrice) this.dirtyTalk(`gaan naar url ${pageInfo.ticketURL}`);
    try {
      await page.goto(pageInfo.ticketURL);
      const html = await page
        .evaluate(() => document.querySelector('body').innerHTML)
        .catch((err) => {
          this.dirtyDebug({
            title: 'error ticketURL',
            err,
          });
        });

      const price =
        Number(
          html
            .match(/€\d{1,3}[,.]\d\d/)[0]
            .replace(/€/, '')
            .replace(/[,.]/, ''),
        ) / 100;
      pageInfo.price = price;
    } catch (caughtError) {
      // er is gewoon geen prijs beschikbaar.
      this.dirtyDebug({
        title: 'error ticketURL',
        caughtError,
      });
    }
  }

  return this.singlePageEnd({
    pageInfo,
    stopFunctie,
    page,
    event,
  });
};
// #endregion                         SINGLE PAGE
