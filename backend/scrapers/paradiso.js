import MusicEvent from "../mods/music-event.js";
import puppeteer from "puppeteer";
import { parentPort, workerData } from "worker_threads";
import EventsList from "../mods/events-list.js";
import fs from "fs";
import crypto from "crypto";
import fsDirections from "../mods/fs-directions.js";
import {
  getPriceFromHTML,
  handleError,
  autoScroll,
  waitFor,
  errorAfterSeconds,
  postPageInfoProcessing,
  basicMusicEventsFilter,
} from "../mods/tools.js";
import { letScraperListenToMasterMessageAndInit } from "../mods/generic-scraper.js";
import { QuickWorkerMessage } from "../mods/rock-worker.js";
import { paradisoMonths } from "../mods/months.js";

letScraperListenToMasterMessageAndInit(scrapeInit);
const qwm = new QuickWorkerMessage(workerData);
let browser = null;

async function scrapeInit() {
  parentPort.postMessage(qwm.workerInitialized());
  browser = await puppeteer.launch();
  Promise.race([makeBaseEventList(), errorAfterSeconds(30000)])
    
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
    handleError(error, workerData, `outer catch scrape ${workerData.family}`)
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
      handleError(
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
      errorAfterSeconds(15000),
    ]);

    if (pageInfo && pageInfo.priceTextcontent) {
      pageInfo.price = getPriceFromHTML(pageInfo.priceTextcontent);
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
    firstMusicEvent.price = firstMusicEvent.price + 4; // lidmaatschap
    firstMusicEvent.registerIfValid();
    if (!singleEventPage.isClosed() && singleEventPage.close());
  } catch (pageInfoError) {
    handleError(pageInfoError, workerData, "get page info fail");
  }

  return newMusicEvents.length
    ? processSingleMusicEvent(newMusicEvents)
    : true;
}

async function getPageInfo(page) {

  try {
    await page.waitForSelector('.header-template-2__subcontent .date', {
      timeout: 7500
    })
  } catch (error) {
    handleError(error, 'Paradiso wacht op laden single pagina')
  }

  const result = await page.evaluate(paradisoMonths => {

    const res = {};

    const contentBox = document.querySelector('.header-template-2__description') ?? null;
    if (contentBox) {
      res.longTextHTML = contentBox.innerHTML;
    }

    const startDateMatch = document.querySelector('.header-template-2__subcontent .date')?.textContent.toLowerCase().match(/(\d{1,2})\s+(\w+)\s+(\d{4})/)
    if (startDateMatch && Array.isArray(startDateMatch) && startDateMatch.length === 4) {
      res.startDate = `${startDateMatch[3]}-${paradisoMonths[startDateMatch[2]]}-${startDateMatch[1].padStart(2, '0')}`
    }

    const timesMatch = document.querySelector('.template-2__content-header')?.textContent.match(/(\d\d:\d\d)/g) ?? null
    res.timesMatch = timesMatch;
    res.tijdText = document.querySelector('.template-2__content-header')?.textContent;
    if (timesMatch && Array.isArray(timesMatch) && timesMatch.length >= 1) {
      try {
        if (timesMatch.length === 1) {
          res.startDateTime = new Date(`${res.startDate}T${timesMatch[0]}:00`).toISOString()
        } else {
          res.doorOpenDateTime = new Date(`${res.startDate}T${timesMatch[0]}:00`).toISOString()
          res.startDateTime = new Date(`${res.startDate}T${timesMatch[1]}:00`).toISOString()
        }
      } catch (error) {
        res.error = `ongeldige tijden: ${timesMatch.join(' ')}\n${error.message}`;
      }

    }
    res.priceTextcontent = document.querySelector('.template-2__price-wrapper-container')?.textContent ?? null;
    return res;
  }, paradisoMonths);

  if (result.error) {
    handleError(new Error(result.error), workerData, 'Paradiso getPageInfo')
  }
  return result

}

async function makeBaseEventList() {
  const page = await browser.newPage();
  await page.goto("https://www.paradiso.nl/nl/zoeken/categorie/", {
    waitUntil: "load",
  });
  try {
    await page.waitForSelector('[data-category="60102"]', {
      timeout: 2500
    })
  } catch (error) {
    handleError(error, 'Paradiso wacht op punk categorie')
  }
  await page.click('[data-category="60102"]')
  try {
    await page.waitForSelector('.block-list-search__submit', {
      timeout: 1000
    })
  } catch (error) {
    handleError(error, 'Paradiso wacht op submit knop filters')
  }
  await page.click('.block-list-search__submit')
  try {
    await page.waitForSelector('.event-list__item', {
      timeout: 5000
    })
  } catch (error) {
    handleError(error, 'Paradiso wacht op laden agenda na filter')
  }
  await waitFor(150);

  let rawEvents = await page.evaluate(({ paradisoMonths, workerIndex }) => {

    return Array.from(document.querySelectorAll('.event-list__item'))
      .filter((rawEvent, eventIndex) => {
        return eventIndex % 4 === workerIndex;
      })
      .map(rawEvent => {

        const title = rawEvent.querySelector('.event-list__item-title')?.textContent.trim() ?? '';
        const shortText = rawEvent.querySelector('.event-list__item-subtitle')?.textContent.trim() ?? '';
        const venueEventUrl = rawEvent.hasAttribute('href') ? rawEvent.href : null

        return {
          venueEventUrl,
          location: 'paradiso',
          title,
          shortText,
        }
      })
  }, { paradisoMonths, workerIndex: workerData.index });
  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}


async function eventAsyncCheck(eventGen, currentEvent = null, checkedEvents = []) {

  const firstCheckText = `${currentEvent.title} ${currentEvent.shortText}`.toLowerCase();
  if (
    !firstCheckText.includes('indie') &&
    !firstCheckText.includes('dromerig') &&
    !firstCheckText.includes('shoegaze') &&
    !firstCheckText.includes('alternatieve rock')
  ) {
    checkedEvents.push(currentEvent)
  }

  const nextEvent = eventGen.next().value;
  if (nextEvent) {
    return eventAsyncCheck(eventGen, nextEvent, checkedEvents)
  } else {
    return checkedEvents;
  }

}

function* eventGenerator(baseMusicEvents) {

  while (baseMusicEvents.length) {
    yield baseMusicEvents.shift();

  }
}


// const startDay = rawEvent.querySelector('time .number')?.textContent.trim()?.padStart(2, '0') ?? null;
// const startMonthName = rawEvent.querySelector('.time month')?.textContent.trim() ?? null;
// const startMonth = depulMonths[startMonthName]
// const startMonthJSNumber = Number(startMonth) - 1;
// const refDate = new Date();
// let startYear = refDate.getFullYear();
// if (startMonthJSNumber < refDate.getMonth()) {
//   startYear = startYear + 1;
// }
// const startDate = `${startYear}-${startMonth}-${startDay}`
// const venueEventUrl = rawEvent.querySelector('a')?.href ?? null;

// const imageMatch = rawEvent.querySelector('a')?.getAttribute('style').match(/url\(\'(.*)\'\)/) ?? null;
// let image;
// if (imageMatch && Array.isArray(imageMatch) && imageMatch.length === 2) {
//   image = imageMatch[1]
// }