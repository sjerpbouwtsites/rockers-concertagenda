import axios from "axios";
import MusicEvent from "./music-event.js";
import puppeteer from "puppeteer";
import { parentPort, workerData } from "worker_threads";
import EventsList from "./events-list.js";
import fs from "fs";
import crypto from "crypto";
import fsDirections from "./fs-directions.js";
import {
  getPriceFromHTML,
  handleError,
  basicMusicEventsFilter,
  errorAfterSeconds,
} from "./tools.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";
import { QuickWorkerMessage } from "./rock-worker.js";

letScraperListenToMasterMessageAndInit(scrapeInit);

async function scrapeInit() {
  const qwm = new QuickWorkerMessage(workerData);
  parentPort.postMessage(qwm.workerInitialized());
  const browser = await puppeteer.launch();

  Promise.race([makeBaseEventList(browser), errorAfterSeconds(15000)])
    .then((baseMusicEvents) => {
      parentPort.postMessage(qwm.workerStarted());
      const baseMusicEventsCopy = [...baseMusicEvents];
      return processSingleMusicEvent(browser, baseMusicEventsCopy, qwm);
    })
    .then((browser) => {
      parentPort.postMessage(qwm.workerDone(EventsList.amountOfEvents));
      EventsList.save(workerData.family, workerData.index);
      browser && browser.hasOwnProperty("close") && browser.close();
    })
    .catch((error) => handleError(error, workerData, "outer catch scrape 013"));
}

async function processSingleMusicEvent(browser, baseMusicEvents, qwm) {
  qwm.todo(baseMusicEvents.length).forEach((JSONblob) => {
    parentPort.postMessage(JSONblob);
  });

  const newMusicEvents = [...baseMusicEvents];
  const firstMusicEvent = newMusicEvents.shift();

  if (
    !firstMusicEvent ||
    baseMusicEvents.length === 0 ||
    !firstMusicEvent ||
    typeof firstMusicEvent === "undefined"
  ) {
    return browser;
  }

  const page = await browser.newPage();
  await page.goto(firstMusicEvent.venueEventUrl, {
    waitUntil: "load",
    timeout: 0,
  });

  try {
    const pageInfo = await Promise.race([
      getPageInfo(page),
      errorAfterSeconds(25000),
    ]).catch((err) =>
      handleError(err, workerData, "patronaar pageinfo racecondition fail")
    );
    if (!pageInfo.hasOwnProperty("startDateTime") || !pageInfo.startDateTime) {
      return processSingleMusicEvent(browser, newMusicEvents, qwm);
    }

    if (pageInfo && pageInfo.price) {
      firstMusicEvent.price = getPriceFromHTML(pageInfo.price);
      delete pageInfo.price;
    }

    if (pageInfo && pageInfo.longTextHTML) {
      let uuid = crypto.randomUUID();
      const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;

      fs.writeFile(longTextPath, pageInfo.longTextHTML, "utf-8", () => {});
      pageInfo.longText = longTextPath;
    }

    // no date no registration.
    if (pageInfo && !pageInfo.cancelReason) {
      delete pageInfo.cancelReason;
      firstMusicEvent.merge(pageInfo);
    } else if (pageInfo.cancelReason !== "") {
      qwm.debugger({
        text: `Incomplete info for ${firstMusicEvent.title}`,
        event: firstMusicEvent,
      });
    }
    firstMusicEvent.registerIfValid();
  } catch (error) {
    handleError(error, workerData, "process single event try fail");
  }

  return newMusicEvents.length
    ? processSingleMusicEvent(browser, newMusicEvents, qwm)
    : browser;
}

async function getPageInfo(page, months) {
  let pageInfo = {};
  pageInfo.cancelReason = "";
  try {
    pageInfo = await page.evaluate(
      ({ months }) => {
        let priceEl = document.querySelector(".event__info-bar--ticket-price");
        let errors = [];
        let priceTextcontent;
        if (!!priceEl) {
          priceTextcontent = priceEl.textContent;
        }
        let startDatum = "";
        let startDatumMatch = document.location.href.match(
          /(\d\d)\-(\d\d)\-(\d\d)/
        );
        if (startDatumMatch && startDatumMatch.length > 3) {
          const j = `20${startDatumMatch[3]}`;
          const m = startDatumMatch[2];
          const d = startDatumMatch[1];
          startDatum = `${j}-${m}-${d}`;
        }

        let startDateTime;
        try {
          const startEl = document.querySelector(
            ".event__info-bar--start-time"
          );
          let startTime;
          if (!!startEl && !!startDatum) {
            const match = startEl.textContent.trim().match(/(\d\d)[\:]+(\d\d)/);
            if (match && match.length) {
              startTime = match[0];
              startDateTime = new Date(
                `${startDatum}T${startTime}:00`
              ).toISOString();
            }
          }
        } catch (error) {
          errors.push(error);
        }

        let doorOpenDateTime;
        try {
          const doorsEl = document.querySelector(
            ".event__info-bar--doors-open"
          );
          let doorsTime;
          if (!!doorsEl) {
            const match = doorsEl.textContent.trim().match(/(\d\d)[\:]+(\d\d)/);
            if (match && match.length) {
              doorsTime = match[0];
              doorOpenDateTime = new Date(
                `${startDatum}T${doorsTime}:00`
              ).toISOString();
            }
          }
        } catch (error) {
          errors.push(error);
        }

        let endDateTime;
        try {
          const endEl = document.querySelector(".event__info-bar--end-time");
          let endTime;
          if (!!endEl) {
            const match = endEl.textContent.trim().match(/(\d\d)[\:]+(\d\d)/);
            if (match && match.length) {
              endTime = match[0];
              endDateTime = new Date(`${startDatum}T${endTime}:00`);
              if (endDateTime < startDateTime) {
                endDateTime.setDate(startDateTime.getDate() + 1);
                endDateTime.setHours(startDateTime.getHours());
                endDateTime.setMinutes(startDateTime.getMinutes());
              }
            }
          }
          endDateTime = endDateTime.toISOString();
        } catch (error) {
          errors.push(error);
        }

        const longTextHTMLEl = document.querySelector(".event__content");
        let longTextHTML = null;
        if (longTextHTMLEl) {
          longTextHTML = longTextHTMLEl.innerHTML;
        }

        return {
          priceTextcontent,
          startDateTime,
          startDatumMatch,
          doorOpenDateTime,
          endDateTime,
          startDatum,
          longTextHTML,
        };
      },
      { months }
    );
    !page.isClosed() && page.close();
    return pageInfo;
  } catch (error) {
    handleError(error, workerData, "page info outer try wrapper");
    !page.isClosed() && page.close();
    return pageInfo;
  }
}

async function makeBaseEventList(browser) {
  const page = await browser.newPage();
  await page.goto(
    "https://patronaat.nl/programma/?type=event&s=&eventtype%5B%5D=84",
    {
      waitUntil: "load",
    }
  );
  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".overview__list-item--event"))
      .filter((eventEl, index) => {
        return index % 3 === workerIndex;
      })
      .map((eventEl) => {
        const res = {};
        res.title = "";
        const imageEl = eventEl.querySelector("[class^='event__image'] img");
        if (!!imageEl) {
          res.image = imageEl.src;
        }
        const linkEl = eventEl.querySelector("a[href]");

        if (!!linkEl) {
          res.venueEventUrl = linkEl.href;
        }
        const titleEl = eventEl.querySelector(".event__name");
        if (!!titleEl) {
          res.title = titleEl.textContent.trim();
        }
        res.location = "patronaat";
        const subtitleEl = eventEl.querySelector(".event__subtitle");
        if (!!subtitleEl) {
          res.shortText = subtitleEl.textContent.trim();
        }
        return res;
      });
  }, workerData.index);
  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}
