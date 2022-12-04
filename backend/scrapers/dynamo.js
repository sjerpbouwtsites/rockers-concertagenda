import { dynamoMonths } from "../mods/months.js";
import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";
import * as _t from "../mods/tools.js"

// SCRAPER CONFIG

const dynamoScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 60000,
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
        url: "https://www.dynamo-eindhoven.nl/programma/?_sfm_fw%3Aopt%3Astyle=15",
        requiredProperties: ['venueEventUrl', 'title']
      }
    }
  }
}));

dynamoScraper.listenToMasterThread();

// MAKE BASE EVENTS

dynamoScraper.makeBaseEventList = async function () {

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  const rawEvents = await page.evaluate(
    () => {
      return Array.from(
        document.querySelectorAll(".search-filter-results .timeline-article")
      )
        .filter((baseEvent, index) => index % this.workerData.workerCount === this.workerData.index)
        .map((baseEvent) => {
          const venueEventUrl = baseEvent.querySelector("a")?.href ?? "";
          const title = baseEvent.querySelector("h4")?.textContent ?? "";
          const location = "dynamo";

          const timelineInfoContainerEl = baseEvent.querySelector(
            ".timeline-info-container"
          );

          let shortText = _t.killWhitespaceExcess(timelineInfoContainerEl?.querySelector("p")?.textContent ?? '');

          return {
            venueEventUrl,
            title,
            location,
            shortText
  
          };
        });
    },
    null
  );

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );

};

// GET PAGE INFO

dynamoScraper.getPageInfo = async function ({ page }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(
    ({ months }) => {
      const res = {
        unavailable: "",
        pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
        errorsVoorErrorHandler: [],
      };
      const agendaDatesEls = document.querySelectorAll(".agenda-date");
      res.baseDate = null;
      if (agendaDatesEls && agendaDatesEls.length > 1) {
        try {
          const dateMatch = document
            .querySelector(".event-content")
            ?.textContent.toLowerCase()
            .match(/(\d+)\s+\/\s+(\w+)\s+\/\s+(\d+)/);
          if (Array.isArray(dateMatch) && dateMatch.length === 4) {
            res.baseDate = `${dateMatch[3]}-${months[dateMatch[2]]}-${
              dateMatch[1]
            }`;
          }
        } catch (error) {
          res.errorsVoorErrorHandler.push({
            error,
            remarks: "datum match",
          });
        }

        const agendaTimeContext = agendaDatesEls[0].textContent.toLowerCase();
        res.startTimeMatch = agendaTimeContext.match(
          /(aanvang\sshow|aanvang|start\sshow|show)\W?\s+(\d\d:\d\d)/
        );
        res.doorTimeMatch = agendaTimeContext.match(
          /(doors|deuren|zaal\sopen)\W?\s+(\d\d:\d\d)/
        );
        res.endTimeMatch = agendaTimeContext.match(
          /(end|eind|einde|curfew)\W?\s+(\d\d:\d\d)/
        );

        try {
          if (!res.baseDate) {
            res.unavailable = "geen datum kunnen vinden";
            return res;
          }
          if (
            Array.isArray(res.doorTimeMatch) &&
            res.doorTimeMatch.length === 3
          ) {
            res.doorOpenDateTime = new Date(
              `${res.baseDate}T${res.doorTimeMatch[2]}:00`
            ).toISOString();
          }
          if (
            Array.isArray(res.startTimeMatch) &&
            res.startTimeMatch.length === 3
          ) {
            res.startDateTime = new Date(
              `${res.baseDate}T${res.startTimeMatch[2]}:00`
            ).toISOString();
          } else if (res.doorOpenDateTime) {
            res.startDateTime = res.doorOpenDateTime;
            res.doorOpenDateTime = "";
          }
          if (
            Array.isArray(res.endTimeMatch) &&
            res.endTimeMatch.length === 3
          ) {
            res.endDateTime = new Date(
              `${res.baseDate}T${res.endTimeMatch[2]}:00`
            ).toISOString();
          }
        } catch (error) {
          res.errorsVoorErrorHandler({
            error,
            remarks: `datum tijd match`,
          });
        }

        res.priceTextcontent = agendaDatesEls[1].textContent;
      }

      if (!res.startDateTime) {
        res.unavailable = `tijd en datum\n${res.startTimeMatch}\n${res.endTimeMatch}\n${res.doorTimeMatch}`;
      }

      res.longTextHTML = 
        document.querySelector("section.article .article-block")?.innerHTML ??
        "";

      res.image =
        document
          .querySelector(".dynamic-background-color#intro .color-pick")
          ?.style.backgroundImage.match(/(https.*\.jpg)/)
          ?.at(0)
          .replace("-500x500x", "") ?? "";

      if (res.unavailable) {
        res.unavailable = `${res.unavailable}\n${res.pageInfoID}`;
      }
      return res;
    },
    { months: dynamoMonths }
  );

  pageInfo.longTextHTML = _t.killWhitespaceExcess(pageInfo.longTextHTML);

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};
