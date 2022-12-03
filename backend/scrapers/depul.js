import MusicEvent from "../mods/music-event.js";
import { parentPort, workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./abstract-scraper.js";
import { depulMonths } from "../mods/months.js";

// SCRAPER CONFIG

const scraperConfig = {
  baseEventTimeout: 35000,
  singlePageTimeout: 25000,
  workerData: Object.assign({}, workerData),
};
const depulScraper = new AbstractScraper(scraperConfig);

depulScraper.listenToMasterThread();

// MAKE BASE EVENTS

depulScraper.makeBaseEventList = async function () {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);
  const page = await this.browser.newPage();
  await page.goto("https://www.livepul.com/agenda/", {
    waitUntil: "load",
  });

  await page.evaluate(() => {
    // hack op site
    loadContent("all", "music");
  });

  await _t.waitFor(250);

  let rawEvents = await page.evaluate(
    ({ months, workerIndex }) => {
      return (
        Array.from(document.querySelectorAll(".agenda-item"))
          .filter((rawEvent, eventIndex) => {
            return eventIndex % 2 === workerIndex;
          })
          .map((rawEvent) => {
            const title =
              rawEvent.querySelector("h2")?.textContent.trim() ?? "";
            const shortText =
              rawEvent.querySelector(".text-box .desc")?.textContent.trim() ??
              "";
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
            const startDate = `${startYear}-${startMonth}-${startDay}`;
            const venueEventUrl = rawEvent.querySelector("a")?.href ?? null;

            const imageMatch =
              rawEvent
                .querySelector("a")
                ?.getAttribute("style")
                .match(/url\(\'(.*)\'\)/) ?? null;
            let image;
            if (
              imageMatch &&
              Array.isArray(imageMatch) &&
              imageMatch.length === 2
            ) {
              image = imageMatch[1];
            }

            return {
              image,
              venueEventUrl,
              location: "depul",
              title,
              startDate,
              shortText,
            };
          })
      );
    },
    { months: depulMonths, workerIndex: workerData.index }
  );

  clearTimeout(stopFunctie);
  !page.isClosed() && page.close();

  this.dirtyLog(rawEvents);
  return rawEvents
    .map((event) => {
      !event.venueEventUrl &&
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

depulScraper.getPageInfo = async function ({ page, url }) {
  parentPort.postMessage(this.qwm.messageRoll(`get ${url}`));

  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);
  const pageInfo = await page.evaluate(
    ({ months }) => {
      const res = {
        unavailable: "",
        pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
        errorsVoorErrorHandler: [],
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
          res.longTextHTML = contentBox.innerHTML;
        }
      } catch (error) {
        res.errorsVoorErrorHandler.push({
          error,
          remarks: "longTextHTML",
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
              }
            } catch (error) {
              res.errorsVoorErrorHandler({ error, remarks: "startDate" });
            }
          } else if (lowerCaseTextContent.includes("aanvang")) {
            if (!res.startDate) {
              return;
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
            } catch (error) {
              res.errorsVoorErrorHandler({
                error,
                remarks: "startDateTime en startDate",
              });
            }
          } else if (lowerCaseTextContent.includes("open")) {
            if (!res.startDate) {
              return;
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
            } catch (error) {
              res.errorsVoorErrorHandler({
                error,
                remarks: "doorDateTime en startDate",
              });
            }
          }
          if (!res.startDateTime && res.doorOpenDateTime) {
            res.startDateTime = res.doorOpenDateTime;
            res.doorOpenDateTime = null;
          }
        });
      if (!res.startDateTime) {
        res.unavailable += " geen start date time";
      }
      if (!!res.unavailable) {
        res.unavailable += `${res.unavailable}\n${res.pageInfoID}`;
      }
      return res;
    },
    { months: depulMonths }
  );

  this.dirtyLog(pageInfo);

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
    const uuu = new URL(url);
    return {
      unavailable: `Geen resultaat <a href="${uuu}">van pageInfo</a>`,
    };
  }
  return pageInfo;
};

// async function eventAsyncCheck(
//   eventGen,
//   currentEvent = null,
//   checkedEvents = []
// ) {
//   const firstCheckText = `${currentEvent?.title ?? ""} ${
//     currentEvent?.shortText ?? ""
//   }`;
//   if (
//     firstCheckText.includes("metal") ||
//     firstCheckText.includes("punk") ||
//     firstCheckText.includes("punx") ||
//     firstCheckText.includes("noise") ||
//     firstCheckText.includes("industrial")
//   ) {
//     currentEvent.passReason = `title and/or short text genre match`;
//     checkedEvents.push(currentEvent);
//   } else {
//     const tempPage = await browser.newPage();
//     await tempPage.goto(currentEvent.venueEventUrl, {
//       waitUntil: "load",
//     });

//     const rockMetalOpPagina = await tempPage.evaluate(() => {
//       const tc =
//         document.getElementById("content-box")?.textContent.toLowerCase() ?? "";
//       return (
//         tc.includes("metal") ||
//         tc.includes("punk") ||
//         tc.includes("thrash") ||
//         tc.includes("punx") ||
//         tc.includes("noise") ||
//         tc.includes("industrial")
//       );
//     });

//     if (rockMetalOpPagina) {
//       currentEvent.passReason = `Page of event contained genres`;
//       checkedEvents.push(currentEvent);
//     }

//     await tempPage.close();
//   }

//   const nextEvent = eventGen.next().value;
//   if (nextEvent) {
//     return eventAsyncCheck(eventGen, nextEvent, checkedEvents);
//   } else {
//     return checkedEvents;
//   }
// }

// function* eventGenerator(baseMusicEvents) {
//   while (baseMusicEvents.length) {
//     yield baseMusicEvents.shift();
//   }
// }
