/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/dynamo.js';
import getImage from './gedeeld/image.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const dynamoScraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 35060,
    url: 'https://www.dynamo-eindhoven.nl/programma/?_sfm_fw%3Aopt%3Astyle=15',
  },
  singlePage: {
    timeout: 25061,
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

dynamoScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
dynamoScraper.mainPageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);

  const isRefused = await this.rockRefuseListCheck(event, workingTitle);
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }

  return {
    event,
    workingTitle,
    reason: isRefused.reason,
    success: true,
  };
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
dynamoScraper.singlePageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);

  const isAllowed = await this.rockAllowListCheck(event, workingTitle);
  if (isAllowed.success) return isAllowed;

  const hasGoodTermsRes = await this.hasGoodTerms(event);
  if (hasGoodTermsRes.success) {
    this.saveAllowedTitle(workingTitle);
    return hasGoodTermsRes;
  }
  const hasForbiddenTermsRes = await this.hasForbiddenTerms(event);
  if (hasForbiddenTermsRes.success) {
    this.saveRefusedTitle(workingTitle);
    hasForbiddenTermsRes.success = false;
    return hasForbiddenTermsRes;
  }

  const isRockRes = await this.isRock(event, [workingTitle]);
  if (isRockRes.success) {
    this.saveAllowedTitle(workingTitle);
    return isRockRes;
  }
  this.saveRefusedTitle(workingTitle);

  return {
    event,
    workingTitle,
    reason: isRockRes.reason,
    success: false,
  };
};
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
dynamoScraper.mainPage = async function () {
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
      Array.from(document.querySelectorAll('.search-filter-results .timeline-article')).map(
        (baseEvent) => {
          const title = baseEvent.querySelector('h4')?.textContent ?? '';
          const res = {
            anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
            title,
          };

          res.venueEventUrl = baseEvent.querySelector('a')?.href ?? '';
          if (res.venueEventUrl.includes('metalfest')) {
            res.corrupted = `is metalfest`;
          }

          const timelineInfoContainerEl = baseEvent.querySelector('.timeline-info-container');
          res.shortText = timelineInfoContainerEl?.querySelector('p')?.textContent ?? '';

          res.soldOut = !!(baseEvent.querySelector('.sold-out') ?? null);
          return res;
        },
      ),
    { workerData },
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
dynamoScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const pageInfo = await page.evaluate(
    ({ months, event }) => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${document.title}</a>`,
        errors: [],
      };
      const agendaDatesEls = document.querySelectorAll('.agenda-date');
      let baseDate = null;
      if (agendaDatesEls && agendaDatesEls.length < 2) {
        if (document.location.href.includes('effenaar')) {
          res.corrupted = `Dynamo mixed venue with ${event.venueEventUrl}`;
          return res;
        }

        res.errors.push({
          remarks: `Te weinig 'agendaDataEls' ${res.anker}`,
          toDebug: {
            event,
            agendaDatesEls,
          },
        });
        res.corrupted = "Te weinig 'agendaDataEls'";
      }
      try {
        const dateMatch = document
          .querySelector('.event-content')
          ?.textContent.toLowerCase()
          .match(/(\d+)\s+\/\s+(\w+)\s+\/\s+(\d+)/);
        if (Array.isArray(dateMatch) && dateMatch.length === 4) {
          baseDate = `${dateMatch[3]}-${months[dateMatch[2]]}-${dateMatch[1]}`;
        }
        if (!baseDate) {
          throw Error('geen base date');
        }
      } catch (caughtError) {
        res.errors.push({
          error: caughtError,
          remarks: `datum match faal ${res.anker}`,
          toDebug: event,
        });
        return res;
      }

      if (agendaDatesEls) {
        const agendaTimeContext = agendaDatesEls[0].textContent.toLowerCase();
        res.startTimeMatch = agendaTimeContext.match(
          /(aanvang\sshow|aanvang|start\sshow|show)\W?\s+(\d\d:\d\d)/,
        );
        res.doorTimeMatch = agendaTimeContext.match(/(doors|deuren|zaal\sopen)\W?\s+(\d\d:\d\d)/);
        res.endTimeMatch = agendaTimeContext.match(/(end|eind|einde|curfew)\W?\s+(\d\d:\d\d)/);
      }

      try {
        if (Array.isArray(res.doorTimeMatch) && res.doorTimeMatch.length === 3) {
          res.door = `${baseDate}T${res.doorTimeMatch[2]}:00`;
        }
        if (Array.isArray(res.startTimeMatch) && res.startTimeMatch.length === 3) {
          res.start = `${baseDate}T${res.startTimeMatch[2]}:00`;
        } else if (res.door) {
          res.start = res.door;
          res.door = '';
        }
        if (Array.isArray(res.endTimeMatch) && res.endTimeMatch.length === 3) {
          res.end = `${baseDate}T${res.endTimeMatch[2]}:00`;
        }
      } catch (caughtError) {
        res.errors.push({
          error: caughtError,
          remarks: `tijd matches samen met tijden voegen ${res.anker}`,
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
    selectors: ['.dynamic-background-color#intro .color-pick'],
    mode: 'background-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.agenda-date'],
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
