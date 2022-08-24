import MusicEvent from "./music-event.js";
import puppeteer from "puppeteer";
import { parentPort } from "worker_threads";
import EventsList from "./events-list.js";
import {
  handleError,
  basicMusicEventsFilter,
  log,
  waitFor,
  autoScroll,
  postPageInfoProcessing,
  isRock
} from "./tools.js";
import { idunaMonths } from "./months.js";
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
    handleError(error);
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
    EventsList.save("iduna", workerIndex);
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

  let pageInfo = await getPageInfo(page);
  pageInfo = postPageInfoProcessing(pageInfo);
  firstMusicEvent.merge(pageInfo);
  if (firstMusicEvent.isValid) {

    firstMusicEvent.register();
  }

  page.close();

  return newMusicEvents.length
    ? processSingleMusicEvent(browser, newMusicEvents, workerIndex)
    : true;
}

async function getPageInfo(page) {
  return await page.evaluate((idunaMonths) => {

    const res = {};
    try {
      const startDateMatch = document.querySelector('#sideinfo .capitalize')
        ?.textContent.match(/(\d+)\s+(\w+)\s+(\d\d\d\d)/) ?? null
      if (startDateMatch && Array.isArray(startDateMatch) && startDateMatch.length > 3) {
        res.startDate = `${startDateMatch[3]}-${idunaMonths[startDateMatch[2]]}-${startDateMatch[1]}`
      }

      const startEl = Array.from(document.querySelectorAll('#sideinfo h2')).find(h2El => {
        return h2El.textContent.toLowerCase().includes('aanvang')
      });
      if (startEl) {
        const startmatch = startEl.textContent.match(/\d\d:\d\d/);
        if (startmatch) {
          res.startTime = startmatch[0]
        }
      }

      const doorEl = Array.from(document.querySelectorAll('#sideinfo h2')).find(h2El => {
        return h2El.textContent.toLowerCase().includes('deur')
      });
      if (doorEl) {
        const doormatch = doorEl.textContent.match(/\d\d:\d\d/);
        if (doormatch) {
          res.doorTime = doormatch[0]
        }
      }


      if (res.startTime) {
        res.startDateTime = new Date(`${res.startDate}T${res.startTime}:00`).toISOString();
      }

      if (res.doorTime) {
        res.doorOpenDateTime = new Date(`${res.startDate}T${res.doorTime}:00`).toISOString();
      }
    } catch (error) {
      res.error = error;
    }

    const imageMatch = document.getElementById('photoandinfo').innerHTML.match(/url\(\'(.*)\'\)/);
    if (imageMatch && Array.isArray(imageMatch) && imageMatch.length === 2) {
      res.image = imageMatch[1]
    }

    res.longTextHTML = document.querySelector('#postcontenttext')?.innerHTML ?? null;

    res.priceTextcontent =
      document.querySelector("#sideinfo")?.textContent.trim() ??
      null;
    return res;
  }, idunaMonths);
}

async function makeBaseEventList(browser, workerIndex) {
  const page = await browser.newPage();
  await page.goto("https://iduna.nl/", {
    waitUntil: "load",
  });

  let metalEvents = await page.evaluate(() => {

    // no-eslint
    // HACK VAN DE SITE ZELF
    loadposts('metal', 1, 50);

    return new Promise((resolve, reject) => {

      setTimeout(() => {
        const metalEvents = Array.from(document.querySelectorAll('#gridcontent .griditemanchor')).map(event => {
          return {
            venueEventUrl: event.href,
            title: event.querySelector('.griditemtitle')?.textContent.trim(),
            location: 'iduna'
          }
        })
        resolve(metalEvents)
      }, 2500)

    })

  }).then(metalEvents => metalEvents);

  let punkEvents = await page.evaluate(() => {

    // no-eslint
    // HACK VAN DE SITE ZELF
    loadposts('punk', 1, 50);

    return new Promise((resolve, reject) => {

      setTimeout(() => {
        const punkEvents = Array.from(document.querySelectorAll('#gridcontent .griditemanchor')).map(event => {
          return {
            venueEventUrl: event.href,
            title: event.querySelector('.griditemtitle')?.textContent.trim(),
            location: 'iduna'
          }
        })
        resolve(punkEvents)
      }, 2500)

    })

  }).then(punkEvents => punkEvents);

  const metalEventsTitles = metalEvents.map(event => {
    return event.title
  })

  punkEvents.forEach(punkEvent => {
    if (!metalEventsTitles.includes(punkEvent)) {
      metalEvents.push(punkEvent)
    }
  })

  return metalEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}
