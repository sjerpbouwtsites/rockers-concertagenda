/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/volt.js';
import getImage from './gedeeld/image.js';
import terms from './gedeeld/terms.js';

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    waitUntil: 'load',
    url: 'https://www.poppodium-volt.nl/programma?f%5B0%5D=activity_itix_genres%3A9&f%5B1%5D=activity_itix_genres%3A30',
  },
  app: {
    mainPage: {
      requiredProperties: ['venueEventUrl', 'title'],
      asyncCheckFuncs: ['allowed', 'event', 'refused', 'forbiddenTerms', 'emptySuccess'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'price', 'start'],
      asyncCheckFuncs: ['forbiddenTerms', 'saveAllowed', 'emptySuccess'],
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

  try {
    await page.waitForSelector('.card-activity', {
      timeout: 1250,
    });
  } catch (error) {
    const noShows = await page.evaluate(() => document.querySelector('.view-empty')?.textContent ?? null);
    if (noShows) {
      this.saveBaseEventlist(workerData.family, []);
      return this.mainPageEnd({ stopFunctie, rawEvents: [] });
    } 
    this.handleError(error, 'Volt wacht op laden eventlijst', 'close-thread', null);
  }

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll('.card-activity'))
        // .filter((rawEvent) => {
        //   const hasGenreName =
        //     rawEvent
        //       .querySelector(".card-activity-list-badge-wrapper")
        //       ?.textContent.toLowerCase()
        //       .trim() ?? "";
        //   return hasGenreName.includes("metal") || hasGenreName.includes("punk");
        // })
        .map((rawEvent) => {
          const anchor = rawEvent.querySelector('.card-activity__title a') ?? null;
          const title = anchor?.textContent.trim() ?? '';
          const res = {
            anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
            title,
          };
          res.venueEventUrl = anchor.hasAttribute('href') ? anchor.href : null;
          res.shortText =
            rawEvent.querySelector('.card-activity__image-badges')?.textContent ?? null;

          const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
          res.unavailable = !!rawEvent.textContent.match(uaRex);
          res.soldOut = rawEvent?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;
          return res;
        }),
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

// #region       SINGLE PAGE
scraper.singlePage = async function ({ page, url, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const cookiesNodig = await page.evaluate(() =>
    document.querySelector('.cookiesjsr-btn.allowAll'),
  );

  if (cookiesNodig) {
    await page.evaluate(() => {
      document.querySelector('.cookiesjsr-btn.allowAll').click();
    });
    await this.waitTime(1500);
  }

  const pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ months, event, url }) => {
      const res = {};
      res.title = event.title;
      res.unavailable = event.unavailable;
      res.anker = `<a class='page-info' class='page-info' href='${url}'>${event.title}</a>`;
      res.errors = [];

      const startDateMatch = document
        .querySelector('.field--name-field-date')
        ?.textContent.match(/(\d+)\s?(\w+)\s?(\d\d\d\d)/);
      if (Array.isArray(startDateMatch) && startDateMatch.length > 2) {
        const dag = startDateMatch[1].padStart(2, '0');
        const maandNaam = startDateMatch[2];
        const maand = months[maandNaam];
        const jaar = startDateMatch[3];
        res.startDate = `${jaar}-${maand}-${dag}`;
      } else {
        res.startDate = null;
      }

      const eersteTijdRij = document.querySelector('.activity-info-row');
      const tweedeTijdRij = document.querySelector('.activity-info-row + .activity-info-row');
      if (!eersteTijdRij && !tweedeTijdRij) {
        res.errors.push({
          error: new Error('geen tijdrijen'),
        });
        return res;
      }

      const startTimeM = eersteTijdRij.textContent.match(/\d\d\s?:\s?\d\d/);
      const endTimeM = tweedeTijdRij?.textContent.match(/\d\d\s?:\s?\d\d/) ?? null;
      if (!Array.isArray(startTimeM)) {
        res.errors.push({
          error: new Error('geen tijdmatch success'),
          toDebug: eersteTijdRij.textContent,
        });
        return res;
      }
      res.startTime = startTimeM[0].replaceAll(/\s/g, '');
      if (Array.isArray(endTimeM)) {
        res.endTime = endTimeM[0].replaceAll(/\s/g, '');
      }

      try {
        if (res.startTime) {
          res.start = `${res.startDate}T${res.startTime}:00`;
        }

        if (res.endTime) {
          res.end = `${res.startDate}T${res.endTime}:00`;
        }
      } catch (error) {
        res.errors.push({
          error,
          remarks: `ongeldige tijden ${res.anker}`,
        });
        return res;
      }

      return res;
    },
    { months: this.months, url, event },
  );

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: ['.image-container img'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.activity-price'],
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
