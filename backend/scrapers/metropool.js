import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const metropoolScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 60000,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 35000,
      waitUntil: "load",
    },
    singlePage: {
      timeout: 25000
    },
    app: {
      mainPage: {
        url: "https://metropool.nl/agenda",
        requiredProperties: ['venueEventUrl', 'title']
      }
    }
  }
}));

metropoolScraper.listenToMasterThread();

// MAKE BASE EVENTS

metropoolScraper.makeBaseEventList = async function () {

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  await _t.autoScroll(page);
  await _t.autoScroll(page);
  await _t.autoScroll(page);

  const rawEvents = await page.evaluate(({workerData}) => {
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
      .filter((rawEvent, index) => index % workerData.workerCount === workerData.index)
      .map((rawEvent) => {
        return {
          venueEventUrl: rawEvent.href,
          title: rawEvent.querySelector(".card__title")?.textContent ?? null,
          shortText: 
            rawEvent.querySelector(".card__title card__title--sub")
              ?.textContent ?? '',
        };
      });
  }, {workerData});

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
};

// GET PAGE INFO

metropoolScraper.getPageInfo = async function ({ page }) {

  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(({months}) => {
    const res = {
      unavailable: "",
      pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
      errorsVoorErrorHandler: [],
    };

    res.priceTextcontent = 
      document.querySelector(".doorPrice")?.textContent.trim() ?? '';

    res.longTextHTML = 
      Array.from(document.querySelectorAll(".event-title-wrap ~ div"))
        .map((divEl) => {
          return divEl.outerHTML;
        })
        .join("") ?? '';

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

    const ofc = document.querySelector(".object-fit-cover");
    res.image = document.contains(ofc) && `https://metropool.nl/${ofc.srcset}`;

    res.location = "metropool";
    if (res.unavailable) {
      res.unavailable += res.pageInfoID;
    }

    return res;
  }, {months: this.months});

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};
