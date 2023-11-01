/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/doornroosje.js';
import getImage from './gedeeld/image.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const doornroosjeScraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 60000,
    url: 'https://www.doornroosje.nl/?genre=metal%252Cpunk%252Cpost-hardcore%252Chardcore%252Cnoise-rock',
    waitUntil: 'load',
  },
  singlePage: {
    timeout: 35000,
  },
  app: {
    mainPage: {
      requiredProperties: ['venueEventUrl', 'title'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'start'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

doornroosjeScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
doornroosjeScraper.mainPageAsyncCheck = async function (event) {
  const isRefusedFull = await this.rockRefuseListCheck(event, event.title.toLowerCase());
  if (isRefusedFull.success) {
    isRefusedFull.success = false;
    return isRefusedFull;
  }

  const workingTitle = this.cleanupEventTitle(event.title);
  const isRefused = await this.rockRefuseListCheck(event, workingTitle);
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }

  return {
    workingTitle,
    reason: [isRefusedFull.reason, isRefused.reason].join(';'),
    event,
    success: true,
  };
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
doornroosjeScraper.singlePageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);
  const isAllowed = await this.rockAllowListCheck(event, workingTitle);
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTerms = await this.hasForbiddenTerms(event, [
    'longTextHTML',
    'shortText',
    'title',
  ]);
  if (hasForbiddenTerms.success) {
    this.saveRefusedTitle(workingTitle);
    hasForbiddenTerms.success = false;
    return hasForbiddenTerms;
  }

  this.saveAllowedTitle(workingTitle);

  return {
    workingTitle,
    reason: [hasForbiddenTerms.reason].join(';'),
    event,
    success: true,
  };
};
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
doornroosjeScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    return this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  await page.waitForSelector('.c-program__title');
  await this.waitTime(50);

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData, months }) =>
      Array.from(document.querySelectorAll('.c-program__item')).map((eventEl) => {
        const title =
          eventEl.querySelector('.c-program__title')?.textContent.trim() ??
          eventEl.querySelector('h1,h2,h3')?.textContent.trim() ??
          null;
        const res = {
          anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} - main - ${title}</a>`,
          errors: [],
          title,
        };
        res.shortText =
          eventEl
            .querySelector('.c-program__content')
            ?.textContent.trim()
            .replace(res.title, '')
            .replace(/\s{2, 500}/g) ?? '';
        res.venueEventUrl = eventEl?.href;
        res.soldOut = !!eventEl?.innerHTML.match(/uitverkocht|sold\s?out/i) ?? false;
        const startJaarMatch =
          eventEl.parentNode.parentNode
            .querySelector('.c-program__month')
            ?.textContent.match(/\d\d\d\d/) ?? null;
        const jaar =
          Array.isArray(startJaarMatch) && startJaarMatch.length
            ? startJaarMatch[0]
            : new Date().getFullYear();
        const maandNaam =
          eventEl.parentNode.parentNode
            .querySelector('.c-program__month')
            ?.textContent.match(/\w*/) ?? null;
        const maand = months[maandNaam];
        const dagMatch = eventEl.querySelector('.c-program__date')?.textContent.match(/\d+/);
        let dag;
        if (dagMatch && Array.isArray(dagMatch) && dagMatch.length) {
          dag = dagMatch[0].padStart(2, '0');
        }
        if (dag && maand && jaar) {
          res.startDate = `${jaar}-${maand}-${dag}`;
        } else {
          res.startDate = null;
        }
        return res;
      }),
    { workerData, months: this.months },
  );

  try {
    let lastWorkingEventDate = null;
    rawEvents.forEach((rawEvent) => {
      if (rawEvent.startDate) {
        lastWorkingEventDate = rawEvent.startDate;
      } else {
        // eslint-disable-next-line no-param-reassign
        rawEvent.startDate = lastWorkingEventDate;
      }
      return rawEvent;
    });
  } catch (dateMapError) {
    this.handleError(dateMapError, 'startDate rawEvents mapper');
  }

  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents);
  const thisWorkersEvents = rawEvents.filter(
    (eventEl, index) => index % workerData.workerCount === workerData.index,
  );
  return this.mainPageEnd({ stopFunctie, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
doornroosjeScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  let pageInfo;
  if (!event.venueEventUrl.includes('soulcrusher') && !event.venueEventUrl.includes('festival')) {
    pageInfo = await page.evaluate(
      // eslint-disable-next-line no-shadow
      ({ months, event }) => {
        const res = {
          anker: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
          errors: [],
        };

        // genre verwijderen en naar shorttext
        res.shortText =
          (event?.shortText ? event.shortText : '') +
          Array.from(document.querySelectorAll('.c-event-row__title'))
            .map((title) => {
              if (title.textContent.includes('genre')) {
                const row = title.parentNode.parentNode;
                return row.querySelector('.c-event-row__content')?.textContent.toLowerCase().trim();
              }
              return null;
            })
            .filter((a) => a)
            .join('');

        const startDateRauwMatch = document
          .querySelector('.c-event-data')
          ?.innerHTML.match(
            /(\d{1,2})\s*(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s*(\d{4})/,
          ); // welke mongool schrijft zo'n regex
        let startDate = event.startDate || null;
        if (!startDate && startDateRauwMatch && startDateRauwMatch.length) {
          const day = startDateRauwMatch[1];
          const month = months[startDateRauwMatch[2]];
          const year = startDateRauwMatch[3];
          startDate = `${year}-${month}-${day}`;
        } else if (!startDate) {
          res.errors.push({
            error: new Error(`Geen startdate ${res.anker}`),
            toDebug: {
              text: document.querySelector('.c-event-data')?.innerHTML,
            },
          });
          return res;
        }

        if (startDate) {
          let timeMatches = document.querySelector('.c-event-data').innerHTML.match(/\d\d:\d\d/g);

          if (!timeMatches) {
            timeMatches = ['12:00:00'];
          }

          if (timeMatches && timeMatches.length) {
            try {
              if (timeMatches.length === 3) {
                res.start = `${startDate}T${timeMatches[1]}:00.000`;
                res.door = `${startDate}T${timeMatches[0]}:00.000`;
                res.end = `${startDate}T${timeMatches[2]}:00.000`;
              } else if (timeMatches.length === 2) {
                res.start = `${startDate}T${timeMatches[1]}:00.000`;
                res.door = `${startDate}T${timeMatches[0]}:00.000`;
              } else if (timeMatches.length === 1) {
                res.start = `${startDate}T${timeMatches[0]}:00.000`;
              }
            } catch (caughtError) {
              res.errors.push({
                error: caughtError,
                remarks: `fout bij tijd of datums. matches: ${timeMatches} datum: ${startDate} ${res.anker}`,
              });
              return res;
            }
          }
        }

        return res;
      },
      { months: this.months, event },
    );
  } else {
    // dus festival
    pageInfo = await page.evaluate(
      // eslint-disable-next-line no-shadow
      ({ event }) => {
        const res = {
          anker: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
          errors: [],
        };
        if (event.venueEventUrl.includes('soulcrusher')) {
          res.start = '2023-10-13T18:00:00.000';
        } else {
          try {
            res.start = `${event?.startDate}T12:00:00`;
          } catch (thisError) {
            res.errors.push({
              error: new Error('fout bij tijd/datum festival of datums'),
            });
            return res;
          }
        }

        res.priceTextcontent =
          document.querySelector('.b-festival-content__container')?.textContent.trim() ?? '';

        res.textForHTML =
          (document.querySelector('.b-festival-content__container')?.innerHTML ?? '') +
          (document.querySelector('.b-festival-line-up__grid')?.innerHTML ?? '');
        res.mediaForHTML = Array.from(document.querySelectorAll('.c-embed iframe')).map(
          (embed) => embed.outerHTML,
        );
        res.socialsForHTML = [];

        if (document.querySelector('.b-festival-line-up__title')) {
          const lineupRedux = Array.from(document.querySelectorAll('.b-festival-line-up__title'))
            .map((title) => title.textContent)
            .join(', ');
          res.shortText += ` Met oa: ${lineupRedux}`;
        }

        return res;
      },
      { event },
    );
  }

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: ['.c-header-event__image img', '#home img'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.c-btn__price', '.c-intro__col'],
  });
  const uitverkocht = await page.evaluate(() => !!document.querySelector('.c-sold-out__title'));
  
  if (priceRes.errors.length && !uitverkocht) {
    pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
    pageInfo.price = priceRes.price;
  } else {
    pageInfo.price = null;
    pageInfo.soldOut = true;
  }

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
