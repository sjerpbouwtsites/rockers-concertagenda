/* global document */
import { workerData } from 'worker_threads';
import * as _t from '../mods/tools.js';
import AbstractScraper from './gedeeld/abstract-scraper.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const depulScraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 35000,
    url: 'https://www.livepul.com/agenda/',
  },
  singlePage: {
    timeout: 25000,
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

depulScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
depulScraper.mainPageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);
  const isRefused = await this.rockRefuseListCheck(event, workingTitle);
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }
  return {
    workingTitle,
    reason: [isRefused.reason].join(';'),
    event,
    success: true,
  };
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
depulScraper.singlePageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);

  const isAllowed = await this.rockAllowListCheck(event, workingTitle);
  if (isAllowed.success) {
    return isAllowed;
  }

  const hasGoodTerms = await this.hasGoodTerms(event, ['title', 'shortText']);
  if (hasGoodTerms.success) {
    this.saveAllowedTitle(workingTitle);
    return hasGoodTerms;
  }

  const isRockRes = await this.isRock(event, [workingTitle]);
  if (isRockRes.success) {
    this.saveAllowedTitle(workingTitle);
    return isRockRes;
  }
  this.saveRefusedTitle(workingTitle);

  return {
    workingTitle,
    event,
    success: false,
    reason: [isAllowed.reason, hasGoodTerms.reason, isRockRes.reason].join(';'),
  };
};
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
depulScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    return await this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
  }
  const { stopFunctie, page } = await this.mainPageStart();

  await page.evaluate(() => {
    // hack op site
    loadContent('all', 'music'); // eslint-disable-line
  });

  await _t.waitTime(250);

  let rawEvents = await page.evaluate(
    ({ months, workerData }) =>
      Array.from(document.querySelectorAll('.agenda-item')).map((rawEvent) => {
        const title = rawEvent.querySelector('h2')?.textContent.trim() ?? '';
        const res = {
          pageInfo: `<a class='page-info' href='${document.location.href}'>${workerData.family} - main - ${title}</a>`,
          errors: [],
          title,
        };
        res.shortText = rawEvent.querySelector('.text-box .desc')?.textContent.trim() ?? '';

        res.soldOut = !!rawEvent.querySelector('._soldout');

        const startDay =
          rawEvent.querySelector('.time .number')?.textContent.trim()?.padStart(2, '0') ?? null;
        const startMonthName = rawEvent.querySelector('.time .month')?.textContent.trim() ?? null;
        const startMonth = months[startMonthName];
        const startMonthJSNumber = Number(startMonth) - 1;
        const refDate = new Date();
        let startYear = refDate.getFullYear();
        if (startMonthJSNumber < refDate.getMonth()) {
          startYear += 1;
        }
        res.startDate = `${startYear}-${startMonth}-${startDay}`;
        res.venueEventUrl = rawEvent.querySelector('a')?.href ?? null;
        return res;
      }),
    { months: this.months, workerData },
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
depulScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const pageInfo = await page.evaluate(
    ({ months, event }) => {
      const res = {
        pageInfo: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };

      try {
        const contentBox = document.querySelector('#content-box') ?? null;
        if (contentBox) {
          [
            contentBox.querySelector('.item-bottom') ?? null,
            contentBox.querySelector('.social-content') ?? null,
            contentBox.querySelector('.facebook-comments') ?? null,
          ].forEach((removeFromContentBox) => {
            if (removeFromContentBox) {
              contentBox.removeChild(removeFromContentBox);
            }
          });
        }
      } catch (caughtError) {
        res.errors.push({
          caughtError,
          remarks: `longTextHTML ${res.pageInfo}`,
          toDebug: res,
        });
      }

      const agendaTitleBar = document.getElementById('agenda-title-bar') ?? null;
      res.shortText = agendaTitleBar?.querySelector('h3')?.textContent.trim();
      const rightHandDataColumn = agendaTitleBar?.querySelector('.column.right') ?? null;
      if (!rightHandDataColumn) {
        return res;
      }

      rightHandDataColumn.querySelectorAll('h1 + ul li')?.forEach((columnRow) => {
        const lowerCaseTextContent = columnRow?.textContent.toLowerCase();
        if (lowerCaseTextContent.includes('datum')) {
          try {
            const startDateMatch = lowerCaseTextContent.match(/(\d\d)\s+(\w{2,3})\s+(\d{4})/);
            if (startDateMatch && Array.isArray(startDateMatch) && startDateMatch.length === 4) {
              res.startDate = `${startDateMatch[3]}-${months[startDateMatch[2]]}-${
                startDateMatch[1]
              }`;
              if (!res.startDate) {
                throw Error('geen start date');
              }
            }
          } catch (caughtError) {
            res.errors.push({
              error: caughtError,
              remarks: `startDate mislukt ${event.title} ${res.pageInfo}`,
              toDebug: res,
            });
          }
        } else if (lowerCaseTextContent.includes('aanvang')) {
          if (!res.startDate) {
            return res;
          }
          try {
            const startTimeMatch = lowerCaseTextContent.match(/\d\d:\d\d/);
            if (startTimeMatch && Array.isArray(startTimeMatch) && startTimeMatch.length === 1) {
              res.start = `${res.startDate}T${startTimeMatch[0]}:00`;
            }
          } catch (caughtError) {
            res.errors.push({
              error: caughtError,
              remarks: `start en startDate samenvoegen ${res.pageInfo}`,
              toDebug: res,
            });
          }
        } else if (lowerCaseTextContent.includes('open')) {
          if (!res.startDate) {
            return res;
          }
          try {
            const doorTimeMatch = lowerCaseTextContent.match(/\d\d:\d\d/);
            if (doorTimeMatch && Array.isArray(doorTimeMatch) && doorTimeMatch.length === 1) {
              res.door = `${res.startDate}T${doorTimeMatch[0]}:00`;
            }
          } catch (caughtError) {
            res.errors.push({
              error: caughtError,
              remarks: `doorDateTime en startDate ${res.pageInfo}`,
              toDebug: res,
            });
          }
        }
        if (!res.start && res.door) {
          res.start = res.door;
          res.door = null;
        }
      });

      return res;
    },
    { months: this.months, event },
  );

  const imageRes = await this.getImage({
    page,
    event,
    pageInfo,
    selectors: ["#content [style*='background']"],
    mode: 'background-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  await page.evaluate(() => {
    document.querySelectorAll('.column.right li').forEach((listItem) => {
      if (listItem.innerHTML.includes('€')) {
        listItem.classList.add('depul-price-certain');
      }
    });
  });
  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.depul-price-certain', '.column.right'],
  });
  pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
  pageInfo.price = priceRes.price;

  const longTextRes = await longTextSocialsIframes(page, event, pageInfo);
  for (const i in longTextRes) {
    pageInfo[i] = longTextRes[i];
  }

  return await this.singlePageEnd({
    pageInfo,
    stopFunctie,
    page,
    event,
  });
};
// #endregion                         SINGLE PAGE

// #region [rgba(60, 0, 0, 0.3)]     LONG HTML
async function longTextSocialsIframes(page, event, pageInfo) {
  return await page.evaluate(
    ({ event }) => {
      const res = {};

      const textSelector = '#content-box';
      const mediaSelector = ['.video-wrap iframe'].join(', ');
      const removeEmptyHTMLFrom = textSelector;
      const socialSelector = [".social-link[href*='facebook'][href*='events']"].join(', ');
      const removeSelectors = [
        `${textSelector} [class*='icon-']`,
        `${textSelector} [class*='fa-']`,
        `${textSelector} .fa`,
        `${textSelector} script`,
        `${textSelector} noscript`,
        `${textSelector} style`,
        `${textSelector} meta`,
        `${textSelector} svg`,
        `${textSelector} form`,
        '.video-wrap',
        '.social-content',
        `${textSelector} img`,
        '.facebook-comments',
      ].join(', ');

      const attributesToRemove = [
        'style',
        'hidden',
        '_target',
        'frameborder',
        'onclick',
        'aria-hidden',
      ];
      const attributesToRemoveSecondRound = ['class', 'id'];
      const removeHTMLWithStrings = [];

      // eerst onzin attributes wegslopen
      const socAttrRemSelAdd = `${socialSelector.length ? `, ${socialSelector}` : ''}`;
      const mediaAttrRemSelAdd = `${
        mediaSelector.length ? `, ${mediaSelector} *, ${mediaSelector}` : ''
      }`;
      const textSocEnMedia = `${textSelector} *${socAttrRemSelAdd}${mediaAttrRemSelAdd}`;
      document.querySelectorAll(textSocEnMedia).forEach((elToStrip) => {
        attributesToRemove.forEach((attr) => {
          if (elToStrip.hasAttribute(attr)) {
            elToStrip.removeAttribute(attr);
          }
        });
      });

      // media obj maken voordat HTML verdwijnt
      res.mediaForHTML = Array.from(document.querySelectorAll(mediaSelector)).map((bron) => {
        const src = bron?.src ? bron.src : '';
        return {
          outer: bron.outerHTML,
          src,
          id: null,
          type: src.includes('spotify')
            ? 'spotify'
            : src.includes('youtube')
            ? 'youtube'
            : 'bandcamp',
        };
      });

      // socials obj maken voordat HTML verdwijnt
      res.socialsForHTML = !socialSelector
        ? ''
        : Array.from(document.querySelectorAll(socialSelector)).map((el) => {
            el.querySelectorAll('i, svg, img').forEach((rm) => rm.parentNode.removeChild(rm));
            if (!el.textContent.trim().length) {
              if (el.href.includes('facebook') || el.href.includes('fb.me')) {
                if (el.href.includes('facebook.com/events')) {
                  el.textContent = `FB event ${event.title}`;
                } else {
                  el.textContent = 'Facebook';
                }
              } else if (el.href.includes('twitter')) {
                el.textContent = 'Tweet';
              } else if (el.href.includes('instagram')) {
                el.textContent = 'Insta';
              } else {
                el.textContent = 'Social';
              }
            }
            el.className = 'long-html__social-list-link';
            el.target = '_blank';
            return el.outerHTML;
          });

      // stript HTML tbv text
      removeSelectors.length &&
        document
          .querySelectorAll(removeSelectors)
          .forEach((toRemove) => toRemove.parentNode.removeChild(toRemove));

      // verwijder ongewenste paragrafen over bv restaurants
      Array.from(
        document.querySelectorAll(`${textSelector} p, ${textSelector} span, ${textSelector} a`),
      ).forEach((verwijder) => {
        const heeftEvilString = !!removeHTMLWithStrings.find((evilString) =>
          verwijder.textContent.includes(evilString),
        );
        if (heeftEvilString) {
          verwijder.parentNode.removeChild(verwijder);
        }
      });

      // lege HTML eruit cq HTML zonder tekst of getallen
      document.querySelectorAll(`${removeEmptyHTMLFrom} > *`).forEach((checkForEmpty) => {
        const leegMatch = checkForEmpty.innerHTML.replace('&nbsp;', '').match(/[\w\d]/g);
        if (!Array.isArray(leegMatch)) {
          checkForEmpty.parentNode.removeChild(checkForEmpty);
        }
      });

      // laatste attributen eruit.
      document.querySelectorAll(textSocEnMedia).forEach((elToStrip) => {
        attributesToRemoveSecondRound.forEach((attr) => {
          if (elToStrip.hasAttribute(attr)) {
            elToStrip.removeAttribute(attr);
          }
        });
      });

      // tekst.
      res.textForHTML = Array.from(document.querySelectorAll(textSelector))
        .map((el) => el.innerHTML)
        .join('');
      return res;
    },
    { event },
  );
}
// #endregion                        LONG HTML
