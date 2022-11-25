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
import { voltMonths } from "../mods/months.js";


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

async function getPageInfo(page, url) {

  try {
    await page.waitForSelector('#main .content-block', {
      timeout: 7500
    })
  } catch (error) {
    _t.handleError(error, workerData, 'Volt wacht op laden single pagina')
  }

  const result = await page.evaluate(({ voltMonths, url }) => {

    const res = {};
    const curMonthNumber = (new Date()).getMonth() + 1;
    const curYear = (new Date()).getFullYear();

    const contentBox = document.querySelector('#main .aside + div > .content-block') ?? null;
    if (contentBox) {
      res.longTextHTML = contentBox.innerHTML;
    }
    const unstyledListsInAside = document.querySelectorAll('#main .aside .list-unstyled') ?? [null];
    const startDateMatch = unstyledListsInAside[0].textContent.trim().toLowerCase()
      .match(/(\d{1,2})\s+(\w+)/) ?? null;
    let startDate;

    if (startDateMatch && Array.isArray(startDateMatch) && startDateMatch.length === 3) {
      const day = startDateMatch[1].padStart(2, '0');
      const month = voltMonths[startDateMatch[2]];
      const year = Number(month) >= curMonthNumber ? curYear : curYear + 1;
      startDate = `${year}-${month}-${day}`;
      res.startDate = startDate;
    }

    const timesList = document.querySelector('#main .aside .prices ~ .list-unstyled')
    const timesMatch = timesList?.textContent.toLowerCase().match(/(\d\d:\d\d)/g) ?? null
    if (timesMatch && Array.isArray(timesMatch) && timesMatch.length >= 1) {

      let startTime, doorTime, endTime;
      if (timesMatch.length === 1) {
        startTime = timesMatch[0];
      } else if (timesMatch.length === 2) {
        doorTime = timesMatch[0];
        startTime = timesMatch[1];
      } else {
        doorTime = timesMatch[0];
        startTime = timesMatch[1];
        endTime = timesMatch[2];
      }
      try {
        if (startTime) {
          res.startDateTime = new Date(`${startDate}T${startTime}:00`).toISOString()
        }
        if (doorTime) {
          res.doorOpenDateTime = new Date(`${startDate}T${doorTime}:00`).toISOString()
        }
        if (endTime) {
          res.endDateTime = new Date(`${startDate}T${endTime}:00`).toISOString()
        }

      } catch (error) {
        res.error = `ongeldige tijden: ${timesMatch.join(' ')}\n${error.message}`;
      }

    }
    res.priceTextcontent = document.querySelector('#main .aside .list-unstyled.prices')?.textContent ?? null;
    return res;
  }, { voltMonths, url });

  if (result.error) {
    _t.handleError(new Error(result.error), workerData, 'getPageInfo')
  }

  return result

}

async function makeBaseEventList() {
  const page = await browser.newPage();
  await page.goto("https://www.poppodium-volt.nl/", {
    waitUntil: "load",
  });

  try {
    await page.waitForSelector('.row.event', {
      timeout: 2500
    })
    await page.waitForSelector('.row.event .card-social', {
      timeout: 2500
    })
  } catch (error) {
    _t.handleError(error, 'Volt wacht op laden eventlijst')
  }

  let rawEvents = await page.evaluate(({ voltMonths, workerIndex }) => {

    return Array.from(document.querySelectorAll('.row.event .card'))
      .filter(rawEvent => {
        const hasGenreName = rawEvent.querySelector('.card-location')?.textContent.toLowerCase().trim() ?? '';
        return hasGenreName.includes('metal') || hasGenreName.includes('punk')
      })
      .filter((rawEvent, eventIndex) => {
        return eventIndex % 3 === workerIndex;
      })
      .map(rawEvent => {
        const anchor = rawEvent.querySelector('h3 [href*="programma"]') ?? null;
        const title = anchor?.textContent.trim() ?? '';
        const venueEventUrl = anchor.hasAttribute('href') ? anchor.href : null
        const image = rawEvent.querySelector('img')?.src ?? null;
        return {
          venueEventUrl,
          location: 'volt',
          title,
          image,

        }
      })
  }, { voltMonths, workerIndex: workerData.index });
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