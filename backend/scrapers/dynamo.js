import { dynamoMonths } from "../mods/months.js";
import MusicEvent from "../mods/music-event.js";
import { parentPort, workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./abstract-scraper.js";

// SCRAPER CONFIG

const scraperConfig = {
  baseEventTimeout: 35000,
  singlePageTimeout: 25000,
  workerData: Object.assign({}, workerData),
};
const dynamoScraper = new AbstractScraper(scraperConfig);

dynamoScraper.listenToMasterThread();

// MAKE BASE EVENTS

dynamoScraper.makeBaseEventList = async function () {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTimethis} voorbij `
    );
  }, this.maxExecutionTime);
  const page = await this.browser.newPage();
  await page.goto(
    "https://www.dynamo-eindhoven.nl/programma/?_sfm_fw%3Aopt%3Astyle=15"
  );
  const rawEvents = await page.evaluate(
    ({ months, workerIndex }) => {
      return Array.from(
        document.querySelectorAll(".search-filter-results .timeline-article")
      )
        .filter((baseEvent, index) => {
          return (index + workerIndex) % 2 === 0;
        })
        .map((baseEvent) => {
          const venueEventUrl = baseEvent.querySelector("a")?.href ?? "";
          const title = baseEvent.querySelector("h4")?.textContent ?? "";
          const location = "dynamo";

          const timelineInfoContainerEl = baseEvent.querySelector(
            ".timeline-info-container"
          );
          let shortText, dateDay, dateMonth, dateYear;
          if (timelineInfoContainerEl) {
            shortText = timelineInfoContainerEl.querySelector("p").textContent;
            const dateBasis =
              timelineInfoContainerEl.querySelector(".date").textContent;
            const dateSplit = dateBasis.split("/").map((str) => str.trim());
            if (dateSplit.length < 3) {
              return;
            }
            dateDay = dateSplit[0].replace(/\D/g, "");
            dateMonth = months[dateSplit[1].trim()];
            dateYear = dateSplit[2];
          }
          return {
            venueEventUrl,
            title,
            location,
            shortText,
            dateDay,
            dateMonth,
            dateYear,
          };
        });
    },
    { months: dynamoMonths, workerIndex: workerData.index }
  );
  clearTimeout(stopFunctie);
  !page.isClosed() && page.close();

  return rawEvents
    .map((event) => {
      const baseDate = `${event.dateYear}-${event.dateMonth}-${event.dateDay}`;
      event.startDateTime = new Date(baseDate).toISOString();
      (!event.venueEventUrl || !event.title) &&
        parentPort.postMessage(
          this.qwm.messageRoll(
            `Red het niet: <a href='${event.venueEventUrl}'>${event.title}</a> ongeldig.`
          )
        );
      return event;
    })
    .filter(_t.basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
};

// GET PAGE INFO

dynamoScraper.getPageInfo = async function ({ page, url }) {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `getPageInfo is de max tijd voor zn functie ${this.maxExecutionTimethis} voorbij `
    );
  }, this.maxExecutionTime);
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
        const leftHandSideTableTRs = agendaDatesEls[0].querySelectorAll("tr");
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

      if (!!res.unavailable) {
        res.unavailable = `${res.unavailable}\n${res.pageInfoID}`;
      }
      return res;
    },
    { months: dynamoMonths }
  );

  clearTimeout(stopFunctie);
  !page.isClosed() && page.close();
  if (!pageInfo) {
    return {
      unavailable: `Geen resultaat <a href="${url}">van pageInfo</a>`,
    };
  }
  return pageInfo;
};
