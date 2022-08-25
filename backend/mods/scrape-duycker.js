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
import { duyckerMonths } from "./months.js";
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
    handleError(error, 'Generic error catch Duycker scrape init');
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
    EventsList.save("duycker", workerIndex);
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
    await page.waitForSelector('#container .content.event', {
      timeout: 7500
    })
  } catch (error) {
    handleError(error, 'Duycker wacht op laden single pagina')
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
    handleError(new Error(result.error), 'Duycker getPageInfo')
  }

  return result

}

async function makeBaseEventList(browser, workerIndex) {
  const page = await browser.newPage();
  await page.goto("https://www.duycker.nl/agenda/?music_genre=metal-punk", {
    waitUntil: "load",
  });

  try {
    await page.waitForSelector('.duycker.agenda .item-container', {
      timeout: 2500
    })
  } catch (error) {
    handleError(error, 'Duycker wacht op laden eventlijst')
  }

  await waitFor(50);

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
          handleError(`invalid times ${startDate} ${startTime} ${doorTime}`, 'Duycker');
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
  }, { duyckerMonths, workerIndex });

  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}

