/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import { mapToStartDate, mapToStartTime } from './gedeeld/datums.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const occiiScraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 90000,
    url: 'https://occii.org/events/categories/rock/',
  },
  singlePage: {
    timeout: 45000,
  },
  app: {
    mainPage: {
      requiredProperties: ['venueEventUrl'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'price', 'start'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

occiiScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
occiiScraper.mainPageAsyncCheck = async function (event) {
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

  return {
    workingTitle,
    reason: ['occii rules', hasForbiddenTerms.reason],
    success: true,
    event,
  };
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
occiiScraper.singlePageAsyncCheck = async function (event, pageInfo) {
  const workingTitle = this.cleanupEventTitle(event.title);

  const ss = !(pageInfo?.genres?.include('electronic') ?? false);
  if (ss) {
    this.saveAllowedTitle(workingTitle);
  } else {
    this.saveRefusedTitle(workingTitle);
  }
  return {
    workingTitle,
    reason: `ja genre controle ${ss}`,
    success: ss,
    event,
  };
};
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
occiiScraper.mainPage = async function () {
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
    ({ workerData, unavailabiltyTerms }) => {
      // al geweest
      const rm = document.querySelector('h1 ~ h1 + .occii-events-display-container');
      rm.parentNode.removeChild(rm);

      return Array.from(
        document.querySelectorAll('.occii-events-display-container .occii-event-display'),
      ).map((occiiEvent) => {
        const firstAnchor = occiiEvent.querySelector('a');
        const { title } = firstAnchor;
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title,
        };

        const eventText = occiiEvent.textContent.toLowerCase();
        const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
        res.unavailable = !!occiiEvent.textContent.match(uaRex);
        res.soldOut = !!eventText.match(/uitverkocht|sold\s?out/i) ?? false;
        res.venueEventUrl = firstAnchor.href;
        res.shortText = occiiEvent.querySelector('.occii-events-description')?.textContent ?? null;
        return res;
      });
    },
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
occiiScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  let pageInfo = await page.evaluate(
    ({ months, event }) => {
      const res = {
        pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
        errors: [],
      };

      res.mapToStartDate = document
        .querySelector('.occii-event-date-highlight')
        .textContent.split(' ')
        .splice(1, 4)
        .join(' ');
      res.mapToStartTime = document.querySelector('.occii-event-details').textContent;

      res.genre = Array.from(
        document.querySelectorAll('.event-categories [href*="events/categories"]'),
      ).map((cats) => cats.textContent.toLowerCase().trim());

      return res;
    },
    { months: this.month, event },
  );

  pageInfo = mapToStartDate(pageInfo, 'maand-dag-jaar', this.months);
  pageInfo = mapToStartTime(pageInfo);
  pageInfo.start = `${pageInfo.startDate}T${pageInfo.startTime}`;

  const imageRes = await this.getImage({
    page,
    event,
    pageInfo,
    selectors: ['.wp-post-image'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  await page.evaluate(() => {
    const t =
      document.querySelector('.occii-single-event, .occii-event-details')?.textContent ?? '';
    const priceM = t.match(/€.*/);
    if (priceM) {
      let p = priceM[0];
      if (!p.match(/\d+,\d/) && p.match(/\d+-\d/)) {
        p = p.replace(/-\d/, '');
      }
      const priceEl = document.createElement('div');
      priceEl.id = 'occii-temp-price';
      priceEl.innerHTML = p;
      document.body.appendChild(priceEl);
    }
  });

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['#occii-temp-price', '.occii-single-event', '.occii-event-details'],
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

      const textSelector = '.occii-event-notes';
      const mediaSelector = [
        `${textSelector} [itemprop='video']`,
        `${textSelector} iframe[src*='bandcamp']`,
      ].join(', ');
      const removeEmptyHTMLFrom = textSelector;
      const socialSelector = [
        `${textSelector} [href*='instagram']`,
        `${textSelector} [href*='facebook']`,
        `${textSelector} [href*='fb.me']`,
        `${textSelector} a[href*='bandcamp.com']`,
      ].join(', ');
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
        `${textSelector} [itemprop="video"]`,
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

            return {
              outer: null,
              src: null,
              id: bron.id.match(/_(.*)/)[1],
              type: 'youtube',
            };

            // terugval???? nog niet bekend met alle opties.
            //   return {
            //     outer: bron.outerHTML,
            //     src: bron.src,
            //     id: null,
            //     type: bron.src.includes("spotify")
            //       ? "spotify"
            //       : bron.src.includes("youtube")
            //         ? "youtube"
            //         : "bandcamp",
            //   };
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
