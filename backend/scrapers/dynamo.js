import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

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
    ({workerData}) => {
      return Array.from(
        document.querySelectorAll(".search-filter-results .timeline-article")
      )
        .filter((baseEvent, index) => index % workerData.workerCount === workerData.index)
        .map((baseEvent) => {

          const title = baseEvent.querySelector("h4")?.textContent ?? "";
          const res = {
            unavailable: "",
            pageInfo: `<a href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
            errors: [],          
            title
          }

          res.venueEventUrl = baseEvent.querySelector("a")?.href ?? "";
          
          const timelineInfoContainerEl = baseEvent.querySelector(
            ".timeline-info-container"
          );
          res.shortText = timelineInfoContainerEl?.querySelector("p")?.textContent ?? '';

          res.soldOut = !!(baseEvent.querySelector(".sold-out") ?? null)
          return res;
        });
    },
    {workerData}
  );

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );

};

// GET PAGE INFO

dynamoScraper.getPageInfo = async function ({ page, event}) {
  
  const {stopFunctie} =  await this.getPageInfoStart()
  
  const pageInfo = await page.evaluate(
    ({ months, event}) => {
      const res = {
        unavailable: event.unavailable,
        pageInfo: `<a href='${document.location.href}'>${document.title}</a>`,
        errors: [],
      };
      const agendaDatesEls = document.querySelectorAll(".agenda-date");
      let baseDate = null;
      if (agendaDatesEls && agendaDatesEls.length < 2) {
        res.unavailable += `Te weinig 'agendaDataEls' ${event.title}`
        res.errors.push({error: new Error('HTML parsing error'), remarks: `Te weinig 'agendaDataEls' ${event.title}`})
        return res;
      }
      try {
        const dateMatch = document
          .querySelector(".event-content")
          ?.textContent.toLowerCase()
          .match(/(\d+)\s+\/\s+(\w+)\s+\/\s+(\d+)/);
        if (Array.isArray(dateMatch) && dateMatch.length === 4) {
          baseDate = `${dateMatch[3]}-${months[dateMatch[2]]}-${
            dateMatch[1]
          }`;
        }
        if (!baseDate){throw Error('geen base date')}
      } catch (caughtError) {
        res.errors.push({
          error: caughtError,
          remarks: `datum match faal ${event.title}`,
        });
        res.unavailable += 'Datum match mislukt';
        return res;
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
        if (
          Array.isArray(res.doorTimeMatch) &&
            res.doorTimeMatch.length === 3
        ) {
          res.doorOpenDateTime = new Date(
            `${baseDate}T${res.doorTimeMatch[2]}:00`
          ).toISOString();
        }
        if (
          Array.isArray(res.startTimeMatch) &&
            res.startTimeMatch.length === 3
        ) {
          res.startDateTime = new Date(
            `${baseDate}T${res.startTimeMatch[2]}:00`
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
            `${baseDate}T${res.endTimeMatch[2]}:00`
          ).toISOString();
        }
      } catch (caughtError) {
        res.errors.push({
          error: caughtError,
          remarks: `tijd matches samen met tijden voegen ${event.title}`,
        });
      }

      res.priceTextcontent = agendaDatesEls[1].textContent;
      
      res.longTextHTML = 
        document.querySelector("section.article .article-block")?.innerHTML ??
        "";

      res.image =
        document
          .querySelector(".dynamic-background-color#intro .color-pick")
          ?.style.backgroundImage.match(/(https.*\.jpg)/)
          ?.at(0)
          .replace("-500x500x", "") ?? "";

      return res;
    },
    { months: this.months, event }
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};
