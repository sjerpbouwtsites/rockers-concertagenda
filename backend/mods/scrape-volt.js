import MusicEvent from "./music-event.js";
import puppeteer from "puppeteer";
import { parentPort } from "worker_threads";
import EventsList from "./events-list.js";
import {
  handleError,
  basicMusicEventsFilter,
  log,
  waitFor,
  failurePromiseAfter,
  postPageInfoProcessing,
} from "./tools.js";
import { voltMonths } from "./months.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";

letScraperListenToMasterMessageAndInit(scrapeInit);

async function scrapeInit(workerIndex) {
  const browser = await puppeteer.launch({
    headLess: false,
  });

  try {
    const baseMusicEvents = await makeBaseEventList(browser, workerIndex);
    await fillMusicEvents(browser, baseMusicEvents, workerIndex);
  } catch (error) {
    handleError(error, 'Generic error catch Volt scrape init');
  }
}

async function fillMusicEvents(browser, baseMusicEvents, workerIndex) {
  const baseMusicEventsCopy = [...baseMusicEvents];

  return processSingleMusicEvent(
    browser,
    baseMusicEventsCopy,
    workerIndex
  ).finally(() => {
    setTimeout(() => {
      browser.close();
    }, 5000);
    parentPort.postMessage({
      status: "done",
    });
    EventsList.save("volt", workerIndex);
  });
}

async function processSingleMusicEvent(browser, baseMusicEvents, workerIndex) {
  parentPort.postMessage({
    status: "todo",
    message: baseMusicEvents.length,
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

  const page = await browser.newPage();
  await page.goto(firstMusicEvent.venueEventUrl, {
    waitUntil: "load",
  });
  let pageInfo = await getPageInfo(page, firstMusicEvent);
  pageInfo = postPageInfoProcessing(pageInfo);
  firstMusicEvent.merge(pageInfo);
  if (firstMusicEvent.isValid) {
    firstMusicEvent.register();
  } else {
    //
  }

  page.close();

  return newMusicEvents.length
    ? processSingleMusicEvent(browser, newMusicEvents, workerIndex)
    : true;
}

async function getPageInfo(page, musicEvent) {

  try {
    await page.waitForSelector('#main .content-block', {
      timeout: 7500
    })
  } catch (error) {
    handleError(error, 'Volt wacht op laden single pagina')
  }

  const result = await page.evaluate(({ voltMonths, musicEvent }) => {

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
  }, { voltMonths, musicEvent });

  if (result.error) {
    handleError(new Error(result.error), 'volt getPageInfo')
  }

  return result

}

async function makeBaseEventList(browser, workerIndex) {
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
    handleError(error, 'Volt wacht op laden eventlijst')
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
  }, { voltMonths, workerIndex });
  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}


// async function eventAsyncCheck(browser, eventGen, currentEvent = null, checkedEvents = []) {

//   const firstCheckText = `${currentEvent.title} ${currentEvent.shortText}`.toLowerCase();
//   if (
//     !firstCheckText.includes('indie') &&
//     !firstCheckText.includes('dromerig') &&
//     !firstCheckText.includes('shoegaze') &&
//     !firstCheckText.includes('alternatieve rock')
//   ) {
//     checkedEvents.push(currentEvent)
//   }

//   const nextEvent = eventGen.next().value;
//   if (nextEvent) {
//     return eventAsyncCheck(browser, eventGen, nextEvent, checkedEvents)
//   } else {
//     return checkedEvents;
//   }

// }

// function* eventGenerator(baseMusicEvents) {

//   while (baseMusicEvents.length) {
//     yield baseMusicEvents.shift();

//   }
// }
