import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import { paradisoMonths } from "../mods/months.js";
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
    singlepage: {
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
  
  try {
    await page.waitForSelector('[data-category="60102"]', {
      timeout: 2500, // @TODO TE STRAK?
    });
  } catch (error) {
    _t.handleError(error, "Paradiso wacht op punk categorie");
  }

  await page.click('[data-category="60102"]');
  try {
    await page.waitForSelector(".block-list-search__submit", {
      timeout: 1000,
    });
  } catch (error) {
    _t.handleError(error, "Paradiso wacht op submit knop filters");
  }

  await page.click(".block-list-search__submit");
  try {
    await page.waitForSelector(".event-list__item", {
      timeout: 5000,
    });
  } catch (error) {
    _t.handleError(error, "Paradiso wacht op laden agenda na filter");
  }
  
  await _t.waitFor(150);

  let rawEvents = await page.evaluate(
    ({ workerIndex }) => {
      return Array.from(document.querySelectorAll(".event-list__item"))
        .filter((rawEvent, eventIndex) => {
          return eventIndex % 4 === workerIndex;
        })
        .map((rawEvent) => {
          const title =
            rawEvent
              .querySelector(".event-list__item-title")
              ?.textContent.trim() ?? "";
          const shortText =
            rawEvent
              .querySelector(".event-list__item-subtitle")
              ?.textContent.trim() ?? "";
          const venueEventUrl = rawEvent.hasAttribute("href")
            ? rawEvent.href
            : null;

          return {
            venueEventUrl,
            location: "paradiso",
            title,
            shortText,
          };
        });
    },
    { months: paradisoMonths, workerIndex: workerData.index }
  );

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
  
};

// GET PAGE INFO

paradisoScraper.getPageInfo = async function ({ page, url }) {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `getPageInfo is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);
  try {
    await page.waitForSelector(".header-template-2__subcontent .date", {
      timeout: 7500,
    });
  } catch (error) {
    _t.handleError(error, "Paradiso wacht op laden single pagina");
  }

  const pageInfo = await page.evaluate(
    ({ months }) => {
      const res = {
        unavailable: "",
        pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
        errorsVoorErrorHandler: [],
      };

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
      } catch (error) {
        res.errorsVoorErrorHandler.push({ error, remarks: "startDateMatch" });
        res.unavailable += " geen start date.";
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
        } catch (error) {
          res.errorsVoorErrorHandler.push({
            error: new Error(
              `ongeldige tijden: ${timesMatch.join(" ")}\n${error.message}`
            ),
            remarks: "start deur end samen",
          });
          res.unavailable += "nog meer tijd issues";
        }
      }
      res.priceTextcontent =
        document.querySelector(".template-2__price-wrapper-container")
          ?.textContent ?? null;

      const imageM = document
        .querySelector('[style*="background-im"]')
        ?.style.backgroundImage.match(/https.*.jpg|https.*.jpg/);
      if (imageM && imageM.length) {
        res.image = imageM[0] + "?w=600&h=400&fit=crop-50-50";
      }

      if (res.unavailable !== "") {
        res.unavailable = `${res.unavailable}\n${res.pageInfoID}`;
      }
      return res;
    },
    { months: paradisoMonths }
  );

  pageInfo?.errorsVoorErrorHandler?.forEach((errorHandlerMeuk) => {
    _t.handleError(
      errorHandlerMeuk.error,
      workerData,
      errorHandlerMeuk.remarks
    );
  });

  clearTimeout(stopFunctie);
  !page.isClosed() && page.close();

  if (!pageInfo) {
    return {
      unavailable: `Geen resultaat <a href="${url}">van pageInfo</a>`,
    };
  }
  return pageInfo;
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
