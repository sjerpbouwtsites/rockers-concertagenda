import { bibelotMonths } from "../mods/months.js";
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
const bibelotScraper = new AbstractScraper(scraperConfig);

bibelotScraper.listenToMasterThread();

// MAKE BASE EVENTS

bibelotScraper.makeBaseEventList = async function () {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);
  const page = await this.browser.newPage();
  await page.goto("https://bibelot.net/", {
    waitUntil: "load",
  });
  const rawEvents = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll(
        '.event[class*="metal"], .event[class*="punk"], .event[class*="rock"]'
      )
    ).map((eventEl) => {
      const res = {};
      res.title = eventEl.querySelector("h1")?.textContent.trim() ?? "";
      const shortTextEl = eventEl.querySelector("h1")?.parentNode;
      const shortTextSplit = !!shortTextEl
        ? shortTextEl.textContent.split(res.title)
        : null;
      res.shortText = !!shortTextSplit ? shortTextSplit[1] : "";
      res.venueEventUrl = eventEl.querySelector(".link")?.href ?? null;
      res.location = "bibelot";

      return res;
    });
  });
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

// GET PAGE INFO

bibelotScraper.getPageInfo = async function ({ page, url }) {
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

      let baseDateM;
      try {
        baseDateM = document
          .querySelector(".main-column h3")
          ?.textContent.toLowerCase()
          .match(/(\d+)\s(\w+)\s(\d{4})/);
      } catch (error) {
        res.errorsVoorErrorHandler.push({
          error,
          remarks: "base date match fout",
        });
      }
      if (!Array.isArray(baseDateM) || baseDateM.length < 4) {
        res.unavailable = `geen datum match uit ${
          document.querySelector(".main-column h3")?.textContent
        }`;
      } else {
        res.baseDate = `${baseDateM[3]}-${
          months[baseDateM[2]]
        }-${baseDateM[1].padStart(2, "0")}`;
      }

      if (!res.baseDate) {
        res.unavailable += " geen base date";
        return res;
      }

      res.eventMetaColomText;
      try {
        res.eventMetaColomText = document
          .querySelector(".meta-colom")
          ?.textContent.toLowerCase()
          .replace(/\t{2,100}/g, "")
          .replace(/\n{2,100}/g, "\n"); // @TODO door hele app verwerken

        res.startTimeMatch = res.eventMetaColomText.match(
          /(aanvang\sshow|aanvang|start\sshow|show)\W?\s+(\d\d:\d\d)/
        );
        res.doorTimeMatch = res.eventMetaColomText.match(
          /(doors|deuren|zaal\sopen)\W?\s+(\d\d:\d\d)/
        );
        res.endTimeMatch = res.eventMetaColomText.match(
          /(end|eind|einde|curfew)\W?\s+(\d\d:\d\d)/
        );
      } catch (error) {
        res.unavailable += `tijd matches errors in ${res.eventMetaColomText}`;
      }

      try {
        if (Array.isArray(res.doorTimeMatch) && res.doorTimeMatch.length > 2) {
          res.doorOpenDateTime = new Date(
            `${res.baseDate}T${res.doorTimeMatch[2]}:00`
          ).toISOString();
        }
      } catch (error) {
        res.errorsVoorErrorHandler({
          error,
          remarks: "door open time match met basedate",
        });
      }
      try {
        if (
          Array.isArray(res.startTimeMatch) &&
          res.startTimeMatch.length > 2
        ) {
          res.startDateTime = new Date(
            `${res.baseDate}T${res.startTimeMatch[2]}:00`
          ).toISOString();
        } else if (res.doorOpenDateTime) {
          res.startDateTime = res.doorOpenDateTime;
          res.doorOpenDateTime = "";
        }
      } catch (error) {
        res.errorsVoorErrorHandler.push({
          error,
          remarks: "start time match met basedate",
        });
      }
      try {
        if (Array.isArray(res.endTimeMatch) && res.endTimeMatch.length > 2) {
          res.endDateTime = new Date(
            `${res.baseDate}T${res.endTimeMatch[2]}:00`
          ).toISOString();
        }
      } catch (error) {
        res.errorsVoorErrorHandler.push({
          error,
          remarks: "end time match met basedate",
        });
      }

      if (!res.startDateTime) {
        res.unavailable = "geen start date time";
      }

      const verkoopElAr = Array.from(
        document.querySelectorAll(".meta-info")
      ).filter((metaInfo) => {
        return metaInfo?.textContent.toLowerCase().includes("verkoop");
      });

      if (verkoopElAr && Array.isArray(verkoopElAr) && verkoopElAr.length) {
        res.priceTextcontent = verkoopElAr[0].textContent;
      }

      res.longTextHTML =
        document
          .querySelector(".main-column .content")
          ?.innerHTML.replace(/\t{2,100}/g, "")
          .replace(/\n{2,100}/g, "\n") ?? null;
      const imageMatch = document
        .querySelector(".achtergrond-afbeelding")
        ?.style.backgroundImage.match(/https.*.jpg|https.*.jpg/);
      if (imageMatch && imageMatch.length) {
        res.image = imageMatch[0];
      }
      if (!!res.unavailable) {
        res.unavailable = `${res.unavailable}\n${res.pageInfoID}`;
      }
      return res;
    },
    { months: bibelotMonths }
  );

  this.dirtyLog(pageInfo, "log");

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
