import { workerData } from 'worker_threads';
// eslint-disable-next-line import/no-extraneous-dependencies
import axios from 'axios';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/boerderij.js';
import getImage from './gedeeld/image.js';
import debugSettings from './gedeeld/debug-settings.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },

  mainPage: {
    timeout: 30005,
    url: `https://poppodiumboerderij.nl/includes/ajax/events.php?filters=6,7,8&search=&limit=69420&offset=0&lang_id=1&rooms=2,1&month=&year=`,
  },
  singlePage: {
    timeout: 20006,
  },
  app: {
    mainPage: {
      useCustomScraper: true,

      requiredProperties: ['venueEventUrl', 'title'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'price', 'start'],
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

  const hasForbiddenTerms = await this.hasForbiddenTerms(event);
  reasons.push(hasForbiddenTerms.reason);
  if (hasForbiddenTerms.success) {
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveRefusedTitle',
      messageData: {
        string: event.title,
        reason: hasForbiddenTerms.reason,
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

  const { stopFunctie } = await this.mainPageStart();

  let rawEvents = await axios.get(this._s.mainPage.url).then((response) => response.data);

  if (rawEvents.length) {
    rawEvents = rawEvents
      .map((event) => {
        const m = {
          venueEventUrl: `https://poppodiumboerderij.nl/programma/${event.seo_slug}`,
          shortText: event.subtitle,
          title: `${event.title}&id=${event.id}`,
        };
        const e = Object.assign(event, m);
        return e;
      })
      .map(this.isMusicEventCorruptedMapper);
  }

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
scraper.singlePage = async function ({ event, page }) {
  const { stopFunctie } = await this.singlePageStart();

  const [realEventTitle, realEventId] = event.title.split('&id=');
  // eslint-disable-next-line no-param-reassign
  event.title = realEventTitle;

  const res = {
    anker: `<a class='page-info' href='${this._s.mainPage.url}'>${event.title}</a>`,
    errors: [],
  };

  const url = `https://poppodiumboerderij.nl/includes/ajax.inc.php?id=${realEventId}&action=getEvent&lang_id=1`;
  const ajaxRes = await axios
    .get(url)
    .then((response) => response.data)
    .catch((caughtError) => {
      res.errors.push({
        error: caughtError,
        remarks: `ajax ${url} faal ${res.anker}`,
        errorLevel: 'close-thread',
        toDebug: event,
      });
    });

  if (!ajaxRes) {
    res.corrupted += `ajax verzoek faalt naar ${url}`;
    return this.singlePageEnd({ res, stopFunctie });
  }

  const imageRes = await getImage({
    _this: this,
    page,
    workerData,
    event,
    pageInfo: res,
    selectors: ['.event-image'],
    mode: 'image-src',
  });
  res.errors = res.errors.concat(imageRes.errors);
  res.image = imageRes.image;

  res.boerderijID = ajaxRes.id;
  const priceRes = await this.boerderijCustomPrice(
    `${ajaxRes?.entrance_price ?? ''} ${ajaxRes?.ticket_price ?? ''}`,
    res.anker,
    res.title,
  );
  res.errors = res.errors.concat(priceRes.errors);
  res.price = priceRes.price;

  try {
    res.start = `${ajaxRes.event_date}T${ajaxRes.event_start}:00`;
  } catch (catchedError) {
    res.errors.push({
      error: catchedError,
      remarks: `start samenvoeging ${res.anker}`,
      toDebug: res,
    });
  }
  try {
    res.door = `${ajaxRes.event_date}T${ajaxRes.event_open}:00`;
  } catch (catchedError) {
    res.errors.push({
      error: catchedError,
      remarks: `door samenvoeging ${res.anker}`,
      toDebug: res,
    });
  }

  const { mediaForHTML, socialsForHTML, textForHTML } = await longTextSocialsIframes(
    page,
    event,
    res,
  );
  res.mediaForHTML = mediaForHTML;
  res.socialsForHTML = socialsForHTML;
  res.textForHTML = textForHTML;

  res.soldOut = ajaxRes?.label?.title?.toLowerCase().includes('uitverkocht') ?? null;

  return this.singlePageEnd({ pageInfo: res, stopFunctie });
};
// #endregion                         SINGLE PAGE

scraper.boerderijCustomPrice = async function (testText, pi, title) {
  const priceRes = {
    price: null,
    errors: [],
  };
  if (!testText) {
    priceRes.errors.push({
      error: new Error('geen test text boerderij custom price'),
    });
    return priceRes;
  }

  if (testText.match(/start/i)) {
    priceRes.price = null;
    if (debugSettings.debugPrice) {
      this.dirtyDebug({
        title,
        price: priceRes.price,
        type: 'NOG ONBEKEND',
      });
    }
    return priceRes;
  }

  if (testText.match(/gratis|free/i)) {
    priceRes.price = 0;
    if (debugSettings.debugPrice) {
      this.dirtyDebug({
        title,
        price: priceRes.price,
        type: 'GRATIS',
      });
    }
    return priceRes;
  }

  if (testText.match(/uitverkocht|sold\sout/i)) {
    priceRes.price = null;
    if (debugSettings.debugPrice) {
      this.dirtyDebug({
        title,
        price: priceRes.price,
        type: 'UITVERKOCHT',
      });
    }
    return priceRes;
  }

  const priceMatch = testText
    .replaceAll(/[\s\r\t ]/g, '')
    .match(/(?<euros>\d+)(?<scheiding>[,.]?)(?<centen>\d\d|-)/);

  const priceMatchEuros = testText.replaceAll(/[\s\r\t ]/g, '').match(/\d+/);

  if (!Array.isArray(priceMatch) && !Array.isArray(priceMatchEuros)) {
    priceRes.errors.push({
      error: new Error(`geen match met ${pi}`),
    });
    return priceRes;
  }

  if (!Array.isArray(priceMatch) && Array.isArray(priceMatchEuros)) {
    priceRes.price = Number(priceMatchEuros[0]);
    if (Number.isNaN(priceRes.price)) {
      if (debugSettings.debugPrice) {
        this.dirtyDebug({
          title,
          price: priceRes.price,
        });
      }
      return false;
    }

    return priceRes;
  }

  if (priceMatch.groups?.centen && priceMatch.groups?.centen.includes('-')) {
    priceMatch.groups.centen = '00';
  }

  try {
    if (priceMatch.groups.scheiding) {
      if (priceMatch.groups.euros && priceMatch.groups.centen) {
        priceRes.price =
          (Number(priceMatch.groups.euros) * 100 + Number(priceMatch.groups.centen)) / 100;
      }
      if (priceMatch.groups.euros) {
        priceRes.price = Number(priceMatch.groups.euros);
      }
    } else {
      priceRes.price = Number(priceMatch.groups.euros);
    }
    priceRes.price = Number(priceMatchEuros[0]);
    if (Number.isNaN(priceRes.price)) {
      if (debugSettings.debugPrice) {
        this.dirtyDebug({
          title,
          price: priceRes.price,
        });
      }
      return false;
    }

    return priceRes;
  } catch (priceCalcErr) {
    priceRes.push({
      error: priceCalcErr,
      remarks: `price calc err ${pi}`,
      toDebug: { testText, priceMatch, priceRes },
    });
    return priceRes;
  }
};
