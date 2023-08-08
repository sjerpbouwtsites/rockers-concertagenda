import { workerData } from 'worker_threads';
import * as _t from '../mods/tools.js';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import { waitTime } from '../mods/tools.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const voltScraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    waitUntil: 'load',
  },
  app: {
    mainPage: {
      url: 'https://www.poppodium-volt.nl/programma?f%5B0%5D=activity_itix_genres%3A9&f%5B1%5D=activity_itix_genres%3A30',
      requiredProperties: ['venueEventUrl', 'title'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'price', 'start'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

voltScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
voltScraper.mainPageAsyncCheck = async function (event) {
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
voltScraper.singlePageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);

  const isAllowed = await this.rockAllowListCheck(event, workingTitle);
  if (isAllowed.success) return isAllowed;

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
voltScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    return await this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  try {
    await page.waitForSelector('.card-activity', {
      timeout: 1250,
    });
  } catch (error) {
    _t.handleError(error, workerData, 'Volt wacht op laden eventlijst', 'close-thread', null);
  }

  let rawEvents = await page.evaluate(
    ({ workerData, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll('.card-activity'))
        // .filter((rawEvent) => {
        //   const hasGenreName =
        //     rawEvent
        //       .querySelector(".card-activity-list-badge-wrapper")
        //       ?.textContent.toLowerCase()
        //       .trim() ?? "";
        //   return hasGenreName.includes("metal") || hasGenreName.includes("punk");
        // })
        .map((rawEvent) => {
          const anchor = rawEvent.querySelector('.card-activity__title a') ?? null;
          const title = anchor?.textContent.trim() ?? '';
          const res = {
            pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
            title,
          };
          res.venueEventUrl = anchor.hasAttribute('href') ? anchor.href : null;
          res.shortText =
            rawEvent.querySelector('.card-activity__image-badges')?.textContent ?? null;

          const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
          res.unavailable = !!rawEvent.textContent.match(uaRex);
          res.soldOut = rawEvent?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;
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

// #region [rgba(120, 0, 0, 0.1)]      SINGLE PAGE
voltScraper.singlePage = async function ({ page, url, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const cookiesNodig = await page.evaluate(() =>
    document.querySelector('.cookiesjsr-btn.allowAll'),
  );

  if (cookiesNodig) {
    await page.evaluate(() => {
      document.querySelector('.cookiesjsr-btn.allowAll').click();
    });
    await waitTime(1500);
  }

  const pageInfo = await page.evaluate(
    ({ months, event, url }) => {
      const res = {};
      res.title = event.title;
      res.unavailable = event.unavailable;
      res.pageInfo = `<a class='page-info' class='page-info' href='${url}'>${event.title}</a>`;
      res.errors = [];

      const startDateMatch = document
        .querySelector('.field--name-field-date')
        ?.textContent.match(/(\d+)\s?(\w+)\s?(\d\d\d\d)/);
      if (Array.isArray(startDateMatch) && startDateMatch.length > 2) {
        const dag = startDateMatch[1].padStart(2, '0');
        const maandNaam = startDateMatch[2];
        const maand = months[maandNaam];
        const jaar = startDateMatch[3];
        res.startDate = `${jaar}-${maand}-${dag}`;
      } else {
        res.startDate = null;
      }

      const eersteTijdRij = document.querySelector('.activity-info-row');
      const tweedeTijdRij = document.querySelector('.activity-info-row + .activity-info-row');
      if (!eersteTijdRij && !tweedeTijdRij) {
        res.errors.push({
          error: new Error('geen tijdrijen'),
        });
        return res;
      }

      const startTimeM = eersteTijdRij.textContent.match(/\d\d\s?:\s?\d\d/);
      const endTimeM = tweedeTijdRij?.textContent.match(/\d\d\s?:\s?\d\d/) ?? null;
      if (!Array.isArray(startTimeM)) {
        res.errors.push({
          error: new Error('geen tijdmatch success'),
          toDebug: eersteTijdRij.textContent,
        });
        return res;
      }
      res.startTime = startTimeM[0].replaceAll(/\s/g, '');
      if (Array.isArray(endTimeM)) {
        res.endTime = endTimeM[0].replaceAll(/\s/g, '');
      }

      try {
        if (res.startTime) {
          res.start = `${res.startDate}T${res.startTime}:00`;
        }

        if (res.endTime) {
          res.end = `${res.startDate}T${res.endTime}:00`;
        }
      } catch (error) {
        res.errors.push({
          error,
          remarks: `ongeldige tijden ${res.pageInfo}`,
        });
        return res;
      }

      return res;
    },
    { months: this.months, url, event },
  );

  const imageRes = await this.getImage({
    page,
    event,
    pageInfo,
    selectors: ['.image-container img'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.activity-price'],
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

      const textSelector = '.activity-content-wrapper > div:first-child';
      const mediaSelector = [
        "iframe[src*='spotify']",
        "iframe[src*='bandcamp']",
        "iframe[data-src*='spotify']",
        "iframe[data-src*='bandcamp']",
      ].join(', ');
      const removeEmptyHTMLFrom = textSelector;
      const socialSelector = [].join(', ');
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
        `${textSelector} h1`,
        `${textSelector} img`,
        `${textSelector} iframe`,
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

      // media obj maken voordat HTML verdwijnt
      res.mediaForHTML = !mediaSelector.length
        ? ''
        : Array.from(document.querySelectorAll(mediaSelector)).map((bron) => {
            bron.className = '';

            if (bron?.src && (bron.src.includes('bandcamp') || bron.src.includes('spotify'))) {
              return {
                outer: bron.outerHTML,
                src: bron.src,
                id: null,
                type: bron.src.includes('bandcamp') ? 'bandcamp' : 'spotify',
              };
            }
            if (bron?.src && bron.src.includes('youtube')) {
              return {
                outer: bron.outerHTML,
                src: bron.src,
                id: null,
                type: 'youtube',
              };
            }

            // terugval???? nog niet bekend met alle opties.
            if (!bron?.src && bron.hasAttribute('data-src')) {
              bron.src = bron.getAttribute('data-src');
              bron.removeAttribute('data-src');
            }
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
