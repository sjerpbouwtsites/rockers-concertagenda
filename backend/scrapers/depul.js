import { workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const depulScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 60048,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 35000,
    },
    singlePage: {
      timeout: 25000
    },
    app: {
      mainPage: {
        url: "https://www.livepul.com/agenda/",
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  }
}));

depulScraper.listenToMasterThread();

// MAKE BASE EVENTS

depulScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  } 
  const {stopFunctie, page} = await this.makeBaseEventListStart()

  await page.evaluate(() => {
    // hack op site
    loadContent("all", "music"); // eslint-disable-line
  });

  await _t.waitFor(250);

  let rawEvents = await page.evaluate(
    ({ months,workerData }) => {
      return Array.from(document.querySelectorAll(".agenda-item"))
        .map((rawEvent) => {
          const title = rawEvent.querySelector("h2")?.textContent.trim() ?? "";
          const res = {
            unavailable: "",
            pageInfo: `<a class='page-info' href='${document.location.href}'>${workerData.family} - main - ${title}</a>`,
            errors: [],
            title
          };     
          res.shortText = 
            rawEvent.querySelector(".text-box .desc")?.textContent.trim() ?? "";
          
          const startDay =
            rawEvent
              .querySelector("time .number")
              ?.textContent.trim()
              ?.padStart(2, "0") ?? null;
          const startMonthName =
            rawEvent.querySelector(".time month")?.textContent.trim() ?? null;
          const startMonth = months[startMonthName];
          const startMonthJSNumber = Number(startMonth) - 1;
          const refDate = new Date();
          let startYear = refDate.getFullYear();
          if (startMonthJSNumber < refDate.getMonth()) {
            startYear = startYear + 1;
          }
          res.startDate = `${startYear}-${startMonth}-${startDay}`;
          res.venueEventUrl = rawEvent.querySelector("a")?.href ?? null;

          const imageMatch =
            rawEvent
              .querySelector("a")
              ?.getAttribute("style")
              .match(/url\('(.*)'\)/) ?? null;
          if (
            imageMatch &&
            Array.isArray(imageMatch) &&
            imageMatch.length === 2
          ) {
            res.image = imageMatch[1];
          }

          if (!res.image){
            res.errors.push({
              remarks: `image missing ${res.pageInfo}`
            })
          }

          return res;
        });
    },
    { months: this.months,workerData}
  );

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );
  
};

// GET PAGE INFO

depulScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(
    ({ months , event}) => {
      const res = {
        unavailable: event.unavailable,
        pageInfo: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };

      try {
        const contentBox = document.querySelector("#content-box") ?? null;
        if (contentBox) {
          [
            contentBox.querySelector(".item-bottom") ?? null,
            contentBox.querySelector(".social-content") ?? null,
            contentBox.querySelector(".facebook-comments") ?? null,
          ].forEach((removeFromContentBox) => {
            if (removeFromContentBox) {
              contentBox.removeChild(removeFromContentBox);
            }
          });
          res.tempHTML = contentBox.innerHTML;
          res.longTextHTML = contentBox.innerHTML;
        }
      } catch (caughtError) {
        res.errors.push({
          caughtError,
          remarks: `longTextHTML ${res.pageInfo}`,
          toDebug:res
        });
      }

      const agendaTitleBar =
        document.getElementById("agenda-title-bar") ?? null;
      res.shortText = agendaTitleBar?.querySelector("h3")?.textContent.trim();
      const rightHandDataColumn =
        agendaTitleBar?.querySelector(".column.right") ?? null;
      if (!rightHandDataColumn) {
        return res;
      }
      rightHandDataColumn
        .querySelectorAll("h1 + ul li")
        ?.forEach((columnRow) => {
          const lowerCaseTextContent = columnRow?.textContent.toLowerCase();
          if (lowerCaseTextContent.includes("datum")) {
            try {
              const startDateMatch = lowerCaseTextContent.match(
                /(\d\d)\s+(\w{2,3})\s+(\d{4})/
              );
              if (
                startDateMatch &&
                Array.isArray(startDateMatch) &&
                startDateMatch.length === 4
              ) {
                res.startDate = `${startDateMatch[3]}-${
                  months[startDateMatch[2]]
                }-${startDateMatch[1]}`;
                if (!res.startDate){
                  throw Error('geen start date');
                }
              }
            } catch (caughtError) {
              res.errors.push({ error: caughtError, remarks: `startDate mislukt ${event.title} ${res.pageInfo}`,toDebug:res });
            }
          } else if (lowerCaseTextContent.includes("aanvang")) {
            if (!res.startDate) {
              return res;
            }
            try {
              const startTimeMatch = lowerCaseTextContent.match(/\d\d:\d\d/);
              if (
                startTimeMatch &&
                Array.isArray(startTimeMatch) &&
                startTimeMatch.length === 1
              ) {
                res.startDateTime = new Date(
                  `${res.startDate}T${startTimeMatch[0]}:00`
                ).toISOString();
              }
            } catch (caughtError) {
              res.errors.push({
                error: caughtError,
                remarks: `startDateTime en startDate samenvoegen ${res.pageInfo}`,toDebug:res
              });
            }
          } else if (lowerCaseTextContent.includes("open")) {
            if (!res.startDate) {
              return res;
            }
            try {
              const doorTimeMatch = lowerCaseTextContent.match(/\d\d:\d\d/);
              if (
                doorTimeMatch &&
                Array.isArray(doorTimeMatch) &&
                doorTimeMatch.length === 1
              ) {
                res.doorOpenDateTime = new Date(
                  `${res.startDate}T${doorTimeMatch[0]}:00`
                ).toISOString();
              }
            } catch (caughtError) {
              res.errors.push({
                error: caughtError,
                remarks: `doorDateTime en startDate ${res.pageInfo}`,toDebug:res
              });
            }
          }
          if (!res.startDateTime && res.doorOpenDateTime) {
            res.startDateTime = res.doorOpenDateTime;
            res.doorOpenDateTime = null;
          }
        });

      return res;
    },
    { months: this.months , event}
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})

};

// SINGLE EVENT CHECK 

depulScraper.singleMergedEventCheck = async function (event) {
  this.dirtyDebug(event)
  const hasGoodTerms = await this.hasGoodTerms(event, ['title','shortText', 'longText']);
  if (hasGoodTerms.success) return hasGoodTerms;

  return {
    event,
    success: false,
    reason: "genres not in title, shortText, or event URL",
  };
};