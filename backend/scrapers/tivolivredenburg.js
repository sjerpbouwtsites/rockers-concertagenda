/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/tivolivredenburg.js';
import { waitTime } from '../mods/tools.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const tivoliVredenburgScraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    waitUntil: 'load',
    url: 'https://www.tivolivredenburg.nl/agenda/?event_category=metal-punk-heavy',
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

tivoliVredenburgScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
tivoliVredenburgScraper.mainPageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);

  const isRefused = await this.rockRefuseListCheck(event, workingTitle);
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }

  const isAllowed = await this.rockAllowListCheck(event, workingTitle);
  if (isAllowed.success) {
    return isAllowed;
  }

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  if (hasForbiddenTerms.success) {
    this.saveRefusedTitle(workingTitle);
    hasForbiddenTerms.success = false;
    return hasForbiddenTerms;
  }

  const hasGoodTermsRes = await this.hasGoodTerms(event);
  if (hasGoodTermsRes.success) {
    this.saveAllowedTitle(workingTitle);
    return hasGoodTermsRes;
  }

  const isRockRes = await this.isRock(event, [workingTitle]);
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
tivoliVredenburgScraper.mainPage = async function () {
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
    ({ workerData, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll('.agenda-list-item')).map((eventEl) => {
        const title = eventEl.querySelector('.agenda-list-item__title')?.textContent.trim() ?? null;
        const res = {
          pageInfo: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title,
        };
        res.shortText = eventEl.querySelector('.agenda-list-item__text')?.textContent.trim() ?? '';

        res.venueEventUrl = eventEl.querySelector('.agenda-list-item__title-link').href;
        const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
        res.unavailable = !!eventEl.textContent.match(uaRex);
        res.soldOut =
          !!eventEl
            .querySelector('.agenda-list-item__label')
            ?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;
        return res;
      }),
    { workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms },
  );

  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents);
  const thisWorkersEvents = rawEvents.filter(
    (eventEl, index) => index % workerData.workerCount === workerData.index,
  );
  return await this.mainPageEnd({ stopFunctie, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
tivoliVredenburgScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const cookiesNodig = await page.evaluate(() => document.querySelector('#eagerly-tools-cookie'));

  if (cookiesNodig) {
    await page.evaluate(() => {
      const label = document.querySelector('.cookie-field:not(.disabled) label');
      const accept = document.querySelector('#cookie-accept');
      label.click();
      accept.click();
    });
    await waitTime(1500);
  }

  const pageInfo = await page.evaluate(
    ({ event }) => {
      const res = {
        pageInfo: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
        errors: [],
      };

      const startDateMatch = document.location.href.match(/\d\d-\d\d-\d\d\d\d/); //
      res.startDate = '';
      if (startDateMatch && startDateMatch.length) {
        res.startDate = startDateMatch[0].split('-').reverse().join('-');
      }

      if (!res.startDate || res.startDate.length < 7) {
        res.errors.push({
          remarks: `startdate mis ${res.pageInfo}`,
          toDebug: {
            text: `niet goed genoeg<br>${startDateMatch.join('; ')}<br>${res.startDate}`,
            res,
            event,
          },
        });
        return res;
      }
      const eventInfoDtDDText = document
        .querySelector('.event__info .description-list')
        ?.textContent.replace(/[\n\r\s]/g, '')
        .toLowerCase();
      res.startTime = null;
      res.openDoorTime = null;
      res.endTime = null;
      const openMatch = eventInfoDtDDText.match(/open.*(\d\d:\d\d)/);
      const startMatch = eventInfoDtDDText.match(/aanvang.*(\d\d:\d\d)/);
      const endMatch = eventInfoDtDDText.match(/einde.*(\d\d:\d\d)/);

      if (Array.isArray(openMatch) && openMatch.length > 1) {
        try {
          res.openDoorTime = openMatch[1];
          res.door = res.startDate ? `${res.startDate}T${res.openDoorTime}:00` : null;
        } catch (caughtError) {
          res.errors.push({
            error: caughtError,
            remarks: `Open door ${res.pageInfo}`,
            toDebug: {
              text: eventInfoDtDDText,
              event,
            },
          });
        }
      }
      if (Array.isArray(startMatch) && startMatch.length > 1) {
        try {
          res.startTime = startMatch[1];
          res.start = res.startDate ? `${res.startDate}T${res.startTime}:00` : null;
        } catch (caughtError) {
          res.errors.push({
            error: caughtError,
            remarks: `startTijd door ${res.pageInfo}`,
            toDebug: {
              matches: `${startMatch.join('')}`,
              event,
            },
          });
        }
      }
      if (Array.isArray(endMatch) && endMatch.length > 1) {
        try {
          res.endTime = endMatch[1];
          res.end = res.startDate ? `${res.startDate}T${res.endTime}:00` : null;
        } catch (caughtError) {
          res.errors.push({
            error: caughtError,
            remarks: `endtijd ${res.pageInfo}`,
            toDebug: {
              text: eventInfoDtDDText,
              event,
            },
          });
        }
      }

      return res;
    },
    { event },
  );

  const imageRes = await this.getImage({
    page,
    event,
    pageInfo,
    selectors: ['.img-container source:last-of-type'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.btn-group__price', '.event-cta'],
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