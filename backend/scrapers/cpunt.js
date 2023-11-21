/* global document */
import { workerData } from 'worker_threads';
import fs from 'fs';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/cpunt.js';
import getImage from './gedeeld/image.js';
import terms from './gedeeld/terms.js';
import fsDirections from '../mods/fs-directions.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },
  launchOptions: {
    headless: false,
  },
  mainPage: {
    timeout: 30014,
    waitUntil: 'load',
    url: 'https://www.cpunt.nl/agenda?q=&genre=metalpunkheavy&StartDate=&EndDate=#filter',
  },
  singlePage: {
    timeout: 30012,
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

scraper.listenToMasterThread();

// #region [rgba(50, 0, 0, 0.5)]      MAIN PAGE EVENT CHECK
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
    return {
      event,
      reason: reasons.reverse().join(','),
      success: true,
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

  if (
    !(await page
      .waitForSelector('#filter .article-wrapper', {
        timeout: 2000,
      })
      .catch(async (caughtError) => {
        const pageHTML = await page.evaluate(() => {
          console.log("NEE");
          return `${document.body.outerHTML}`;
        });
        this.dirtyLog(pageHTML);
        fs.writeFileSync(`${fsDirections.temp}/rando-error.txt`, pageHTML, 'utf-8');
        this.handleError(
          caughtError,
          'Timeout wachten op #filter .article-wrapper Main page',
          'close-thread',
          null,
        );
      }))
  ) {
    return this.mainPageEnd({ stopFunctie, page, rawEvents: [] });
  }

  await this.waitTime(50);

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData, unavailabiltyTerms }) =>
      Array.from(document.querySelectorAll('#filter .article-wrapper')).map((rawEvent) => {
        const title = rawEvent.querySelector('.article-title')?.textContent ?? null;
        const res = {
          anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} - main - ${title}</a>`,
          errors: [],
        };

        res.title = title;
        const anchor = rawEvent.querySelector('.absolute-link') ?? null;
        res.venueEventUrl = anchor?.href ?? null;

        const parpar = rawEvent.parentNode.parentNode;
        res.startDate = parpar.hasAttribute('data-last-date')
          ? parpar.getAttribute('data-last-date').split('-').reverse().join('-')
          : null;
        const artInfoText =
          rawEvent.querySelector('.article-info')?.textContent.toLowerCase() ?? '';
        const uaRex = new RegExp(unavailabiltyTerms.join('|'), 'gi');
        res.unavailable = !!rawEvent.textContent.match(uaRex);
        res.soldOut = !!artInfoText.match(/wachtlijst|uitverkocht/i);
        res.shortText = '';
        return res;
      }),
    { workerData, unavailabiltyTerms: terms.unavailability },
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
  
  return this.mainPageEnd({ stopFunctie, page, rawEvents: thisWorkersEvents });
};
// #endregion                          MAIN PAGE

// #region [rgba(120, 0, 0, 0.1)]     SINGLE PAGE
scraper.singlePage = async function ({ page, event }) {
  const { stopFunctie } = await this.singlePageStart();

  if (
    !(await page
      .waitForSelector('#main .content-blocks', {
        timeout: 7500,
      })
      .catch((caughtError) => {
        this.handleError(
          caughtError,
          workerData,
          `Timeout wachten op #main .content-blocks ${event.title}`,
          'close-thread',
          event,
        );
      }))
  ) {
    return this.singlePageEnd({
      pageInfo: event,
      stopFunctie,
      page,
      event,
    });
  }

  const pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ months, event }) => {
      const contentSections = Array.from(document.querySelectorAll('.content-blocks section'));
      let indexOfTicketSection = 0;
      contentSections.forEach((section, sectionIndex) => {
        if (section.className.includes('Tickets')) {
          indexOfTicketSection = sectionIndex;
        }
      });
      const ticketSection = contentSections[indexOfTicketSection];

      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${document.title}</a>`,
        errors: [],
      };

      const [, shortDay, monthName, year] = ticketSection
        .querySelector('.article-date')
        ?.textContent.match(/(\d+)\s+(\w+)\s+(\d\d\d\d)/) ?? [null, null, null, null];
      const day = shortDay.padStart(2, '0');
      const month = months[monthName.toLowerCase()];
      const startDate = `${year}-${month}-${day}`;

      let deurTijd;
      let startTijd;
      const tijdMatches =
        document
          .querySelector('.article-bottom .article-times')
          ?.innerHTML.match(/(\d\d[:.]\d\d)/)
          .map((strings) => strings.replace('.', ':')) ?? null;

      res.tijdMatches = tijdMatches;
      if (Array.isArray(tijdMatches) && tijdMatches.length) {
        if (tijdMatches.length >= 2) {
          startTijd = `${tijdMatches[1]}:00`;
          deurTijd = `${tijdMatches[0]}:00`;
        } else {
          startTijd = `${tijdMatches[0]}:00`;
        }
      } else {
        res.errors.push({
          error: new Error('geen startTijdMatch res.'),
          toDebug: {
            html: document.querySelector('.article-bottom .article-times')?.innerHTML,
            match: tijdMatches,
          },
        });
      }

      if (deurTijd) {
        try {
          res.door = `${startDate}T${deurTijd}`;
        } catch (caughtError) {
          res.errors.push({
            error: caughtError,
            remarks: `deurtijd door date error ${event.title} ${startDate}`,
            toDebug: {
              timeTried: `${startDate}T${deurTijd}`,
              event,
            },
          });
        }
      }

      if (startTijd) {
        try {
          res.start = `${startDate}T${startTijd}`;
        } catch (caughtError) {
          res.errors.push({
            error: caughtError,
            remarks: `starttijd door date error ${event.title} ${startDate}`,
            toDebug: {
              timeTried: `${startDate}T${startTijd}`,
              event,
            },
          });
        }
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
    selectors: [".bg-image[style*='background']"],
    mode: 'background-src',
  });

  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const viaTicketMaster = await page.evaluate(() => !!document.querySelector('.tickets-wrapper a[href*="ticketmaster"]') && !document.querySelector('.price'));

  if (viaTicketMaster) {
    pageInfo.price = null;
  } else {
    const priceRes = await this.getPriceFromHTML({
      page,
      event,
      pageInfo,
      selectors: ['.article-price'],
    });
    pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
    pageInfo.price = priceRes.price;
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
