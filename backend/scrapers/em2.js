/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/oosterpoort.js';
import getImage from './gedeeld/image.js';
import terms from './gedeeld/terms.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 60017,
    url: 'https://em2groningen.nl/agenda/',
  },
  singlePage: {
    timeout: 20018,
    waitTime: 'load',
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

scraper.listenToMasterThread();

// #region [rgba(60, 0, 0, 0.5)]      MAIN PAGE EVENT CHECK
scraper.mainPageAsyncCheck = async function (event) {
  const reasons = [];

  this.talkToDB({
    type: 'db-request',
    subtype: 'isAllowed',
    messageData: {
      string: event.title,
    },
  });
  await this.checkDBhasAnswered();
  reasons.push(this.lastDBAnswer.reason);
  if (this.lastDBAnswer.success) {
    this.skipFurtherChecks.push(event.title);
    return {
      event,
      reason: reasons.reverse().join(','),
      success: true,
    };
  }

  this.talkToDB({
    type: 'db-request',
    subtype: 'isRockEvent',
    messageData: {
      string: event.title,
    },
  });
  await this.checkDBhasAnswered();
  reasons.push(this.lastDBAnswer.reason);
  if (this.lastDBAnswer.success) {
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveAllowedTitle',
      messageData: {
        string: event.title,
        reason: reasons.reverse().join(', '),
      },
    });
    this.skipFurtherChecks.push(event.title);
    return {
      event,
      reason: reasons.reverse().join(','),
      success: true,
    };
  }

  this.talkToDB({
    type: 'db-request',
    subtype: 'isRefused',
    messageData: {
      string: event.title,
    },
  });
  await this.checkDBhasAnswered();
  reasons.push(this.lastDBAnswer.reason);
  if (this.lastDBAnswer.success) {
    return {
      event,
      reason: reasons.reverse().join(','),
      success: false,
    };
  }

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  reasons.push(hasForbiddenTerms.reason);
  if (hasForbiddenTerms.success) {
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveRefusedTitle',
      messageData: {
        string: event.title,
        reason: reasons.reverse().join(', '),
      },
    });    
    
    return {
      event,
      reason: reasons.reverse().join(','),
      success: false,
    };
  }

  const isRockRes = await this.isRock(event);
  if (isRockRes.success) {
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveAllowedTitle',
      messageData: {
        string: event.title,
        reason: reasons.reverse().join(', '),
      },
    }); 
    return {
      event,
      reason: reasons.reverse().join(', '),
      success: true,
    };
  }

  const goodTermsRes = await this.hasGoodTerms(event);
  reasons.push(goodTermsRes.reason);
  if (goodTermsRes.success) {
    this.skipFurtherChecks.push(event.title);
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveAllowedTitle',
      messageData: {
        string: event.title,
        reason: reasons.reverse().join(', '),
      },
    });
    return goodTermsRes;
  }


  this.talkToDB({
    type: 'db-request',
    subtype: 'saveRefusedTitle',
    messageData: {
      string: event.title,
      reason: reasons.reverse().join(', '),
    },
  });   
  return {
    event,
    reason: reasons.reverse().join(', '),
    success: false,
  };
};
// #endregion                          MAIN PAGE EVENT CHECK

// #region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
// #endregion                          SINGLE PAGE EVENT CHECK

// #region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
scraper.mainPage = async function () {
  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents) {
    const thisWorkersEvents = availableBaseEvents.filter(
      (eventEl, index) => index % workerData.workerCount === workerData.index,
    );
    return this.mainPageEnd({ stopFunctie: null, rawEvents: thisWorkersEvents });
  }

  const { stopFunctie, page } = await this.mainPageStart();

  await this.waitTime(50);

  const cookiesNodig = await page.evaluate(() =>
    document.querySelector('html').classList.contains('has-open-cookie'),
  );

  if (cookiesNodig) {
    await page.evaluate(() => {
      document.querySelector("[name*='marketing']").click();
      document.querySelector('.cookie__settings .cookie__process').click();
    });
    await this.waitTime(50);
  }

  await this.autoScroll(page);
  await this.autoScroll(page);

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll('.agenda-container .agenda-item'))
        .filter((eventEl) => !eventEl.classList.contains('is-hidden'))
        .map((eventEl) => {
          const title = eventEl.querySelector('h3')?.textContent ?? '';
          const res = {
            anker: `<a class='page-info' href="${document.location.href}">${workerData.family} - main - ${title}</a>`,
            errors: [],
            title,
          };

          try {
            const DDslashMM = eventEl.querySelector('.agenda-item-date')?.textContent ?? null;
            const DD = DDslashMM.split("/")[0].trim();
            const MM = DDslashMM.split("/")[1].trim();
            res.startDate = `2024-${MM}-${DD}`;
          } catch (caughtError) {
            res.errors.push({
              error: caughtError,
              remarks: `date time faal ${title}.`,
            });
          }
          res.shortText = eventEl.querySelector('.agenda-item-content p')?.textContent ?? '';
          res.venueEventUrl = eventEl.querySelector('.more-button')?.href ?? null;

          // TODO: Hoe te bepalen of show is uitverkocht?
          const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
          res.unavailable = !!eventEl.textContent.match(uaRex);
          res.soldOut =
            !!eventEl
              .querySelector('.program__status')
              ?.textContent.match(/uitverkocht|sold\s?out/i) ?? false;

          res.longText = eventEl.querySelector('.agenda-item-content p')?.textContent ?? null; // tijdelijk om in te controleren
          return res;
        }),
    {
      workerData,
      unavailabiltyTerms: terms.unavailability,
    },
  );

  rawEvents = rawEvents.map(this.isMusicEventCorruptedMapper);

  const eventGen = this.eventGenerator(rawEvents);
  // eslint-disable-next-line no-unused-vars
  const checkedEvents = await this.rawEventsAsyncCheck({
    eventGen,
    checkedEvents: [],
  });  

  this.saveBaseEventlist(workerData.family, checkedEvents);
    
  const thisWorkersEvents = checkedEvents.filter(
    (eventEl, index) => index % workerData.workerCount === workerData.index,
  );
    
  return this.mainPageEnd({ stopFunctie, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
scraper.singlePage = async function ({ page, event }) {

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

  await this.waitTime(1000);

  const pageInfo = await page
    .evaluate(
      // eslint-disable-next-line no-shadow
      ({ event }) => {
        const res = {
          anker: `<a class='page-info' href='${document.location.href}'>${document.title}</a>`,
          errors: [],
        };

        try {
          // TODO: Check whether event is disabled.
          // if (
          //   document.querySelector('.event__cta') &&
          //   document.querySelector('.event__cta').hasAttribute('disabled')
          // ) {
          //   res.corrupted += ` ${document.querySelector('.event__cta')?.textContent}`;
          // }
        } catch (caughtError) {
          res.errors.push({
            error: caughtError,
            remarks: `check if disabled fail  ${res.anker}`,
            toDebug: event,
          });
        }

        return res;
      },
      { event },
    )
    .catch((caughtError) => {
      this.handleError(caughtError, 'pageInfo catch', 'notice', {
        event,
        pageInfo,
      });
    });

  // TODO: Get door time from .event-data
  event.startTime = "00:00"
  event.start = `${event.startDate}T${event.startTime}:00`;

  // TODO: Filter on genre in .event-data

  /*
     <div class="event-data">
         <div class="event-data-left">
             <span>Datum: <span class="event-value">09/02</span></span>
             <span>Deur open: <span class="event-value"> 21:00</span></span>
        </div>
        <div class="event-data-right">
            <span>Prijs:  <span class="event-value"> €15</span></span>
            <span>Genre: <span class="event-value"> Heavy Metal, Heavy Rock, Speed Metal</span></span>
        </div>
     </div>
   */

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo,
    selectors: ['.main-image'],
    mode: 'background-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const priceRes = await this.getPriceFromHTML({
    page,
    event,
    pageInfo,
    selectors: ['.event-value'],
  });
  pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
  pageInfo.price = priceRes.price;

  // TODO: Socials
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
