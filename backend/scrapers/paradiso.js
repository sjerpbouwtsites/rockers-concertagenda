import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

//HEEFT ASYNC CHECK

// SCRAPER CONFIG

const paradisoScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 60000,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 30000,
      waitUntil: 'load'
    },
    singlePage: {
      timeout: 15000
    },
    app: {
      mainPage: {
        url: "https://www.paradiso.nl/nl/zoeken/categorie/",
        requiredProperties: ['venueEventUrl', 'title']
      }
    }
  }
}));

paradisoScraper.listenToMasterThread();

// MAKE BASE EVENTS
paradisoScraper.makeBaseEventList = async function () {

  const {stopFunctie, page} = await this.makeBaseEventListStart()
  
  const res = await page.evaluate(({workerData}) => {
    return {
      unavailable: '',
      pageInfo: `<a href='${document.location.href}'>${workerData.family} main - ${workerData.index}</a>`,
      errors: [],
    }
  }, {workerData});

  try {
    await page.waitForSelector('[data-category="60102"]', {
      timeout: 2500, // @TODO TE STRAK?
    });
    await page.click('[data-category="60102"]');
    await page.waitForSelector(".block-list-search__submit", {
      timeout: 1000,
    });
    await page.click(".block-list-search__submit");
    await page.waitForSelector(".event-list__item", {
      timeout: 5000,
    });    
  } catch (caughtError) {
    res.errors.push({error: caughtError, remarks: 'wachten en klikken', errorLevel: 'close-thread'})
  }

  await _t.waitFor(250);

  let rawEvents = await page.evaluate(
    ({workerData, resBuiten}) => {

        
      return Array.from(document.querySelectorAll(".event-list__item"))
        .filter((rawEvent, index) => index % workerData.workerCount === workerData.index)
        .map((rawEvent) => {
          const res = {
            ...resBuiten,
            errors: [...resBuiten.errors]
          }          
          res.title =
            rawEvent
              .querySelector(".event-list__item-title")
              ?.textContent.trim() ?? "";
          res.shortText = 
            rawEvent
              .querySelector(".event-list__item-subtitle")
              ?.textContent.trim() ?? "";
          res.venueEventUrl = rawEvent.hasAttribute("href")
            ? rawEvent.href
            : null;
          res.soldOut = !!(rawEvent.querySelector(".event-list__item-info")?.textContent.toLowerCase().includes('uitverkocht') ?? null)
          return res;
        });
    },
    {workerData, resBuiten: res}
  );

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
  
};

// GET PAGE INFO

paradisoScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()

  const buitenRes = {
    unavailable: event.unavailable,
    pageInfo: `<a href='${event.venueEventUrl}'>${event.title}</a>`,
    errors: [],
  };  
  
  try {
    await page.waitForSelector(".header-template-2__subcontent .date", {
      timeout: 7500,
    });
  } catch (caughtError) {
    buitenRes.errors.push({
      error: caughtError,
      remarks: "Paradiso wacht op laden single pagina",
      errorLevel: 'notify'
    })
    buitenRes.unavailable += 'single pagina niet snel genoeg geladen.'
    return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  }

  const pageInfo = await page.evaluate(
    ({ months, buitenRes }) => {
      const res = {...buitenRes};

      const contentBox =
        document.querySelector(".header-template-2__description") ?? null;
      if (contentBox) {
        res.longTextHTML = contentBox.innerHTML;
      }

      try {
        const startDateMatch = document
          .querySelector(".header-template-2__subcontent .date")
          ?.textContent.toLowerCase()
          .match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
        if (
          startDateMatch &&
          Array.isArray(startDateMatch) &&
          startDateMatch.length === 4
        ) {
          res.startDate = `${startDateMatch[3]}-${
            months[startDateMatch[2]]
          }-${startDateMatch[1].padStart(2, "0")}`;
        }
      } catch (caughtError) {
        res.errors.push({ error: caughtError, remarks: "startDateMatch"});
        res.unavailable += " geen start date.";
        return res;
      }

      const timesMatch =
        document
          .querySelector(".template-2__content-header")
          ?.textContent.match(/(\d\d:\d\d)/g) ?? null;
      res.timesMatch = timesMatch;
      res.tijdText = document.querySelector(
        ".template-2__content-header"
      )?.textContent;
      if (timesMatch && Array.isArray(timesMatch) && timesMatch.length >= 1) {
        try {
          if (timesMatch.length === 1) {
            res.startDateTime = new Date(
              `${res.startDate}T${timesMatch[0]}:00`
            ).toISOString();
          } else {
            res.doorOpenDateTime = new Date(
              `${res.startDate}T${timesMatch[0]}:00`
            ).toISOString();
            res.startDateTime = new Date(
              `${res.startDate}T${timesMatch[1]}:00`
            ).toISOString();
          }
        } catch (caughtError) {
          res.errors.push({
            error: caughtError,
            remarks: `ging hiermee mis: ${timesMatch.join(" ")}\n`,
          });
          res.unavailable += "geen start date, tijd, drama";
          return res;
        }
      }

      res.priceTextcontent =
        document.querySelector(".template-2__price-wrapper-container")
          ?.textContent ?? '';

      const imageM = document
        .querySelector('[style*="background-im"]')
        ?.style.backgroundImage.match(/https.*.jpg|https.*.png/);
      if (imageM && imageM.length) {
        res.image = imageM[0] + "?w=600&h=400&fit=crop-50-50";
      }

      return res;
    },
    { months: this.months, buitenRes }
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})

};

// SINGLE EVENT CHECK

paradisoScraper.singleEventCheck = async function (event) {
  const firstCheckText = `${event?.title ?? ""} ${event?.shortText ?? ""}`;
  if (
    firstCheckText.includes("indie") ||
    firstCheckText.includes("dromerig") ||
    firstCheckText.includes("shoegaze") ||
    firstCheckText.includes("alternatieve rock")
  ) {
    return {
      event,
      success: false,
      reason: "verboden genres gevonden in title+shortText",
    };
  }

  return {
    event,
    success: true,
    reason: "verboden genres niet gevonden.",
  };
};
