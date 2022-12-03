import MusicEvent from "../mods/music-event.js";
import { parentPort, workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./abstract-scraper.js";
import { neushoornMonths } from "../mods/months.js";

// SCRAPER CONFIG

const scraperConfig = {
  baseEventTimeout: 15000,
  singlePageTimeout: 20000,
  maxExecutionTime: 30000,
  workerData: Object.assign({}, workerData),
};
const neushoornScraper = new AbstractScraper(scraperConfig);

neushoornScraper.listenToMasterThread();

// MAKE BASE EVENTS

neushoornScraper.makeBaseEventList = async function () {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);
  const page = await this.browser.newPage();

  

  await page.goto("https://neushoorn.nl/#/agenda", {
    waitUntil: "domcontentloaded",
    timeout: this.singlePageTimeout,
  });

  try {
    await page.waitForSelector('[href*="Heavy"]', {
      timeout: this.singlePageTimeout,
    });
  } catch (error) {
    _t.handleError(error, workerData, "Neushoorn wacht op laden agenda pagina");
  }

  await page.click('[href*="Heavy"]');

  try {
    await page.waitForSelector(".productions__item", {
      timeout: this.singlePageTimeout,
    });
  } catch (error) {
    _t.handleError(
      error,
      workerData,
      "Neushoorn wacht op laden resultaten filter"
    );
  }

  

  await _t.waitFor(50);

  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".productions__item")).map(
      (itemEl) => {
        const textContent = itemEl.textContent.toLowerCase();
        const isRockInText =
          textContent.includes("punk") ||
          textContent.includes("rock") ||
          textContent.includes("metal") ||
          textContent.includes("industrial") ||
          textContent.includes("noise");
        const title = itemEl.querySelector(
          ".productions__item__content span:first-child"
        ).textContent;
        const eventTitles = title.split("+").map((t) => t.trim());
        const venueEventUrl = itemEl.href;
        const location = "neushoorn";
        return {
          location,
          venueEventUrl,
          textContent,
          isRockInText,
          title,
          eventTitles,
        };
      }
    );
  }, workerData.index);
  clearTimeout(stopFunctie);
  !page.isClosed() && page.close();

  return rawEvents
    .map((event) => {
      (!event.venueEventUrl || !event.title) &&
        parentPort.postMessage(
          this.this.qwm.messageRoll(
            `Red het niet: <a href='${event.venueEventUrl}'>${event.title}</a> ongeldig.`
          )
        );
      return event;
    })
    .filter(_t.basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
};

// GET PAGE INFO

neushoornScraper.getPageInfo = async function ({ page, url }) {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `getPageInfo is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);
  const pageInfo = await page.evaluate(
    ({ months }) => {
      const res = {
        unavailable: "",
        pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
        errorsVoorErrorHandler: [],
      };

      const dateTextcontent =
        document.querySelector(".summary .summary__item:first-child")
          ?.textContent ?? "";
      const dateTextMatch = dateTextcontent.match(/\w+\s?(\d+)\s?(\w+)/);

      if (dateTextMatch && dateTextMatch.length === 3) {
        const year = "2022";
        const month = months[dateTextMatch[2]];
        const day = dateTextMatch[1].padStart(2, "0");
        res.startDate = `${year}-${month}-${day}`;
      } else {
        res.startDate = "onbekend";
        res.unavailable += " geen start date";
      }

      const timeTextcontent =
        document.querySelector(".summary .summary__item + .summary__item")
          ?.textContent ?? "";
      const timeTextMatch = timeTextcontent.match(
        /(\d{2}:\d{2}).*(\d{2}:\d{2})/
      );
      if (timeTextMatch && timeTextMatch.length === 3) {
        res.doorOpenDateTime = new Date(
          `${res.startDate}T${timeTextMatch[1]}`
        ).toISOString();
        res.startDateTime = new Date(
          `${res.startDate}T${timeTextMatch[2]}`
        ).toISOString();
      } else {
        res.startDateTime = new Date(
          `${res.startDate}T${timeTextMatch[1]}`
        ).toISOString();
      }

      res.priceTextcontent =
        document.querySelector(".prices__item__price")?.textContent ?? null;
      res.priceContexttext =
        document.querySelector(".prices")?.textContent ?? null;

      try {
        const summaryEl = document.querySelector(".content .summary");
        const longEl = summaryEl.parentNode;
        longEl.removeChild(summaryEl);
        res.longTextHTML = longEl.innerHTML;
      } catch (error) {
        res.errorsVoorErrorHandler.push({
          error,
          remarks: "long text html poging mislukt",
        });
      }

      const imageEl = document.querySelector('[style*="url"]');
      res.imageElLen = imageEl.length;
      if (imageEl) {
        const imageMatch =
          imageEl.style.backgroundImage.match(/https.*jpg/) ?? null;
        if (imageMatch) {
          res.image = imageMatch[1];
        }
      }

      return res;
    },
    { months: neushoornMonths }
  );
  if (pageInfo.error) {
    _t.handleError(new Error(pageInfo.error, workerData, `get page info fail`));
  }
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
