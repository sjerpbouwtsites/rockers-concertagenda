/* global document */
import { workerData } from 'worker_threads';
import * as _t from '../mods/tools.js';
import AbstractScraper from './gedeeld/abstract-scraper.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const idunaScraper = new AbstractScraper({
  workerData: { ...workerData },
  mainPage: {
    url: 'https://iduna.nl/',
    waitUntil: 'load',
  },
  singlePage: {
    timeout: 20000,
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

idunaScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
idunaScraper.mainPageAsyncCheck = async function (event) {
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
idunaScraper.singlePageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);

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

  this.saveAllowedTitle(workingTitle);

  return {
    workingTitle,
    reason: [isAllowed.reason, hasForbiddenTerms.reason].join(';'),
    event,
    success: true,
  };
};
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
idunaScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    return await this.mainPageEnd({ stopFunctie: null, rawEvents: availableBaseEvents });
  }
  const { stopFunctie, page } = await this.mainPageStart();

  let metalEvents;
  let punkEvents;
  let doomEvents;
  try {
    doomEvents = await page
      .evaluate(
        // eslint-disable-next-line no-shadow
        ({ workerData, unavailabiltyTerms }) => {
          loadposts('doom', 1, 50); // eslint-disable-line
          return new Promise((resolve) => {
            setTimeout(() => {
              const doomEvents = Array.from(
                document.querySelectorAll('#gridcontent .griditemanchor'),
              ).map((event) => {
                const title =
                  event.querySelector('.griditemtitle h2:first-child')?.textContent ?? null;
                let shortText = event.querySelector('.griditemtitle h2 ~ h2')?.textContent ?? null;
                let soldOut = false;
                const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
                const unavailable = !!event.textContent.match(uaRex);
                if (shortText.match(/uitverkocht|sold\sout/i)) {
                  soldOut = true;
                  shortText = shortText
                    .replace(/uitverkocht|sold\sout\]?/i, '')
                    .replace(/[\[\]]+/i, '')
                    .trim();
                }
                return {
                  unavailable,
                  pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
                  errors: [],
                  soldOut,
                  venueEventUrl: event?.href ?? null,
                  title,
                  shortText,
                };
              });
              resolve(doomEvents);
            }, 2500);
          });
        },
        { workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms },
      )
      .then((doomEvents) => doomEvents);
    // TODO catch

    metalEvents = await page
      .evaluate(
        // eslint-disable-next-line no-shadow
        ({ workerData, unavailabiltyTerms }) => {
          loadposts('metal', 1, 50); // eslint-disable-line
          return new Promise((resolve) => {
            setTimeout(() => {
              const metalEvents = Array.from(
                document.querySelectorAll('#gridcontent .griditemanchor'),
              ).map((event) => {
                const title =
                  event.querySelector('.griditemtitle h2:first-child')?.textContent ?? null;
                let shortText = event.querySelector('.griditemtitle h2 ~ h2')?.textContent ?? null;
                let soldOut = false;
                const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
                const unavailable = !!event.textContent.match(uaRex);
                if (shortText.match(/uitverkocht|sold\soud/i)) {
                  soldOut = true;
                  shortText = shortText
                    .replace(/uitverkocht|sold\sout\]?/i, '')
                    .replace(/[\[\]]+/i, '')
                    .trim();
                }
                return {
                  pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
                  errors: [],
                  venueEventUrl: event?.href ?? null,
                  title,
                  soldOut,
                  shortText,
                  unavailable,
                };
              });
              resolve(metalEvents);
            }, 2500);
          });
        },
        { workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms },
      )
      .then((metalEvents) => metalEvents);
    // TODO catch

    punkEvents = await page
      .evaluate(
        // eslint-disable-next-line no-shadow
        ({ workerData, unavailabiltyTerms }) => {
          // no-eslint
          // hack VAN DE SITE ZELF
          loadposts('punk', 1, 50); // eslint-disable-line

          return new Promise((resolve) => {
            setTimeout(() => {
              const punkEvents = Array.from(
                document.querySelectorAll('#gridcontent .griditemanchor'),
              ).map((event) => {
                const title =
                  event.querySelector('.griditemtitle h2:first-child')?.textContent ?? null;
                let shortText = event.querySelector('.griditemtitle h2 ~ h2')?.textContent ?? null;
                let soldOut = false;
                const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
                const unavailable = !!event.textContent.match(uaRex);
                if (shortText.match(/uitverkocht|sold\soud/i)) {
                  soldOut = true;
                  shortText = shortText
                    .replace(/uitverkocht|sold\sout\]?/i, '')
                    .replace(/[\[\]]+/i, '')
                    .trim();
                }
                return {
                  venueEventUrl: event?.href ?? null,
                  title,
                  unavailable,
                  soldOut,
                  pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
                  errors: [],
                };
              });
              resolve(punkEvents);
            }, 2500);
          });
        },
        { workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms },
      )
      .then((punkEvents) => punkEvents);
    // TODO catch

    let metalEventsTitles = metalEvents.map((event) => event.title);

    punkEvents.forEach((punkEvent) => {
      if (!metalEventsTitles.includes(punkEvent)) {
        metalEvents.push(punkEvent);
      }
    });
    metalEventsTitles = metalEvents.map((event) => event.title);
    doomEvents.forEach((doomEvent) => {
      if (!metalEventsTitles.includes(doomEvent)) {
        metalEvents.push(doomEvent);
      }
    });
  } catch (caughtError) {
    // belachelijke try catch.
    // TODO WRAPPER ERRRO
    _t.handleError(
      caughtError,
      workerData,
      'uiterste catch om pak metalEvents punkEvents iduna main',
      'close-thread',
      {
        metalEvents,
        punkEvents,
      },
    );
    return await this.mainPageEnd({ stopFunctie, page, rawEvents: [] });
  }

  const rawEvents = metalEvents
    .map((musicEvent) => {
      musicEvent.title = _t.killWhitespaceExcess(musicEvent.title);
      musicEvent.pageInfo = _t.killWhitespaceExcess(musicEvent.pageInfo);
      return musicEvent;
    })
    .map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, rawEvents);
  return await this.mainPageEnd({ stopFunctie, rawEvents });
};
// #endregion                          MAIN PAGE

// #region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
idunaScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const pageInfo = await page.evaluate(
    ({ months, event }) => {
      const res = {
        pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
        errors: [],
      };
      try {
        const startDateMatch =
          document
            .querySelector('#sideinfo .capitalize')
            ?.textContent.match(/(\d+)\s+(\w+)\s+(\d\d\d\d)/) ?? null;
        if (startDateMatch && Array.isArray(startDateMatch) && startDateMatch.length > 3) {
          res.startDate = `${startDateMatch[3]}-${months[startDateMatch[2]]}-${startDateMatch[1]}`;
        }
        if (!res.startDate) {
          res.errors.push({
            remarks: `geen startDate ${res.pageInfo}`,
            toDebug: {
              event,
              text: document.querySelector('#sideinfo .capitalize')?.textContent,
            },
          });
          return res;
        }

        const doorEl = Array.from(document.querySelectorAll('#sideinfo h2')).find((h2El) =>
          h2El.textContent.toLowerCase().includes('deur'),
        );
        if (doorEl) {
          const doormatch = doorEl.textContent.match(/\d\d:\d\d/);
          if (doormatch) {
            res.doorTime = doormatch[0];
          }
        }

        const startEl = Array.from(document.querySelectorAll('#sideinfo h2')).find((h2El) =>
          h2El.textContent.toLowerCase().includes('aanvang'),
        );
        if (startEl) {
          const startmatch = startEl.textContent.match(/\d\d:\d\d/);
          if (startmatch) {
            res.startTime = startmatch[0];
          }
        }
        if (!res.startTime && res.doorTime) {
          res.startTime = res.doorTime;
          res.doorTime = null;
        } else if (!res.startTime) {
          res.errors.push({
            remarks: `geen startTime ${res.pageInfo}`,
            toDebug: {
              event,
            },
          });
          return res;
        }

        if (res.startTime) {
          res.start = `${res.startDate}T${res.startTime}:00`;
        } else if (res.doorTime) {
          res.start = `${res.startDate}T${res.doorTime}:00`;
        }

        if (res.startTime && res.doorTime) {
          res.door = `${res.startDate}T${res.doorTime}:00`;
        }
      } catch (caughtError) {
        // TODO BELACHELJIK GROTE TRY CATCH
        res.errors.push({
          error: caughtError,
          remarks: `belacheljik grote catch iduna singlePage ${res.pageInfo}`,
          toDebug: {
            event,
          },
        });
        return res;
      }

      return res;
    },
    { months: this.months, event },
  );

  const imageRes = await this.getImage({
    page,
    event,
    pageInfo,
    selectors: ["#photoandinfo [style*='background']"],
    mode: 'background-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['#sideinfo'],
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

      const textSelector = '#postcontenttext';
      const mediaSelector = ['.ytembed .vt-a img', '.spotify iframe'].join(', ');
      const removeEmptyHTMLFrom = textSelector;
      const socialSelector = ["#sideinfo [href*='facebook']"].join(', ');
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
        `${textSelector} img`,
      ].join(', ');

      const attributesToRemove = [
        'style',
        'hidden',
        '_target',
        'frameborder',
        'onclick',
        'aria-hidden',
        'allow',
        'allowfullscreen',
        'data-deferlazy',
        'width',
        'height',
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

      // attributen van media af
      document.querySelectorAll(mediaSelector).forEach((mediaPotentieel) => {
        attributesToRemoveSecondRound.forEach((attr) => {
          if (mediaPotentieel.hasAttribute(attr)) {
            mediaPotentieel.removeAttribute(attr);
          }
        });
      });

      // media obj maken voordat HTML verdwijnt
      res.mediaForHTML = Array.from(document.querySelectorAll(mediaSelector)).map((bron) => {
        bron.className = '';

        // custom iduna
        if (bron.hasAttribute('src') && bron.getAttribute('src').includes('youtube')) {
          return {
            outer: null,
            src: null,
            id: bron.src.match(/vi\/(.*)\//),
            type: 'youtube',
          };
        }
        if (bron.src.includes('spotify')) {
          return {
            outer: bron.outerHTML,
            src: bron.src,
            id: null,
            type: 'spotify',
          };
        }
        // end custom gebr de nobel

        // terugval???? nog niet bekend met alle opties.
        return {
          outer: bron.outerHTML,
          src: bron.src,
          id: null,
          type: bron.src.includes('spotify')
            ? 'spotify'
            : bron.src.includes('youtube')
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
