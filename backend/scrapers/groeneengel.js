import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const groeneEngelScraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 25076,
    waitUntil: 'load',
    url: 'https://www.groene-engel.nl/programma/?filter=concert',
  },
  singlePage: {
    timeout: 20077,
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

groeneEngelScraper.listenToMasterThread();

// #region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
groeneEngelScraper.mainPageAsyncCheck = async function (event) {
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
    event,
    success: true,
    reason: [isRefused.reason, isAllowed.reason, hasForbiddenTerms.reason],
  };
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
groeneEngelScraper.singlePageAsyncCheck = async function (event) {
  const workingTitle = this.cleanupEventTitle(event.title);

  const isAllowed = await this.rockAllowListCheck(event, workingTitle);
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTerms = await this.hasForbiddenTerms(event, ['title', 'textForHTML']);
  if (hasForbiddenTerms.success) {
    this.saveRefusedTitle(workingTitle);
    hasForbiddenTerms.success = false;
    return hasForbiddenTerms;
  }

  const hasGoodTerms = await this.hasGoodTerms(event, ['title', 'textForHTML']);
  if (hasGoodTerms.success) {
    this.saveAllowedTitle(workingTitle);
    return hasGoodTerms;
  }

  const isRockRes = await this.isRock(event);
  if (isRockRes.success) {
    this.saveAllowedTitle(workingTitle);
  } else {
    this.saveRefusedTitle(workingTitle);
  }
  return isRockRes;
};
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
groeneEngelScraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    return await this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  let baseEvents = await page.evaluate(
    ({ workerData, unavailabiltyTerms, months }) =>
      Array.from(document.querySelectorAll('.collection-wrapper .event-part')).map((eventEl) => {
        const title = eventEl.querySelector('.part-title')?.textContent ?? null;
        const res = {
          pageInfo: `<a class='page-info' href='${location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title,
        };
        res.venueEventUrl = eventEl.querySelector('.left-side')?.href ?? '';
        const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
        res.unavailable = !!eventEl.textContent.match(uaRex);
        res.soldOut =
          !!eventEl.querySelector('.bottom-bar')?.textContent.match(/uitverkocht|sold\s?out/i) ??
          null;

        res.startDateMatch =
          eventEl
            .querySelector('.date-label')
            ?.textContent.match(/\s(?<datum>\d{1,2}\s\w+\s\d\d\d\d)/) ?? null;
        if (res.startDateMatch && res.startDateMatch?.groups)
          res.startDateRauw = res.startDateMatch.groups.datum;

        res.dag = res.startDateMatch.groups.datum.split(' ')[0].padStart(2, '0');
        res.maand = res.startDateMatch.groups.datum.split(' ')[1];
        res.maand = months[res.maand];
        res.jaar = res.startDateMatch.groups.datum.split(' ')[2];

        res.startDate = `${res.jaar}-${res.maand}-${res.dag}`;

        return res;
      }),
    { workerData, unavailabiltyTerms: AbstractScraper.unavailabiltyTerms, months: this.months },
  );

  baseEvents = baseEvents.map(this.isMusicEventCorruptedMapper);

  this.saveBaseEventlist(workerData.family, baseEvents);
  const thisWorkersEvents = baseEvents.filter(
    (eventEl, index) => index % workerData.workerCount === workerData.index,
  );
  return await this.mainPageEnd({ stopFunctie, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
groeneEngelScraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  const pageInfo = await page.evaluate(
    ({ event }) => {
      const res = {
        pageInfo: `<a class='page-info' href='${location.href}'>${event.title}</a>`,
        errors: [],
      };

      let startEl;
      let deurEl;
      document.querySelectorAll('.time-tag ~ *').forEach((tijdEl) => {
        if (tijdEl.textContent.toLowerCase().includes('aanvang')) {
          startEl = tijdEl;
        }
        if (tijdEl.textContent.toLowerCase().includes('open')) {
          deurEl = tijdEl;
        }
      });

      if (!startEl) {
        res.errors.push({
          remarks: 'geen tijd el gevonden',
        });
      }

      res.startTijdMatch = startEl.textContent.match(/\d\d:\d\d/);
      if (deurEl) res.deurTijdMatch = deurEl.textContent.match(/\d\d:\d\d/);
      if (Array.isArray(res.startTijdMatch)) res.startTijd = res.startTijdMatch[0];
      if (Array.isArray(res.deurTijdMatch)) res.deurTijd = res.deurTijdMatch[0];

      try {
        res.start = `${event.startDate}T${res.startTijd}:00`;
        res.door = !res?.deurTijd ? null : `${event.startDate}T${res.deurTijd}:00`;
      } catch (error) {
        res.errors.push({
          error,
          remarks: `date ${event.startDate} time ${res.startTijd}`,
          toDebug: {
            startElT: startEl.textContent,
          },
        });
      }

      return res;
    },
    { event },
  );

  const imageRes = await this.getImage({
    page,
    event,
    pageInfo,
    selectors: ['.img-wrapper img'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.main-ticket-info'],
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

      const textSelector = '#main-content .left-side';
      const mediaSelector = [
        '.left-side .rll-youtube-player [data-id]',
        ".left-side iframe[src*='spotify']",
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
        '.production-title-wrapper',
        `${textSelector} img`,
        '.left-side .rll-youtube-player',
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
      const removeHTMLWithStrings = ['Om deze content te kunnnen zien'];

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
        bron.className = '';
        // custom groene engel
        if (
          bron.hasAttribute('data-id') &&
          bron.hasAttribute('data-src') &&
          bron.getAttribute('data-src').includes('youtube')
        ) {
          return {
            outer: null,
            src: bron.getAttribute('data-src'),
            id: bron.getAttribute('data-id'),
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
        // end custom groene engel

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
