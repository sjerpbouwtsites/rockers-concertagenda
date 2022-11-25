import axios from "axios";
import MusicEvent from "../mods/music-event.js";
import { parentPort, workerData } from "worker_threads";
import fs from "fs";
import crypto from "crypto";
import fsDirections from "../mods/fs-directions.js";
import * as _t from "../mods/tools.js";
import { baroegMonths } from "../mods/months.js";
import AbstractScraper from "./abstract-scraper.js";


const scraperConfig = {
  baseEventTimeout: 10000,
  singlePageTimeout: 15000,
  workerData: Object.assign({}, workerData)
}
const baroegScraper = new AbstractScraper(scraperConfig)
baroegScraper.listenToMasterThread();

baroegScraper.getPageInfo = async function({page, url, self}) {
  let pageInfo = {};
  pageInfo.cancelReason = "";

  pageInfo = await page.evaluate(
    ({ months }) => {
      const ticketsEl = document.querySelector(".wp_theatre_event_tickets");

      if (!ticketsEl) {
        return {
          cancelReason: "no tickets available",
        };
      }

      const startDateEl = document.querySelector(".wp_theatre_event_startdate");
      if (!startDateEl) {
        return {
          cancelReason: "no start date found",
        };
      }
      let startDateTime = null;
      let dateError = null;
      try {
        if (!!startDateEl) {
          let startDateSplit = startDateEl?.textContent
            .replace(",", "")
            .trim()
            .split(" ");
          if (startDateSplit.length > 2) {
            const startYear = startDateSplit[2];
            const startDay = startDateSplit[1].padStart(2, "0");
            const monthSplicesOf = startDateSplit[0];
            const startMonth = months[monthSplicesOf];
            const startDate = `${startYear}-${startMonth}-${startDay}`;
            const startTime = document
              .querySelector(".wp_theatre_event_starttime")
              .textContent.trim();
            startDateTime = new Date(`${startDate}T${startTime}`).toISOString();
          }
        }
      } catch (error) {
        dateError = error;
        dateError.message = `date html basis: ${startDateEl?.textContent}\n${dateError.message}`;
      }

      const priceElText =
        document.querySelector(".wp_theatre_event_tickets_url")?.textContent ??
        null;
      const contextText =
        document.getElementById("content")?.textContent ?? null;

      return {
        priceElText,
        startDateTime,
        contextText,
        error: dateError,
      };
    },
    { months: baroegMonths }
  );
  if (pageInfo.error) {
    _t.handleError(pageInfo.error, workerData, "getPageInfo");
  }
  return pageInfo;
}

baroegScraper.makeBaseEventList = async function () {
  let errorMan = false;
  const baroegLijst = await axios
    .get(
      `https://baroeg.nl/wp-json/wp/v2/wp_theatre_prod?_embed&per_page=10&offset=${
        workerData.index * 10
      }&modified_after=2022-06-01T00:00:00Z`
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

  if (errorMan) {
    return [];
  }

  const musicEvents = baroegLijst
    .map((event, index) => {
      delete event.yoast_head;
      delete event.yoast_head_json;

      const musicEventConf = {};
      musicEventConf.title = event.title.rendered;
      musicEventConf.shortText = event.excerpt.rendered;
      if (!event._embedded) {
        const title = event?.title?.rendered ?? "";
        const url = event?.link ?? "";
        const eeerrr = new Error(`Event zonder _embedded. ${title} ${url}`);
        _t.handleError(
          eeerrr,
          workerData,
          "baroeg map over wpjson events makeBaseEventList"
        );
        return null;
      }
      if (
        event._embedded["wp:featuredmedia"] &&
        event._embedded["wp:featuredmedia"].length
      ) {
        const fm0 = event._embedded["wp:featuredmedia"][0];
        musicEventConf.image =
          fm0?.media_details?.sizes?.medium_large?.source_url ??
          fm0?.media_details?.sizes?.thumbnail?.source_url;
        musicEventConf.venueEventUrl = event.link;
        musicEventConf.location = "baroeg";
        let uuid = crypto.randomUUID();
        const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;

        fs.writeFile(longTextPath, event.content.rendered, "utf-8", () => {});
        musicEventConf.longText = longTextPath;
      }
      return new MusicEvent(musicEventConf);
    })
    .filter(_t.basicMusicEventsFilter);
  return musicEvents;
}
