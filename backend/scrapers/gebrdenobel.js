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
      asyncCheckFuncs: ['allowed', 'event', 'refused', 'emptySuccess'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'price', 'start'],
      asyncCheckFuncs: ['custom1', 'forbiddenTerms', 'saveAllowed', 'emptySuccess'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

scraper.listenToMasterThread();

scraper.asyncCustomCheck1 = async function (event, reasons) {
  const reasonsCopy = Array.isArray(reasons) ? reasons : [];
  if (event.title.toLowerCase().includes("nep event")) {
    reasonsCopy.push("NEP EVENT");
    return {
      event,
      reason: reasonsCopy.reverse().join(','),
      reasons:reasonsCopy,
      success: false,
      break: true,
    };        
  }
  return {
    break: false,
    success: null,
    event,
    reasons: reasonsCopy,
  };  
};

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

  await this.waitTime(50);
  await page.waitForSelector('[data-genre="heavy"]');
  await page.evaluate(() => {
    document.querySelector('[data-genre="heavy"]').click();
  });
  await this.waitTime(100);

  await page.evaluate(() => {
    document.querySelectorAll('.events').forEach((event) => {
      if (!event.classList.contains('hidden')) {
        event.classList.add('zichtbaar-dus');
      }
    });
  });

  let punkMetalRockRawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll('.zichtbaar-dus .event-item'))
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

  this.dirtyDebug(punkMetalRockRawEvents);

  punkMetalRockRawEvents = punkMetalRockRawEvents.map(this.isMusicEventCorruptedMapper);

  this.dirtyDebug(punkMetalRockRawEvents);

  const rawEvents = punkMetalRockRawEvents;

  // gebr de nobel cookies moet eerste laaten mislukken
  // const eersteCookieEvent = { ...rawEvents[0] };
  // eersteCookieEvent.title = `NEP EVENT VOOR COOKIES`;

  // rawEvents.unshift(eersteCookieEvent);

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

  await page.evaluate(() => {
    document.querySelectorAll('.event-table tr').forEach((row) => {
      if (row.textContent.includes('€')) row.classList.add('rij-heeft-prijs');
    });
  });

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.gebrdenobel-price-manual', '.rij-heeft-prijs', '.event-table'],
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
