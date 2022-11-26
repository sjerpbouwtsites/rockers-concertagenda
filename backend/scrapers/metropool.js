import { metropoolMonths } from "../mods/months.js";
import MusicEvent from "../mods/music-event.js";
import { parentPort, workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./abstract-scraper.js";

// SCRAPER CONFIG

const scraperConfig = {
  baseEventTimeout: 35000,
  singlePageTimeout: 25000,
  maxExecutionTime: 60000,
  workerData: Object.assign({}, workerData),
};
const metropoolScraper = new AbstractScraper(scraperConfig);

metropoolScraper.listenToMasterThread();

// MAKE BASE EVENTS
metropoolScraper.makeBaseEventList = async function () {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTimethis} voorbij `
    );
  }, this.maxExecutionTime);
  const page = await this.browser.newPage();
  await page.goto("https://metropool.nl/agenda", {
    waitUntil: "load",
  });

  await _t.autoScroll(page);
  await _t.autoScroll(page);
  await _t.autoScroll(page);

  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".card--event"))
      .filter((rawEvent) => {
        const testText = rawEvent.dataset?.genres || rawEvent.textContent;

        return (
          testText.includes("metal") ||
          testText.includes("punk") ||
          testText.includes("noise") ||
          testText.includes("hardcore") ||
          testText.includes("ska")
        );
      })
      .filter((rawEvent, index) => {
        return index % 2 === workerIndex;
      })
      .map((rawEvent) => {
        return {
          venueEventUrl: rawEvent.href,
          title: rawEvent.querySelector(".card__title")?.textContent ?? null,
          shortText:
            rawEvent.querySelector(".card__title card__title--sub")
              ?.textContent ?? null,
        };
      });
  }, workerData.index);

  this.dirtyLog(rawEvents);

  return rawEvents
    .filter(_t.basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
};

// GET PAGE INFO

metropoolScraper.getPageInfo = async function ({ page, url }) {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTimethis} voorbij `
    );
  }, this.maxExecutionTime);
  const pageInfo = await page.evaluate((months) => {
    const res = {
      unavailable: "",
      pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
      errorsVoorErrorHandler: [],
    };

    res.priceTextcontent =
      document.querySelector(".doorPrice")?.textContent.trim() ?? null;

    res.longTextHTML =
      Array.from(document.querySelectorAll(".event-title-wrap ~ div"))
        .map((divEl) => {
          return divEl.outerHTML;
        })
        .join("") ?? null;

    const startDateRauwMatch = document
      .querySelector(".event-title-wrap")
      ?.innerHTML.match(
        /(\d{1,2})\s*(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)\s*(\d{4})/
      );
    let startDate;
    if (Array.isArray(startDateRauwMatch) && startDateRauwMatch.length) {
      const day = startDateRauwMatch[1];
      const month = months[startDateRauwMatch[2]];
      const year = startDateRauwMatch[3];
      startDate = `${year}-${month}-${day}`;
    } else {
      res.unavailable += "geen datum gevonden.";
    }

    if (startDate) {
      try {
        const startTimeMatch = document
          .querySelector(".beginTime")
          ?.innerHTML.match(/\d\d:\d\d/);
        if (startTimeMatch && startTimeMatch.length) {
          res.startDateTime = new Date(
            `${startDate}:${startTimeMatch[0]}`
          ).toISOString();
        } else {
          res.unavailable += "wel datum, maar geen starttijd gevonden.";
        }
        const doorTimeMatch = document
          .querySelector(".doorOpen")
          ?.innerHTML.match(/\d\d:\d\d/);
        if (doorTimeMatch && doorTimeMatch.length) {
          res.doorOpenDateTime = new Date(
            `${startDate}:${doorTimeMatch[0]}`
          ).toISOString();
        }
      } catch (error) {
        res.errorsVoorErrorHandler.push({
          error,
          remarks: "start en deurtijd match + ISOstring faal",
        });
      }
    }

    res.image = document.querySelector(".object-fit-cover")
      ? `https://metropool.nl/${
          document.querySelector(".object-fit-cover")?.srcset
        }`
      : null;

    res.location = "metropool";
    if (res.unavailable) {
      res.unavailable += res.pageInfoID;
    }

    return res;
  }, metropoolMonths);

  pageInfo?.errorsVoorErrorHandler?.forEach((errorHandlerMeuk) => {
    _t.handleError(
      errorHandlerMeuk.error,
      workerData,
      errorHandlerMeuk.remarks
    );
  });

  this.dirtyLog(pageInfo);

  clearTimeout(stopFunctie);
  !page.isClosed() && page.close();

  if (!pageInfo) {
    return {
      unavailable: `Geen resultaat <a href="${url}">van pageInfo</a>`,
    };
  }
  return pageInfo;
};
