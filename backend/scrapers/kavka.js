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
import { kavkaMonths } from "../mods/months.js";

letScraperListenToMasterMessageAndInit(scrapeInit);

const qwm = new QuickWorkerMessage(workerData);
let browser = null;

letScraperListenToMasterMessageAndInit(scrapeInit);

async function scrapeInit() {
  parentPort.postMessage(qwm.workerInitialized());
  browser = await puppeteer.launch();
  Promise.race([makeBaseEventList(), _t.errorAfterSeconds(30000)])
    .then((baseMusicEvents) => {
      parentPort.postMessage(qwm.workerStarted());
      const baseMusicEventsCopy = [...baseMusicEvents];
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

async function createSinglePage(url) {
  const page = await browser.newPage();
  await page
    .goto(url, {
      waitUntil: "load",
      timeout: 20000,
    })
    .then(() => true)
    .catch((err) => {
      _t.handleError(
        err,
        workerData,
        `${workerData.name} goto single page mislukt:<br><a href='${url}'>${url}</a><br>`
      );
      return false;
    });
  return page;
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

  const singleEventPage = await createSinglePage(firstMusicEvent.venueEventUrl);
  if (!singleEventPage) {
    return newMusicEvents.length
      ? processSingleMusicEvent(newMusicEvents)
      : true;
  }
  const pageInfoPromise = getPageInfo(singleEventPage, firstMusicEvent);
  const failurePromise = _t.failurePromiseAfter(20000);

  return Promise.race([pageInfoPromise, failurePromise])
    .then(firstResult => {
      if (firstResult.status !== 'success') {
        const errMsg = firstResult.data && typeof firstResult.data === 'string' ? `\nOriginal error message:\n${firstResult.data}` : '';
        const err = new Error(`Kavka single failure, failure promise fired, at: \n${firstMusicEvent.title}\n${firstMusicEvent.venueEventUrl}${errMsg}`)
        parentPort.postMessage(qwm.debugger(firstResult));
        _t.handleError(err, workerData, 'error in race condition')
      } else {
        let pageInfo = firstResult.data;
        pageInfo = _t.postPageInfoProcessing(pageInfo);
        firstMusicEvent.merge(pageInfo);
        firstMusicEvent.registerIfValid();
      }

    }).catch(() => {
      //
    }).finally(() => {
      if (!singleEventPage.isClosed() && singleEventPage.close());
      return newMusicEvents.length
        ? processSingleMusicEvent(newMusicEvents)
        : true;
    })
}

async function getPageInfo(page) {
  let pageInfo;
  try {
    pageInfo = await page.evaluate(() => {

      const res = {};
      res.image = document.querySelector('div.desktop img[src*="kavka.be/wp-content"]')?.src ?? '';
      if (!res.image) {
        res.image = document.querySelector('img[src*="kavka.be/wp-content"]')?.src ?? '';
      }

      res.longTextHTML = document.querySelector('h2 + .entry-content')?.innerHTML ?? null;

      res.priceTextcontent =
        document.querySelector(".prijzen")?.textContent.trim() ??
        null;
      return res;
    });
  } catch (error) {
    _t.handleError(error, workerData, `get page info`)
  }
  return {
    status: 'success',
    data: pageInfo
  };
}

async function makeBaseEventList() {
  const page = await browser.newPage();
  await page.goto("https://kavka.be/programma/", {
    waitUntil: "load",
  });

  let rawEvents = await page.evaluate(kavkaMonths => {
    return Array.from(document.querySelectorAll('.events-list > a'))
      .filter(rawEvent => {
        const isMetalOrPunk = Array.from(rawEvent.querySelectorAll('.tags')).map(a => a.innerHTML.trim()).join(' ').toLowerCase().includes('metal')
        const isCancelled = !!rawEvent.querySelector('.cancelled')
        return isMetalOrPunk && !isCancelled
      })
      .map(rawEvent => {

        let startDateTime, startTimeM, ojee, startDateEl, startDate, startTime, startDay, startMonthName, startMonth, startMonthJSNumber, refDate, startYear, dateStringAttempt
        let doorOpenDateTime
        try {
          startDateEl = rawEvent.querySelector('date .date') ?? null;
          startDay = startDateEl.querySelector('.day')?.textContent.trim()?.padStart(2, '0') ?? null;
          startMonthName = startDateEl.querySelector('.month')?.textContent.trim() ?? null;
          startMonth = kavkaMonths[startMonthName]
          startMonthJSNumber = Number(startMonth) - 1;
          refDate = new Date();
          startYear = refDate.getFullYear();
          if (startMonthJSNumber < refDate.getMonth()) {
            startYear = startYear + 1;
          }
          startDate = `${startYear}-${startMonth}-${startDay}`
          startTimeM = rawEvent.querySelector('.loc-time time')?.textContent.match(/\d\d:\d\d/);
          if (startTimeM && Array.isArray(startTimeM) && startTimeM.length > 0) {
            dateStringAttempt = `${startDate}T${startTimeM[0]}:00`;
          } else {
            dateStringAttempt = `${startDate}T19:00:00`;
          }
          startDateTime = new Date(dateStringAttempt).toISOString();            
        } catch (error) {
          ojee = `${error.message} \n ${[dateStringAttempt, startDateTime, startDate, startTime, startDay, startMonthName, startMonth, startMonthJSNumber, refDate, startYear].join('\n')}`;
        }

        if (startTimeM && Array.isArray(startTimeM) && startTimeM.length > 1) {
          dateStringAttempt = `${startDate}T${startTimeM[1]}:00`;
          doorOpenDateTime = new Date(dateStringAttempt).toISOString();            
        } 

        const title = rawEvent.querySelector('article h3:first-child')?.textContent.trim() ?? '';
        const shortText = rawEvent.querySelector('article h3 + p')?.textContent.trim() ?? '';
        return {
          error: ojee,
          venueEventUrl: rawEvent.href,
          location: 'kavka',
          title,
          startDateTime,
         doorOpenDateTime,

          shortText,
        }
      })
  }, kavkaMonths);
  return rawEvents
    .filter(_t.basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}
