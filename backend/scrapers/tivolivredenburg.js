import MusicEvent from "../mods/music-event.js";
import puppeteer from "puppeteer";
import { parentPort, workerData } from "worker_threads";
import EventsList from "../mods/events-list.js";
import fs from "fs";
import crypto from "crypto";
import fsDirections from "../mods/fs-directions.js";
import * as _t from "../mods/tools.js";
import { letScraperListenToMasterMessageAndInit } from "../mods/generic-scraper.js";
import { QuickWorkerMessage } from "../mods/rock-worker.js";
const qwm = new QuickWorkerMessage(workerData);
let browser = null;

letScraperListenToMasterMessageAndInit(scrapeTivolivredenburg);
async function scrapeTivolivredenburg() {
  browser = await puppeteer.launch();
  parentPort.postMessage(qwm.workerInitialized());
  Promise.race([makeBaseEventList(), _t.errorAfterSeconds(15000)])
    .then((baseMusicEvents) => {
      const baseMusicEventsCopy = [...baseMusicEvents];
      parentPort.postMessage(qwm.workerStarted());
      return processSingleMusicEvent(baseMusicEventsCopy);
    })
    .then(() => {
      parentPort.postMessage(qwm.workerDone(EventsList.amountOfEvents));
      EventsList.save(workerData.family, workerData.index);
    })
    .catch((error) =>
      _t.handleError(error, workerData, `outer catch scrape ${workerData.family}`)
    )
    .finally(() => {
      browser && browser.hasOwnProperty("close") && browser.close();
    });
}

async function processSingleMusicEvent(baseMusicEvents) {
  qwm.todo(baseMusicEvents.length).forEach((JSONblob) => {
    parentPort.postMessage(JSONblob);
  });

  const newMusicEvents = [...baseMusicEvents];
  const firstMusicEvent = newMusicEvents.shift();

  if (
    !firstMusicEvent ||
    baseMusicEvents.length === 0 ||
    !firstMusicEvent ||
    !firstMusicEvent.venueEventUrl
  ) {
    return true;
  }

  try {
    const pageInfo = await Promise.race([
      getPageInfo(firstMusicEvent.venueEventUrl),
      _t.errorAfterSeconds(15000),
    ]);

    if (pageInfo && (pageInfo.priceTextContent || pageInfo.priceContexttext)) {
      firstMusicEvent.price = _t.getPriceFromHTML(
        pageInfo.price,
        pageInfo.priceContexttext
      );
    }

    if (pageInfo && pageInfo.longTextHTML) {
      let uuid = crypto.randomUUID();
      const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;

      fs.writeFile(longTextPath, pageInfo.longTextHTML, "utf-8", () => {});
      pageInfo.longText = longTextPath;
    }

    if (pageInfo) {
      firstMusicEvent.merge(pageInfo);
      firstMusicEvent.registerIfValid();
    }
  } catch (error) {
    _t.handleError(error, workerData, "get page info fail");
  }

  return newMusicEvents.length
    ? processSingleMusicEvent(newMusicEvents)
    : browser;
}

async function getPageInfo(url) {
  const page = await browser.newPage();
  await page.goto(url, {
    waitUntil: "load",
  });
  return await page
    .evaluate(() => {
      const res = {};
      res.priceTextcontent =
        document.querySelector(".btn-group__price")?.textContent.trim() ?? null;
      res.priceContexttext =
        document.querySelector(".event-cta")?.textContent.trim() ?? null;
      res.longTextHTML =
        document.querySelector(".event__text")?.innerHTML ?? null;

      const startDateMatch = document.location.href.match(/\d\d-\d\d-\d\d\d\d/); //
      res.startDate = "";
      if (startDateMatch && startDateMatch.length) {
        res.startDate = startDateMatch[0].split("-").reverse().join("-");
      }

      if (!res.startDate || res.startDate.length < 7) {
        throw new Error(
          `Startdate mist / niet goed genoeg<br>${startDateMatch.join(
            "; "
          )}<br>${res.startDate}`
        );
      }
      const eventInfoDtDDText = document
        .querySelector(".event__info .description-list")
        ?.textContent.replace(/[\n\r\s]/g, "")
        .toLowerCase();
      res.startTime = null;
      res.openDoorTime = null;
      res.endTime = null;
      const openMatch = eventInfoDtDDText.match(/open.*(\d\d:\d\d)/);
      const startMatch = eventInfoDtDDText.match(/aanvang.*(\d\d:\d\d)/);
      const endMatch = eventInfoDtDDText.match(/einde.*(\d\d:\d\d)/);

      if (Array.isArray(openMatch) && openMatch.length > 1) {
        try {
          res.openDoorTime = openMatch[1];
          res.doorOpenDateTime = res.startDate
            ? new Date(`${res.startDate}T${res.openDoorTime}:00`).toISOString()
            : null;
        } catch (error) {
          const errorrrs = new Error(
            `Open door time faal. brontekst: ${eventInfoDtDDText} \n ${error.message}`
          );
          throw errorrrs;
        }
      }
      if (Array.isArray(startMatch) && startMatch.length > 1) {
        try {
          res.startTime = startMatch[1];
          res.startDateTime = res.startDate
            ? new Date(`${res.startDate}T${res.startTime}:00`).toISOString()
            : null;
        } catch (error) {
          const errorrrs = new Error(
            `start time faal. brontekst: ${eventInfoDtDDText} \n ${error.message}`
          );
          throw errorrrs;
        }
      }
      if (Array.isArray(endMatch) && endMatch.length > 1) {
        try {
          res.endTime = endMatch[1];
          res.endDateTime = res.startDate
            ? new Date(`${res.startDate}T${res.endTime}:00`).toISOString()
            : null;
        } catch (error) {
          const errorrrs = new Error(
            `end time faal. brontekst: ${eventInfoDtDDText} \n ${error.message}`
          );
          throw errorrrs;
        }
      }

      return res;
    }, null)
    .then((pageInfo) => {
      return pageInfo;
    })
    .catch((error) => {
      _t.handleError(
        error,
        workerData,
        `<a href='${url}'> get page info ${workerData.family}</a><br>`
      );
      return null;
    })
    .finally(() => {
      if (!page.isClosed() && page.close());
    });
}

async function makeBaseEventList() {
  const page = await browser.newPage();
  await page.goto(
    "https://www.tivolivredenburg.nl/agenda/?event_category=metal-punk-heavy",
    {
      waitUntil: "load",
    }
  );
  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".agenda-list-item"))
      .filter((eventEl, index) => {
        return index % 4 === workerIndex;
      })
      .map((eventEl) => {
        const res = {};
        res.title =
          eventEl
            .querySelector(".agenda-list-item__title")
            ?.textContent.trim() ?? null;
        res.shortText =
          eventEl
            .querySelector(".agenda-list-item__text")
            ?.textContent.trim() ?? null;
        res.image =
          eventEl
            .querySelector(".agenda-list-item__figure img")
            ?.src.replace(/-\d\d\dx\d\d\d.jpg/, ".jpg") ?? null;
        res.venueEventUrl = eventEl.querySelector(
          ".agenda-list-item__title-link"
        ).href;
        res.location = "tivolivredenburg";
        return res;
      });
  }, workerData.index);

  return rawEvents
    .filter(_t.basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}
