/* global document */
import { workerData } from 'worker_threads';
import longTextSocialsIframes from './longtext/afaslive.js';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import getImage from './gedeeld/image.js';
import {
  mapToStartTime,
  combineDoorTimeStartDate,
  mapToStartDate,
  mapToDoorTime,
  combineStartTimeStartDate,
} from './gedeeld/datums.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },
  mainPage: {
    timeout: 120043,
    url: 'https://www.afaslive.nl/agenda',
  },
  singlePage: {
    timeout: 20000,
  },
  app: {
    mainPage: {
      requiredProperties: ['venueEventUrl'],
      asyncCheckFuncs: ['allowed', 'event', 'refused', 'forbiddenTerms', 'isRock', 'saveRefused'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'start'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

scraper.listenToMasterThread();
 
// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
scraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    return this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  await this.autoScroll(page);
  await this.waitTime(750);
  await this.autoScroll(page);
  await this.waitTime(750);
  await this.autoScroll(page);
  await this.waitTime(750);
  await this.autoScroll(page);
  await this.waitTime(750);
  await this.autoScroll(page);
  await this.waitTime(750);

  // TODO hier wat aan doen. maak er een do while van met een timeout. dit is waardeloos.
  await this.autoScroll(page);

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData }) =>
      Array.from(document.querySelectorAll('.agenda__item__block '))
        .map((agendaBlock) => {
          const title = agendaBlock.querySelector('.eventTitle')?.textContent ?? '';
          const res = {
            anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
            title,
          };
          res.venueEventUrl = agendaBlock.querySelector('a')?.href ?? null;
          res.soldOut = !!agendaBlock?.innerHTML.match(/uitverkocht|sold\s?out/i) ?? false;
          return res;
        })
        .filter((event) => !event.title.toLowerCase().includes('productiedag')),
    { workerData },
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
scraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  await this.waitTime(250);

  let pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ event }) => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };

      res.mapToStartTime =
        document
          .querySelector('.eventInfo, .timetable')
          ?.textContent.replaceAll(/\s/g, ' ')
          .replace(/\s+/g, ' ')
          .match(/aanvang:.*\d\d:\d\d/i) ?? null;
      res.mapToDoorTime =
        document
          .querySelector('.eventInfo, .timetable')
          ?.textContent.replaceAll(/\s/g, ' ')
          .replace(/\s+/g, ' ')
          .match(/deuren open:.*\d\d:\d\d/i) ?? null;
      res.mapToStartDate = document.querySelector('.eventInfo time, .timetable time')?.textContent;

      res.soldOut = !!(document.querySelector('#tickets .soldout') ?? null);

      document.querySelectorAll('article .wysiwyg p').forEach((paragraph) => {
        const anker = paragraph.querySelector('a') ?? null;
        if (!anker) return;
        if (anker.href.includes('eten-drinken') || anker.href.includes('Tassenbeleid')) {
          // eslint-disable-next-line no-param-reassign
          paragraph.innerHTML = '';
        }
      });

      return res;
    },
    { event },
  );

  pageInfo = mapToStartTime(pageInfo);
  pageInfo = mapToDoorTime(pageInfo);
  pageInfo = mapToStartDate(pageInfo, 'dag-maandNaam-jaar', this.months);
  pageInfo = combineStartTimeStartDate(pageInfo);
  pageInfo = combineDoorTimeStartDate(pageInfo);

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: ['.leftCol figure img'],
    mode: 'image-src',
  });

  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.jspPane', '#tickets'],
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
