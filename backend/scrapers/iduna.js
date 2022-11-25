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
import { idunaMonths } from "../mods/months.js";


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
      } else if (res.doorTime) {
        res.startDateTime = new Date(`${res.startDate}T${res.doorTime}:00`).toISOString();
      }

      if (res.startTime && res.doorTime) {
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

async function makeBaseEventList() {
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
    .filter(_t.basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}
