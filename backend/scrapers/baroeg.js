import axios from "axios";
import MusicEvent from "../mods/music-event.js";
import { parentPort, workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import { baroegMonths } from "../mods/months.js";
import AbstractScraper from "./abstract-scraper.js";

// SCRAPER CONFIG

const scraperConfig = {
  baseEventTimeout: 10000,
  singlePageTimeout: 15000,
  maxExecutionTime: 45000,
  workerData: Object.assign({}, workerData),
};
const baroegScraper = new AbstractScraper(scraperConfig);
baroegScraper.listenToMasterThread();

// MAKE BASE EVENTS

baroegScraper.makeBaseEventList = async function () {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);
  const baroegLijst = await axios
    .get(
      `https://baroeg.nl/wp-json/wp/v2/wp_theatre_prod?_embed&per_page=10&offset=${
        workerData.index * 10
      }&modified_after=2022-10-01T00:00:00Z`
    )
    .then((response) => {
      return response.data;
    })
    .catch((response) => {
      _t.handleError(
        response,
        workerData,
        "axios get baroeg wp json fail makeBaseEventList"
      );
      errorMan = true;
    });

  if (!baroegLijst) return [];

  const rawEvents = baroegLijst.map((event, index) => {
    const res = {};
    res.title = event.title.rendered;
    res.shortText = event.excerpt.rendered;
    res.location = "baroeg";
    res.longText = event?.content?.rendered;
    res.image =
      event?._embedded?.[
        "wp:featuredmedia"
      ][0]?.media_details?.sizes?.medium_large?.source_url;
    res.venueEventUrl = event?.link;
    return res;
  });

  clearTimeout(stopFunctie);

  return rawEvents
    .filter(_t.basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
};

// GET PAGE INFO

baroegScraper.getPageInfo = async function ({ page, url }) {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTimethis} voorbij `
    );
  }, this.maxExecutionTime);

  const pageInfo = await page.evaluate(
    ({ baroegMonths }) => {
      const res = {
        unavailable: null,
        pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
      };
      const ticketsEl = document.querySelector(".wp_theatre_event_tickets");
      if (!ticketsEl) {
        res.unavailable = `Geen kaarten beschikbaar voor ${res.pageInfoID}`;
      }

      const startDateEl = document.querySelector(".wp_theatre_event_startdate");
      if (!startDateEl) {
        res.unavailable = `${res.unavailable ?? ""} no start date found for ${
          res.pageInfoID
        }<br>`;
      }
      const startDateMatch =
        document
          .querySelector(".wp_theatre_event_startdate")
          ?.textContent.toLowerCase()
          .match(/(\w+)\s+(\d{1,2}).+(\d{4})/) ?? null;
      let startTime = document
        .querySelector(".wp_theatre_event_starttime")
        ?.textContent.toLowerCase()
        .trim();

      if (
        !Array.isArray(startDateMatch) ||
        startDateMatch.length < 4 ||
        !startTime
      ) {
        res.unavailable = `${
          res.unavailable ?? ""
        } incorrect startDate for <a href='${document.location.href}'>${
          document.title
        }</a><br>`;
      } else {
        let [, monthName, day, year] = startDateMatch;
        let month = baroegMonths[monthName];
        day = day.padStart(2, "0");

        startTime = startTime.padStart(5, "0");
        res.startDateTime = new Date(
          `${year}-${month}-${day}T${startTime}:00`
        ).toISOString();
      }

      res.priceElText =
        document.querySelector(".wp_theatre_event_tickets_url")?.textContent ??
        null;
      res.contextText = document.getElementById("content")?.textContent ?? null;

      return res;
    },
    { baroegMonths }
  );

  clearTimeout(stopFunctie);

  if (!pageInfo) {
    return {
      unavailable: `Geen resultaat <a href="${url}">van pageInfo</a>`,
    };
  }

  if (pageInfo?.error) {
    page.unavailable = `Dikke error bij href="${url}">van pageInfo</a>`;
    _t.handleError(page.error, workerData);
  }

  return pageInfo;
};


