import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const dehellingScraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 20011,
    url: 'https://dehelling.nl/agenda/?zoeken=&genre%5B%5D=heavy',
  },
  singlePage: {
    timeout: 10012,
  },
  app: {
    mainPage: {
      requiredProperties: ['venueEventUrl', 'title', 'start'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'price', 'start'],
      longHTMLnewStyle: true,
    },
  },
});
// #endregion                          SCRAPER CONFIG

dehellingScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
dehellingScraper.mainPageAsyncCheck = async function (event) {
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

  this.saveAllowedTitle(workingTitle);

  return {
    workingTitle,
    reason: [isRefused.reason, isAllowed.reason].join(';'),
    event,
    success: true,
  };
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
dehellingScraper.singlePageAsyncCheck = async function (event) {
  return {
    reason: ['nothing found currently'].join(';'),
    event,
    success: true,
  };
};
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
dehellingScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    return await this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  let rawEvents = await page.evaluate(
    ({ workerData }) =>
      Array.from(document.querySelectorAll('.c-event-card'))
        .filter((eventEl) => {
          // TODO naar fatsoenlijke async check
          const tc = eventEl.querySelector('.c-event-card__meta')?.textContent.toLowerCase() ?? '';
          return !tc.includes('experimental') && !tc.includes('hiphop');
        })
        .map((eventEl) => {
          const schemaData = JSON.parse(
            eventEl.querySelector('[type="application/ld+json"]').innerHTML,
          );
          const title = schemaData?.name;

          const res = {
            pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],
            title,
          };

          try {
            res.end = schemaData.endDate.replace(' ', 'T');
          } catch (caughtError) {
            res.errors.push({
              error: caughtError,
              remarks: `end date time datestring omzetting ${title} ${res.pageInfo}`,
              toDebug: res,
            });
          }

          let startString;
          try {
            const metaEl = eventEl.querySelector('.c-event-card__meta') ?? null;
            if (metaEl) {
              const tijdMatch = metaEl.textContent.match(/(\d\d):(\d\d)/);
              if (tijdMatch && tijdMatch.length > 2) {
                res.startTime = tijdMatch[0];
                const hours = tijdMatch[1];
                const minutes = tijdMatch[2];
                startString = res.end.replace(
                  /T.*/,
                  `T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00`,
                );
                res.start = startString;
              }
            }
          } catch (caughtError) {
            res.errors.push({
              error: caughtError,
              remarks: `start date time eruit filteren error \n ${res.end} \n ${startString} ${title} ${res.pageInfo}`,
              toDebug: res,
            });
          }

          res.soldOut = !!eventEl.querySelector('.c-event-card__banner--uitverkocht');

          if (!res.startTime && res.end) {
            res.start = res.end;
            res.end = null;
          }

          res.venueEventUrl = schemaData.url;
          res.shortText = schemaData?.description ?? null;

          return res;
        }),
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
dehellingScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const pageInfo = await page.evaluate(
    ({ event }) => {
      const res = {
        pageInfo: `<a class='page-info' href='${event.venueEventUrl}'>${event.title}</a>`,
        errors: [],
      };
      const lineupEl = document.querySelector('.c-event-content__lineup');
      if (lineupEl) {
        const lineup = Array.from(
          document.querySelectorAll('.u-section__inner.c-event-content__lineup li'),
        )
          .map((li) => li.textContent)
          .join(', ');

        res.shortText = `${event.shortText}. Lineup: ${lineup}`;
        lineupEl.parentNode.removeChild(lineupEl);
      }
      const shareEl = document.querySelector('.c-event-content__sharer');
      if (shareEl) {
        shareEl.parentNode.removeChild(shareEl);
      }

      return res;
    },
    { event },
  );

  const imageRes = await this.getImage({
    page,
    event,
    pageInfo,
    selectors: ['.img--cover img', '.u-section__inner img'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.c-event-meta__table'],
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

      const textSelector = '.c-event-content__text';
      const mediaSelector = ['.c-event-content__embeds iframe'].join(', ');
      const removeEmptyHTMLFrom = textSelector;
      const socialSelector = ['.FacebookShare a', `${textSelector} img`, '.Twitter a'].join(', ');
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
        // custom dehelling
        if (!bron.hasAttribute('src') && bron.hasAttribute('data-src')) {
          bron.src = bron.getAttribute('data-src');
          bron.removeAttribute('data-src');
        }
        // endcustom

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
