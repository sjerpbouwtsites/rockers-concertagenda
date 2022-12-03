import { afasliveMonths } from "../mods/months.js";
import MusicEvent from "../mods/music-event.js";
import { parentPort, workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./abstract-scraper.js";

// SCRAPER CONFIG

const scraperConfig = {
  baseEventTimeout: 15000,
  singlePageTimeout: 20000,
  maxExecutionTime: 30000,
  workerData: Object.assign({}, workerData),
};
const afasliveScraper = new AbstractScraper(scraperConfig);

afasliveScraper.singleEventCheck = afasliveScraper.isRock;

afasliveScraper.listenToMasterThread();

// MAKE BASE EVENTS

afasliveScraper.makeBaseEventList = async function () {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);
  const page = await this.browser.newPage();
  await page.goto("https://www.afaslive.nl/agenda", {
    waitUntil: "load",
  });

  await _t.autoScroll(page);
  await _t.waitFor(750);
  parentPort.postMessage(this.qwm.messageRoll("na autoscroll 1"));
  await _t.autoScroll(page);
  await _t.waitFor(750);
  parentPort.postMessage(this.qwm.messageRoll("na autoscroll 2"));
  await _t.autoScroll(page);
  await _t.waitFor(750);
  parentPort.postMessage(this.qwm.messageRoll("na autoscroll 3"));
  await _t.autoScroll(page);
  await _t.waitFor(750);
  parentPort.postMessage(this.qwm.messageRoll("na autoscroll 4"));
  await _t.autoScroll(page);
  await _t.waitFor(750);
  parentPort.postMessage(this.qwm.messageRoll("na autoscroll 5"));
  await _t.autoScroll(page);

  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".agenda__item__block "))
      .filter((event, eventIndex) => {
        return (eventIndex + workerIndex) % 4 === 0;
      })
      .map((agendaBlock) => {
        const res = {};
        res.venueEventUrl = agendaBlock.querySelector("a")?.href ?? null;
        res.image = agendaBlock.querySelector("img")?.src ?? null;
        res.title = agendaBlock.querySelector(".eventTitle")?.textContent ?? "";
        res.location = "afaslive";
        return res;
      });
  }, workerData.index);

  clearTimeout(stopFunctie);
  !page.isClosed() && page.close();

  return rawEvents
    .map((event) => {
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

afasliveScraper.getPageInfo = async function ({ page, url }) {
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

      const startDateMatch =
        document
          .querySelector(".eventTitle")
          ?.parentNode.querySelector("time")
          ?.textContent.match(/(\d+)\s+(\w+)\s+(\d\d\d\d)/) ?? null;
      if (
        startDateMatch &&
        Array.isArray(startDateMatch) &&
        startDateMatch.length > 3
      ) {
        res.startDate = `${startDateMatch[3]}-${months[startDateMatch[2]]}-${
          startDateMatch[1]
        }`;
      }

      const startEl = document.querySelector(
        ".eventInfo .tickets ~ p.align-mid ~ p.align-mid"
      );
      if (startEl) {
        const startmatch = startEl.textContent.match(/\d\d:\d\d/);
        if (startmatch) {
          res.startTime = startmatch[0];
        }
      }

      const doorEl = document.querySelector(
        ".eventInfo .tickets ~ p.align-mid"
      );
      if (doorEl) {
        const doormatch = doorEl.textContent.match(/\d\d:\d\d/);
        if (doormatch) {
          res.doorTime = doormatch[0];
        }
      }

      try {
        if (res.startTime) {
          res.startDateTime = new Date(
            `${res.startDate}T${res.startTime}:00`
          ).toISOString();
        }

        if (res.doorTime) {
          res.doorOpenDateTime = new Date(
            `${res.startDate}T${res.doorTime}:00`
          ).toISOString();
        }
      } catch (error) {
        res.errorsVoorErrorHandler.push({
          error,
          remarks: `error samen time en date ${res.startDate}T${res.startTime}:00 ${res.startDate}T${res.doorTime}:00`,
        });
      }
      if (!res.startDateTime) {
        res.unavailable += " geen startDateTime";
      }

      res.longTextHTML =
        document.querySelector("article .wysiwyg")?.innerHTML ?? null;

      res.priceTextcontent =
        document.querySelector("#tickets")?.textContent.trim() ?? null;
      return res;
    },
    { months: afasliveMonths }
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
