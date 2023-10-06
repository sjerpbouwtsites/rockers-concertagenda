/* eslint-disable import/no-extraneous-dependencies */
/* global document */
import { workerData } from 'worker_threads';
import axios from 'axios';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/deflux.js';
import getImage from './gedeeld/image.js';
import * as _t from '../mods/tools.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const vandaag = new Date().toISOString().split('T')[0];
const defluxScraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 50008,
    url: `https://www.podiumdeflux.nl/wp-json/wp/v2/ajde_events?event_type=81,87,78,88,80&filter[startdate]=${vandaag}`,
  },
  singlePage: {
    timeout: 20009,
  },
  app: {
    mainPage: {
      useCustomScraper: true,
      requiredProperties: ['venueEventUrl', 'title'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'price', 'start'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

defluxScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
defluxScraper.mainPageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);

  const isRefused = await this.rockRefuseListCheck(event, workingTitle);
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }

  const isAllowed = await this.rockAllowListCheck(event, workingTitle);
  if (isAllowed.success) return isAllowed;

  const goodTermsRes = await this.hasGoodTerms(event);
  if (goodTermsRes.success) {
    this.saveAllowedTitle(workingTitle);
    return goodTermsRes;
  }

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  if (hasForbiddenTerms.success) {
    this.saveRefusedTitle(workingTitle);
    hasForbiddenTerms.success = false;
    return hasForbiddenTerms;
  }

  this.saveAllowedTitle(workingTitle);

  return {
    workingTitle,
    event,
    success: true,
    reason: [isRefused.reason, isAllowed.reason, hasForbiddenTerms.reason].join(';'),
  };
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
defluxScraper.singlePageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);

  const isAllowed = await this.rockAllowListCheck(event, workingTitle);
  if (isAllowed.success) {
    return isAllowed;
  }

  return {
    workingTitle,
    event,
    success: true,
    reason: 'weird one',
  };
};
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
defluxScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    return this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
  }

  const { stopFunctie } = await this.mainPageStart();

  const axiosRes = await axios // TODO naar fetch
    .get(this._s.mainPage.url)
    .then((response) => response.data)
    .catch((caughtError) => {
      // TODO WRAPPEN
      _t.handleError(caughtError, workerData, 'main axios fail', 'close-thread', null);
    });
  if (!axiosRes) return false;
  const rawEvents = axiosRes
    .map((axiosResultSingle) => {
      let title = axiosResultSingle.title.rendered;
      const res = {
        pageInfo: `<a class='pageinfo' href="${this._s.mainPage.url}">${workerData.family} main - ${title}</a>`,
        errors: [],
        venueEventUrl: axiosResultSingle.link,
        id: axiosResultSingle.id,
      };
      res.soldOut = title.match(/uitverkocht|sold\s?out/i) ?? false;
      if (title.match(/uitverkocht|sold\s?out/i)) {
        title = title.replace(/uitverkocht|sold\s?out/i, '').replace(/^:\s+/, '');
      }
      res.title = title;
      return res;
    })
    .map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents);
  const thisWorkersEvents = rawEvents.filter(
    (eventEl, index) => index % workerData.workerCount === workerData.index,
  );
  return this.mainPageEnd({ stopFunctie, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
defluxScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const pageInfo = await page.evaluate(
    () => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${document.title}</a>`,
        errors: [],
      };

      const eventScheme = document.querySelector('.evo_event_schema');
      if (!eventScheme) {
        res.errors.push({ remarks: `geen event scheme gevonden ${res.anker}`, toDebug: res });
        return res;
      }

      try {
        res.startDate = eventScheme
          .querySelector('[itemprop="startDate"]')
          ?.getAttribute('content')
          .split('T')[0]
          .split('-')
          .map((dateStuk) => dateStuk.padStart(2, '0'))
          .join('-');
        res.startTime = document
          .querySelector('.evcal_time.evo_tz_time')
          .textContent.match(/\d\d:\d\d/)[0];
        res.start = `${res.startDate}T${res.startTime}:00`;
      } catch (caughtError) {
        res.errors.push({ error: caughtError, remarks: `starttime match ${res.anker}` });
      }

      if (
        document.querySelector('.evcal_desc3')?.textContent.toLowerCase().includes('deur open') ??
        false
      ) {
        try {
          res.endTime = document.querySelector('.evcal_desc3').textContent.match(/\d\d:\d\d/)[0];
          res.end = `${res.startDate}T${res.endTime}:00`;
        } catch (caughtError) {
          res.errors.push({
            error: caughtError,
            remarks: `door open starttime match ${res.anker}`,
            toDebug: res,
          });
        }
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
    selectors: ['.evo_event_main_img', '.event_description img'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.evcal_desc3', '.desc_trig_outter'],
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

  return this.singlePageEnd({ pageInfo, stopFunctie });
};
// #endregion                         SINGLE PAGE
