/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/013.js';
import { mapToStart, mapToDoor, mapToShortDate } from './gedeeld/datums.js';
import getImage from './gedeeld/image.js';
import terms from '../artist-db/store/terms.js';
import workTitleAndSlug from './gedeeld/slug.js';

// #region        SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },
  mainPage: {
    url: 'https://www.013.nl/programma/heavy',
  },
  app: {
    harvest: {
      dividers: [`+`, '&'],
      dividerRex: "[\\+&]", // todo nog niet duidelijk 24/2/12
      artistsIn: ['title'],
    },
    mainPage: {
      requiredProperties: ['slug', 'venueEventUrl', 'title'],
      asyncCheckFuncs: ['allowedEvent', 'refused', 'forbiddenTerms'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'price', 'start'],
      asyncCheckFuncs: [],
      //      asyncCheckFuncs: ['saveAllowedEvent', 'harvestArtists'],
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
    ({ workerData, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll('#skewEl article')).map((eventEl) => {
        const title = eventEl.querySelector('h2')?.textContent.trim() ?? null;

        const res = {
          anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title,
        };

        res.venueEventUrl = eventEl.querySelector('a')?.href ?? null;

        res.mapToStart =
          eventEl.querySelector('time')?.getAttribute('datetime') ?? '';
        const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
        res.unavailable = !!eventEl.textContent.match(uaRex);
        res.soldOut = !!eventEl?.innerHTML.match(/uitverkocht|sold\s?out/i) ?? false;
        res.shortText =
          eventEl.querySelector('h3')?.textContent.trim() ?? '';

        return res;
      }),
    { workerData, unavailabiltyTerms: terms.unavailability },
  );

  rawEvents = rawEvents
    // .filter((e, i) => i >= 10 && i < 15)
    .map(mapToStart)
    .map(mapToShortDate)
    .map(workTitleAndSlug)
    .map(this.isMusicEventCorruptedMapper);

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

// #region      SINGLE PAGE
scraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  let pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ event }) => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };

      document.querySelectorAll('.side_wrapper time').forEach((timeEl, index) => {
        const j = index + 1;
        // eslint-disable-next-line no-param-reassign
        timeEl.id = `time-el-${j}`;
      });

      res.mapToDoor =
        document.querySelector('#time-el-2')?.getAttribute('datetime') ??
        '';

      return res;
    },
    { event },
  );

  pageInfo = mapToDoor(pageInfo);

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: ["[x-ref='event_image'] img"],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.price_table'],
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

// #region      LONG HTML

// #endregion                        LONG HTML
