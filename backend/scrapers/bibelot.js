/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/bibelot.js';
import getImage from './gedeeld/image.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const bibelotScraper = new AbstractScraper({
  workerData: { ...workerData },
  mainPage: {
    timeout: 15002,
    requiredProperties: ['venueEventUrl', 'title'],
    url: 'https://bibelot.net/',
  },
  singlePage: {
    timeout: 20003,
  },
  app: {
    mainPage: {},
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'start'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

bibelotScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
bibelotScraper.mainPageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);
  const isRefused = await this.rockRefuseListCheck(event, workingTitle);
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }

  const isAllowed = await this.rockAllowListCheck(event, workingTitle);
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTermsRes = await bibelotScraper.hasForbiddenTerms(event);
  if (hasForbiddenTermsRes.success) {
    hasForbiddenTermsRes.success = false;
    this.saveRefusedTitle(workingTitle);
    return hasForbiddenTermsRes;
  }

  this.saveAllowedTitle(workingTitle);

  return {
    workingTitle,
    event,
    reason: hasForbiddenTermsRes.reason,
    success: !hasForbiddenTermsRes.success,
  };
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
bibelotScraper.mainPage = async function () {
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
      Array.from(
        document.querySelectorAll(
          '.event[class*="metal"], .event[class*="punk"], .event[class*="rock"]',
        ),
      ).map((eventEl) => {
        const title = eventEl.querySelector('h1')?.textContent.trim() ?? null;
        const res = {
          pageInfo: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title,
        };

        const shortTextEl = eventEl.querySelector('h1')?.parentNode;
        const shortTextSplit = eventEl.contains(shortTextEl)
          ? shortTextEl.textContent.split(res.title)
          : [null, null];
        res.shortText = shortTextSplit[1];
        res.venueEventUrl = eventEl.querySelector('.link')?.href ?? null;
        res.soldOut =
          !!eventEl.querySelector('.ticket-button')?.textContent.match(/uitverkocht|sold\s?out/i) ??
          null;
        return res;
      }),
    { workerData },
  );
  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents);
  const thisWorkersEvents = rawEvents.filter(
    (eventEl, index) => index % workerData.workerCount === workerData.index,
  );
  return await this.mainPageEnd({ stopFunctie, page, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
bibelotScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart(event);

  const pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ months, event }) => {
      const res = {
        pageInfo: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };

      const baseDateM =
        document.querySelector('.main-column h3')?.textContent.match(/(\d+)\s(\w+)\s(\d{4})/) ??
        null;

      res.baseDate = null;
      if (!Array.isArray(baseDateM) || baseDateM.length < 4) {
        return res;
      }
      res.baseDate = `${baseDateM[3]}-${months[baseDateM[2]]}-${baseDateM[1].padStart(2, '0')}`;

      res.eventMetaColomText = document.querySelector('.meta-colom')?.textContent.toLowerCase();

      res.startTimeMatch = res.eventMetaColomText.match(
        /(aanvang\sshow|aanvang|start\sshow|show)\W?\s+(\d\d:\d\d)/,
      );
      res.doorTimeMatch = res.eventMetaColomText.match(
        /(doors|deuren|zaal\sopen)\W?\s+(\d\d:\d\d)/,
      );
      res.endTimeMatch = res.eventMetaColomText.match(/(end|eind|einde|curfew)\W?\s+(\d\d:\d\d)/);

      try {
        if (Array.isArray(res.doorTimeMatch) && res.doorTimeMatch.length > 2 && res.baseDate) {
          res.door = `${res.baseDate}T${res.doorTimeMatch[2]}:00`;
        }
      } catch (errorCaught) {
        res.errors.push({
          error: errorCaught,
          remarks: `doortime match met basedate ${res.pageInfo}`,
          toDebug: res,
        });
      }
      try {
        if (Array.isArray(res.startTimeMatch) && res.startTimeMatch.length > 2 && res.baseDate) {
          res.start = `${res.baseDate}T${res.startTimeMatch[2]}:00`;
        } else if (res.door) {
          res.start = res.door;
          res.door = '';
        }
      } catch (errorCaught) {
        res.errors.push({
          error: errorCaught,
          remarks: `startTime match met basedate ${res.pageInfo}`,
          toDebug: res,
        });
      }
      try {
        if (Array.isArray(res.endTimeMatch) && res.endTimeMatch.length > 2 && res.baseDate) {
          res.end = `${res.baseDate}T${res.endTimeMatch[2]}:00`;
        }
      } catch (errorCaught) {
        res.errors.push({
          error: errorCaught,
          remarks: `endtime match met basedate ${res.pageInfo}`,
          toDebug: res,
        });
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
    selectors: ['.achtergrond-afbeelding'],
    mode: 'background-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.meta-colom'],
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

  return await this.singlePageEnd({
    pageInfo,
    stopFunctie,
    page,
    event,
  });
};
// #endregion                         SINGLE PAGE
