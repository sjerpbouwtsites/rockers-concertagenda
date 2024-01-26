/* global document */
import { workerData } from 'worker_threads';
import AbstractScraper from './gedeeld/abstract-scraper.js';
import longTextSocialsIframes from './longtext/bibelot.js';
import getImage from './gedeeld/image.js';

// #region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
const scraper = new AbstractScraper({
  workerData: { ...workerData },
  mainPage: {
    timeout: 15002,
    requiredProperties: ['venueEventUrl', 'title'],
    url: 'https://bibelot.net/programma/?_categories=punk%2Cmetal%2Cgaragerock%2Cgrunge',
  },
  singlePage: {
    timeout: 20003,
  },
  app: {
    mainPage: {
      asyncCheckFuncs: ['allowed', 'event', 'refused', 'forbiddenTerms', 'saveAllowed'],
    },
    singlePage: {
      requiredProperties: ['venueEventUrl', 'title', 'start'],
    },
  },
});
// #endregion                          SCRAPER CONFIG

scraper.listenToMasterThread();

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

  let rawEvents = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ workerData }) =>
      Array.from(
        document.querySelectorAll(
          '.card-programma',
        ),
      ).map((eventEl) => {
        const title = eventEl.querySelector('h3')?.textContent.trim() ?? null;
        const res = {
          anker: `<a class='page-info' href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
          title,
        };

        res.venueEventUrl = eventEl?.href ?? null;
        res.soldOut =
          !!eventEl.querySelector('.categories')?.textContent.match(/uitverkocht|sold\s?out/i) ??
          null;
        return res;
      }),
    { workerData },
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
  const { stopFunctie } = await this.singlePageStart(event);

  const pageInfo = await page.evaluate(
    // eslint-disable-next-line no-shadow
    ({ months, event }) => {
      const res = {
        anker: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };

      const infoElText = document.querySelector('.information')?.textContent.replaceAll(/\s{1,500}/g, ' ') ?? null;
      if (!infoElText) {
        res.errors.push({
          error: new Error('geen infoElText'),
          toDebug: document.querySelector('.information')?.innerHTML ?? 'geen information el',
        });
        return res;
      }
      const datumZonderJaar = Array.isArray(infoElText.match(/datum.*\d{1,2}\s\w{2,4}\s/i)) ? infoElText.match(/datum.*\d{1,2}\s\w{2,4}\s/i)[0].match(/\d{1,2}\s\w+/)[0] : null;
      const maandNaam = datumZonderJaar.match(/[\D]+/i)[0].trim();
      const maandNummer = months[maandNaam];
      const dag = datumZonderJaar.match(/\d+/i)[0].trim().padStart(2, '0');
      const huiMaandNr = (new Date()).getMonth() + 1;
      const huiJaar = (new Date()).getFullYear();
      const jaar = huiMaandNr < Number(maandNummer) ? (huiJaar + 1) : huiJaar;

      res.baseDate = `${jaar}-${maandNummer}-${dag}`;
      if (infoElText.match(/deuren.*\d{1,2}:\d\d\s/i)) {
        res.doorTime = infoElText.match(/deuren.*\d{1,2}:\d\d\s/i)[0].match(/\d\d:\d\d/)[0];
        res.door = `${jaar}-${huiMaandNr}-${dag}T${res.doorTime}:00`;
      }
      res.startTime = infoElText.match(/aanvang.*\d{1,2}:\d\d\s/i)[0].match(/\d\d:\d\d/)[0];
      res.start = `${jaar}-${huiMaandNr}-${dag}T${res.startTime}:00`;

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
    selectors: ['.wp-post-image'],
    mode: 'image-src',
  });
  pageInfo.errors = pageInfo.errors.concat(imageRes.errors);
  pageInfo.image = imageRes.image;

  const isGratis = await page.evaluate(() => !!Array.from(document.querySelectorAll('.categories .tag-green')).map((a) => a.textContent).join('').match(/gratis/i));

  if (!isGratis) {
    const priceRes = await this.getPriceFromHTML({
      page,
      event,
      pageInfo,
      selectors: ['.information'],
    });
    pageInfo.errors = pageInfo.errors.concat(priceRes.errors);
    pageInfo.price = priceRes.price;
  } else {
    pageInfo.price = 0;
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
