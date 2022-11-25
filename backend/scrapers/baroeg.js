import axios from "axios";
import MusicEvent from "../mods/music-event.js";
import puppeteer from "puppeteer";
import { parentPort, workerData } from "worker_threads";
import EventsList from "../mods/events-list.js";
import fs from "fs";
import crypto from "crypto";
import fsDirections from "../mods/fs-directions.js";
import * as _t from "../mods/tools.js";
import { baroegMonths } from "../mods/months.js";
import { letScraperListenToMasterMessageAndInit } from "../mods/generic-scraper.js";
import { QuickWorkerMessage } from "../mods/rock-worker.js";

letScraperListenToMasterMessageAndInit(scrapeBaroeg);

async function scrapeBaroeg() {
  const qwm = new QuickWorkerMessage(workerData);
  parentPort.postMessage(qwm.workerInitialized());

  const baseMusicEvents = await Promise.race([
    makeBaseEventList(),
    _t.errorAfterSeconds(10000),
  ]).catch((err) => _t.handleError(err, workerData, "base event race failure"));

  parentPort.postMessage(qwm.workerStarted());

  await fillMusicEvents(baseMusicEvents, baroegMonths, qwm);

  EventsList.save(workerData.family, workerData.index);
  parentPort.postMessage(qwm.workerDone(EventsList.amountOfEvents));
}

async function fillMusicEvents(baseMusicEvents, baroegMonths, qwm) {
  const browser = await puppeteer.launch();
  const baseMusicEventsCopy = [...baseMusicEvents];

  return processSingleMusicEvent(
    browser,
    baseMusicEventsCopy,
    baroegMonths,
    qwm
  )
    .finally(() => {
      browser.close();
      return true;
    })
    .catch((error) => {
      browser.close();
      _t.handleError(error, workerData);
    });
}

async function processSingleMusicEvent(
  browser,
  baseMusicEvents,
  baroegMonths,
  qwm
) {
  const newMusicEvents = [...baseMusicEvents];
  const firstMusicEvent = newMusicEvents.shift();

  qwm.todo(baseMusicEvents.length).forEach((JSONblob) => {
    parentPort.postMessage(JSONblob);
  });

  if (!firstMusicEvent || !firstMusicEvent.venueEventUrl) {
    return true;
  }
  if (!firstMusicEvent || baseMusicEvents.length === 0) {
    return true;
  }

  const page = await browser.newPage();
  await page.goto(firstMusicEvent.venueEventUrl, {
    waitUntil: "load",
    timeout: 0,
  });

  const pageInfo = await Promise.race([
    getPageInfo(page, baroegMonths),
    _t.errorAfterSeconds(15000),
  ]).catch((error) =>
    _t.handleError(error, workerData, "pageInfo race condition failed")
  );

  if (pageInfo && (pageInfo.priceElText || pageInfo.contextText)) {
    firstMusicEvent.price = _t.getPriceFromHTML(
      pageInfo.priceText,
      pageInfo.contextText
    );
    delete pageInfo.price;
  }

  // no date no registration.
  if (pageInfo && !pageInfo.cancelReason) {
    delete pageInfo.cancelReason;
    firstMusicEvent.merge(pageInfo);
  } else if (pageInfo.cancelReason !== "") {
    qwm.debugger({
      issue: `Incomplete info for ${firstMusicEvent.title}`,
      event: firstMusicEvent,
      pageInfo,
    });
  }

  firstMusicEvent.registerIfValid();

  return newMusicEvents.length
    ? processSingleMusicEvent(browser, newMusicEvents, baroegMonths, qwm)
    : true;
}

async function getPageInfo(page, months) {
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
    { months }
  );
  if (pageInfo.error) {
    _t.handleError(pageInfo.error, workerData, "getPageInfo");
  }
  return pageInfo;
}

async function makeBaseEventList() {
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
