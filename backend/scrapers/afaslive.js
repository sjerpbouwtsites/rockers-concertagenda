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
import { afasliveMonths } from "../mods/months.js";

// LET OP FILTER FOR ROCK

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
      return filterForRock(baseMusicEventsCopy);
    }).then(filteredForRock => {
      return processSingleMusicEvent(filteredForRock);
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
      timeout: 30000,
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

  if (!firstMusicEvent || baseMusicEvents.length === 0) {
    return true;
  }

  const singleEventPage = await createSinglePage(firstMusicEvent.venueEventUrl);
  if (!singleEventPage) {
    return newMusicEvents.length
      ? processSingleMusicEvent(newMusicEvents)
      : true;
  }

  try {
    const pageInfo = await Promise.race([
      getPageInfo(singleEventPage, firstMusicEvent.venueEventUrl),
      _t.errorAfterSeconds(15000),
    ]);

    if (pageInfo && pageInfo.priceTextcontent) {
      pageInfo.price = _t.getPriceFromHTML(pageInfo.priceTextcontent);
    }

    if (pageInfo && pageInfo.longTextHTML) {
      let uuid = crypto.randomUUID();
      const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;

      fs.writeFile(longTextPath, pageInfo.longTextHTML, "utf-8", () => {});
      pageInfo.longText = longTextPath;
    }

    // no date no registration.
    if (pageInfo) {
      firstMusicEvent.merge(pageInfo);
    }
    firstMusicEvent.registerIfValid();
    if (!singleEventPage.isClosed() && singleEventPage.close());
  } catch (pageInfoError) {
    _t.handleError(pageInfoError, workerData, "get page info fail");
  }

  return newMusicEvents.length
    ? processSingleMusicEvent(newMusicEvents)
    : true;
}

async function getPageInfo(page) {
  return await page.evaluate((afasliveMonths) => {

    const res = {};

    const startDateMatch = document.querySelector('.eventTitle')
      ?.parentNode.querySelector('time')
      ?.textContent.match(/(\d+)\s+(\w+)\s+(\d\d\d\d)/) ?? null
    if (startDateMatch && Array.isArray(startDateMatch) && startDateMatch.length > 3) {
      res.startDate = `${startDateMatch[3]}-${afasliveMonths[startDateMatch[2]]}-${startDateMatch[1]}`
    }

    const startEl = document.querySelector('.eventInfo .tickets ~ p.align-mid ~ p.align-mid');
    if (startEl) {
      const startmatch = startEl.textContent.match(/\d\d:\d\d/);
      if (startmatch) {
        res.startTime = startmatch[0]
      }
    }

    const doorEl = document.querySelector('.eventInfo .tickets ~ p.align-mid');
    if (doorEl) {
      const doormatch = doorEl.textContent.match(/\d\d:\d\d/);
      if (doormatch) {
        res.doorTime = doormatch[0]
      }
    }

    try {
      if (res.startTime) {
        res.startDateTime = new Date(`${res.startDate}T${res.startTime}:00`).toISOString();
      }

      if (res.doorTime) {
        res.doorOpenDateTime = new Date(`${res.startDate}T${res.doorTime}:00`).toISOString();
      }
    } catch (error) {
      res.error = error;
    }


    res.longTextHTML = document.querySelector('article .wysiwyg')?.innerHTML ?? null;

    res.priceTextcontent =
      document.querySelector("#tickets")?.textContent.trim() ??
      null;
    return res;
  }, afasliveMonths);
}

async function makeBaseEventList() {
  const page = await browser.newPage();
  await page.goto("https://www.afaslive.nl/agenda", {
    waitUntil: "load",
  });

  await _t.autoScroll(page);
  await _t.waitFor(3000)
  await _t.autoScroll(page);
  await _t.waitFor(3000)
  await _t.autoScroll(page);
  await _t.waitFor(3000)
  await _t.autoScroll(page);

  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".agenda__item__block "))
      .filter((event, eventIndex) => {
        return (eventIndex + workerIndex) % 4 === 0;
      })
      .map((agendaBlock) => {

        const res = {}
        res.venueEventUrl = agendaBlock.querySelector('a')?.href ?? null
        res.image = agendaBlock.querySelector('img')?.src ?? null
        res.title = agendaBlock.querySelector('.eventTitle')?.textContent ?? ''
        res.location = 'afaslive';
        return res;

      });
  }, workerData.index);

  page.close();

  return rawEvents
    .filter(_t.basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}

async function filterForRock(musicEvents, filteredEvents = []) {

  if (!musicEvents.length) {
    return filteredEvents;
  }

  const newMusicEvents = [...musicEvents];
  const newFilteredEvents = [...filteredEvents];
  const firstEvent = newMusicEvents.shift();
  const eventTitles = firstEvent.title.split('&');
  const isRockEvent = await _t.isRock(browser, eventTitles);
  if (isRockEvent) {
    newFilteredEvents.push(firstEvent)
  }

  return await filterForRock(newMusicEvents, newFilteredEvents)
}

