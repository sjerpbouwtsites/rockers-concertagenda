import MusicEvent from "../mods/music-event.js";
import { parentPort, workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./abstract-scraper.js";
import { gebrdenobelMonths } from "../mods/months.js";

// SCRAPER CONFIG

const scraperConfig = {
  baseEventTimeout: 15000,
  singlePageTimeout: 20000,
  maxExecutionTime: 30000,
  workerData: Object.assign({}, workerData),
};
const gebrdenobelScraper = new AbstractScraper(scraperConfig);

gebrdenobelScraper.listenToMasterThread();

// MAKE BASE EVENTS

gebrdenobelScraper.makeBaseEventList = async function () {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);
  const page = await this.browser.newPage();
  await page.goto("https://gebrdenobel.nl/programma/", {
    waitUntil: "domcontentloaded",
  });

  await _t.autoScroll(page);
  await _t.autoScroll(page);
  await _t.autoScroll(page);

  const rawEvents = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".event-item"))
      .filter((eventEl) => {
        const tags =
          eventEl.querySelector(".meta-tag")?.textContent.toLowerCase() ?? "";
        return (
          tags.includes("metal") ||
          tags.includes("punk") ||
          tags.includes("rock")
        );
      })
      .map((eventEl) => {
        const res = {};
        res.venueEventUrl =
          eventEl
            .querySelector(".jq-modal-trigger")
            ?.getAttribute("data-url") ?? "";

        res.title =
          eventEl.querySelector(".media-heading")?.textContent ?? null;
        res.location = "gebrdenobel";
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

// GET PAGE INFO

gebrdenobelScraper.getPageInfo = async function ({ page, url }) {
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
      const eventDataRows = Array.from(
        document.querySelectorAll(".event-table tr")
      );
      const dateRow = eventDataRows.find((row) =>
        row.textContent.toLowerCase().includes("datum")
      );
      const timeRow = eventDataRows.find(
        (row) =>
          row.textContent.toLowerCase().includes("open") ||
          row.textContent.toLowerCase().includes("aanvang")
      );
      const priceRow = eventDataRows.find((row) =>
        row.textContent.toLowerCase().includes("prijs")
      );
      if (dateRow) {
        const startDateMatch = dateRow.textContent.match(
          /(\d+)\s?(\w+)\s?(\d{4})/
        );
        if (Array.isArray(startDateMatch) && startDateMatch.length === 4) {
          const day = startDateMatch[1].padStart(2, "0");
          const month = months[startDateMatch[2]];
          const year = startDateMatch[3];
          res.month = startDateMatch[2];
          res.startDate = `${year}-${month}-${day}`;
        }

        if (!timeRow) {
          res.startDateTime = new Date(
            `${res.startDate}T00:00:00`
          ).toISOString();
        } else {
          const timeMatch = timeRow.textContent.match(/\d\d:\d\d/);
          if (Array.isArray(timeMatch) && timeMatch.length) {
            res.startDateTime = new Date(
              `${res.startDate}T${timeMatch[0]}:00`
            ).toISOString();
          } else {
            res.startDateTime = new Date(
              `${res.startDate}T00:00:00`
            ).toISOString();
          }
        }
      }

      if (priceRow) {
        res.priceTextcontent = priceRow.textContent;
      }
      res.shortText =
        document.querySelector(".hero-cta_left__text p")?.textContent ?? null;
      res.longTextHTML =
        document.querySelector(".js-contentBlocks")?.innerHTML ?? null;
      res.image = document.querySelector(".hero img")?.src ?? null;

      return res;
    },
    { months: gebrdenobelMonths }
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
