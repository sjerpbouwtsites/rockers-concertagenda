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
import {duyckerMonths} from "../mods/months.js"

letScraperListenToMasterMessageAndInit(scrapeInit);
const qwm = new QuickWorkerMessage(workerData);
let browser = null;

async function scrapeInit() {
  parentPort.postMessage(qwm.workerInitialized());
  browser = await puppeteer.launch();
  Promise.race([makeBaseEventList(), _t.errorAfterSeconds(30000)])
    
    .then(baseMusicEvents => {
      parentPort.postMessage(qwm.workerStarted());
      parentPort.postMessage(qwm.toConsole(baseMusicEvents))
      const baseMusicEventsCopy = [...baseMusicEvents];
      const eventGen = eventGenerator(baseMusicEventsCopy);
      const nextEvent = eventGen.next().value;
      return eventAsyncCheck(eventGen, nextEvent)
    })
    .then(eventList => {
      parentPort.postMessage(qwm.toConsole(eventList))      
      return processSingleMusicEvent(eventList)      
    })
    .then(() => {
      parentPort.postMessage(qwm.workerDone(EventsList.amountOfEvents));
    })
    .catch((error) =>
    _t.handleError(error, workerData, `outer catch scrape ${workerData.family}`)
    )
    .finally(() => {
      EventsList.save(workerData.family, workerData.index);
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

async function getPageInfo(page, musicEvent) {

  try {
    await page.waitForSelector('#container .content.event', {
      timeout: 7500
    })
  } catch (error) {
    _t.handleError(error, workerData, 'Duycker wacht op laden single pagina')
  }

  const result = await page.evaluate(({ duyckerMonths, musicEvent }) => {

    const res = {};
    const contentBox = document.querySelector('.the_content') ?? null;
    if (contentBox) {
      res.longTextHTML = contentBox.innerHTML;
    }

    res.priceTextcontent = document.querySelector('.event-info .content-info')?.textContent.trim() ?? '';

    return res;
  }, { duyckerMonths, musicEvent });

  if (result.error) {
    _t.handleError(new Error(result.error), workerData, 'Duycker getPageInfo')
  }

  return result

}

async function makeBaseEventList() {
  const page = await browser.newPage();
  await page.goto("https://www.duycker.nl/agenda/?music_genre=metal-punk", {
    waitUntil: "load",
  });

  try {
    await page.waitForSelector('.duycker.agenda .item-container', {
      timeout: 2500
    })
  } catch (error) {
    _t.handleError(error, workerData, 'wacht op laden eventlijst')
  }

  await _t.waitFor(50);

  let rawEvents = await page.evaluate(({ duyckerMonths, workerIndex }) => {

    return Array.from(document.querySelectorAll('.duycker.agenda .item-container'))
      .map(rawEvent => {
        const anchor = rawEvent.querySelector('[itemprop="url"]') ?? null;
        const title = rawEvent.querySelector('[itemprop="name"]')?.textContent ?? null;
        const shortText = rawEvent.querySelector('[itemprop="name"] + p')?.textContent ?? null;
        const venueEventUrl = anchor?.dataset.href ?? null
        const image = anchor?.querySelector('img')?.src ?? null;
        const startDateMatch = rawEvent.querySelector('.event-date')?.textContent.toLowerCase().trim().match(/(\d{1,2})\s(\w+)/)
        let startDate;
        let error;
        if (startDateMatch && Array.isArray(startDateMatch) && startDateMatch.length === 3) {
          const day = startDateMatch[1]
          const month = duyckerMonths[startDateMatch[2]]
          const refDate = new Date();
          let year = Number(month) < refDate.getMonth() + 1 ? refDate.getFullYear() + 1 : refDate.getFullYear();
          startDate = `${year}-${month}-${day}`;
        }
        const timeMatches = rawEvent.querySelector('.titles + .info')?.textContent.match(/\d\d:\d\d/g)
        let startTime, doorTime;
        if (timeMatches && Array.isArray(timeMatches) && timeMatches.length >= 1) {
          if (timeMatches.length === 1) {
            startTime = timeMatches[0]
          } else {
            doorTime = timeMatches[0]
            startTime = timeMatches[1]
          }
        }
        let startDateTime
        let openDoorDateTime
        try {
          if (startTime && startDate) {
            startDateTime = new Date(`${startDate}T${startTime}:00`).toISOString();
          }
          if (doorTime && startDate) {
            openDoorDateTime = new Date(`${startDate}T${doorTime}:00`).toISOString();
          }
        } catch (error) {
          _t.handleError(`invalid times ${startDate} ${startTime} ${doorTime}`, 'Duycker');
        }


        return {
          venueEventUrl,
          startDate,
          startDateTime,
          openDoorDateTime,
          shortText,
          location: 'duycker',
          title,
          image,

        }
      })
  }, { duyckerMonths, workerIndex: workerData.index });

  return rawEvents
    .filter(_t.basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}

async function eventAsyncCheck(eventGen, currentEvent = null, checkedEvents = []) {
  checkedEvents.push(currentEvent)
  const nextEvent = eventGen.next().value;
  if (nextEvent) {
    return eventAsyncCheck(eventGen, nextEvent, checkedEvents)
  } else {
    return checkedEvents;
  }
  

  // const firstCheckText = `${currentEvent.title} ${currentEvent.shortText}`.toLowerCase();
  // if (
  //   !firstCheckText.includes('indie') &&
  //   !firstCheckText.includes('dromerig') &&
  //   !firstCheckText.includes('shoegaze') &&
  //   !firstCheckText.includes('alternatieve rock')
  // ) {
  //   checkedEvents.push(currentEvent)
  // }

  // const nextEvent = eventGen.next().value;
  // if (nextEvent) {
  //   return eventAsyncCheck(eventGen, nextEvent, checkedEvents)
  // } else {
  //   return checkedEvents;
  // }

}

function* eventGenerator(baseMusicEvents) {

  while (baseMusicEvents.length) {
    yield baseMusicEvents.shift();

  }
}