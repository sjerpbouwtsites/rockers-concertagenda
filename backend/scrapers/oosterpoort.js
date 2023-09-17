import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import * as _t from '../mods/tools.js';
import ErrorWrapper from '../mods/error-wrapper.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const oostpoortScraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 60017,
  },
  singlePage: {
    timeout: 20018,
    waitTime: 'load',
  },
  app: {
    mainPage: {
      url: 'https://www.spotgroningen.nl/programma/#genres=muziek&subgenres=metal-heavy,pop-rock',
      requiredProperties: ['venueEventUrl', 'title', 'start'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'price', 'start'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

oostpoortScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
oostpoortScraper.mainPageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);

  const isRefused = await this.rockRefuseListCheck(event, workingTitle);
  if (isRefused.success) {
    isRefused.success = false;
    return isRefused;
  }

  const isAllowed = await this.rockAllowListCheck(event, workingTitle);
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  if (hasForbiddenTerms.success) {
    this.saveRefusedTitle(workingTitle);
    hasForbiddenTerms.success = false;
    return hasForbiddenTerms;
  }

  const isRockRes = await this.isRock(event);
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
oostpoortScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    return await this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  await _t.waitTime(50);

  const cookiesNodig = await page.evaluate(() =>
    document.querySelector('html').classList.contains('has-open-cookie'),
  );

  if (cookiesNodig) {
    await page.evaluate(() => {
      document.querySelector("[name*='marketing']").click();
      document.querySelector('.cookie__settings .cookie__process').click();
    });
    await _t.waitTime(50);
  }

  await _t.autoScroll(page);
  await _t.autoScroll(page);

  let rawEvents = await page.evaluate(
    ({ workerData, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll('.program__list .program__item'))
        .filter((eventEl) => !eventEl.classList.contains('is-hidden'))
        .map((eventEl) => {
          const eersteDeelKorteTekst = eventEl.querySelector('h1 span')?.textContent ?? '';
          const title =
            eersteDeelKorteTekst.length === 0
              ? eventEl.querySelector('h1')?.textContent ?? ''
              : eventEl.querySelector('h1')?.textContent.replace(eersteDeelKorteTekst, '') ?? '';
          const res = {
            pageInfo: `<a class='page-info' href="${location.href}">${workerData.family} - main - ${title}</a>`,
            errors: [],
            title,
          };

          try {
            res.start = eventEl.querySelector('.program__date')?.getAttribute('datetime') ?? null;
          } catch (caughtError) {
            res.errors.push({
              error: caughtError,
              remarks: `date time faal ${title}.`,
            });
          }
          const tweedeDeelKorteTekst =
            eventEl.querySelector('.program__content p')?.textContent ?? '';
          res.shortText = `${eersteDeelKorteTekst}<br>${tweedeDeelKorteTekst}`;
          res.venueEventUrl = eventEl.querySelector('.program__link')?.href ?? null;
          const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
          res.unavailable = !!eventEl.textContent.match(uaRex);
          res.soldOut =
            !!eventEl
              .querySelector('.program__status')
              ?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;
          res.longText = eventEl.querySelector('.program__content')?.textContent ?? null; // tijdelijk om in te controleren
          return res;
        }),
    {
      workerData,
      unavailabiltyTerms: AbstractScraper.unavailabiltyTerms,
    },
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
oostpoortScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const cookiesReq = await page.evaluate(() => {
    document.querySelector('.overlay.cookie');
  });
  if (cookiesReq) {
    await page.evaluate(() => {
      document.querySelector('[name*=marketing]').click();
      document.querySelector('.cookie__process.overlay__button').click();
    });
  }

  await _t.waitTime(5000);

  let pageInfo;

  pageInfo = await page
    .evaluate(
      ({ event }) => {
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${document.title}</a>`,
          errors: [],
        };

        try {
          if (
            document.querySelector('.event__cta') &&
            document.querySelector('.event__cta').hasAttribute('disabled')
          ) {
            res.corrupted += ` ${document.querySelector('.event__cta')?.textContent}`;
          }
        } catch (caughtError) {
          res.errors.push({
            error: caughtError,
            remarks: `check if disabled fail  ${res.pageInfo}`,
            toDebug: event,
          });
        }

        return res;
      },
      { event },
    )
    .catch((caughtError) => {
      _t.wrappedHandleError(
        new ErrorWrapper({
          error: caughtError,
          remarks: 'pageInfo catch',
          errorLevel: 'notice',
          workerData,
          toDebug: {
            event,
            pageInfo,
          },
        }),
      );
    });

  const imageRes = await this.getImage({
    page,
    event,
    pageInfo,
    selectors: ['.hero__image', '.festival__header__image'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.event__pricing__costs', '.festival__tickets__toggle'],
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

      const textSelector = '.event__language .layout--is-text';
      const mediaSelector = [
        '.layout--is-video .layout__media',
        "iframe[src*='bandcamp']",
        "iframe[src*='spotify']",
      ].join(', ');
      const removeEmptyHTMLFrom = textSelector;
      const socialSelector = [".layout__info__link [href*='facebook'][href*='events']"].join(', ');
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
        `${textSelector} [href*='instagram']`,
        `${textSelector} [href*='facebook']`,
        `${textSelector} [href*='fb.me']`,
        `${textSelector} a[href*='bandcamp.com']`,
        `${textSelector} h1`,
        `${textSelector} img`,
        ".layout__info__link [href*='facebook'][href*='events']",
        '.layout--is-video .layout__media',
        "iframe[src*='bandcamp']",
        "iframe[src*='spotify']",
        'svg',
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

            if (bron?.src && bron.src.includes('bandcamp')) {
              return {
                outer: bron.outerHTML,
                src: bron.src,
                id: null,
                type: 'bandcamp',
              };
            }

            if (bron?.src && bron.src.includes('spotify')) {
              return {
                outer: bron.outerHTML,
                src: bron.src,
                id: null,
                type: 'spotify',
              };
            }

            if (bron?.hasAttribute('data-video-embed')) {
              return {
                outer: null,
                src: bron.getAttribute('data-video-embed'),
                id: null,
                type: 'youtube',
              };
            }
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
