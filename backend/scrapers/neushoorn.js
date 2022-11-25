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
  errorAfterSeconds,waitFor,
  postPageInfoProcessing,
  basicMusicEventsFilter,
} from "../mods/tools.js";
import { neushoornMonths } from "../mods/months.js";
import { letScraperListenToMasterMessageAndInit } from "../mods/generic-scraper.js";
import { QuickWorkerMessage } from "../mods/rock-worker.js";

const qwm = new QuickWorkerMessage(workerData);
let browser = null;

letScraperListenToMasterMessageAndInit(scrapeInit);

async function scrapeInit() {
  parentPort.postMessage(qwm.workerInitialized());
  browser = await puppeteer.launch();
  Promise.race([makeBaseEventList(), errorAfterSeconds(30000)])
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
      handleError(error, workerData, `outer catch scrape ${workerData.family}`)
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
  const pageInfo = await page.evaluate((months) => {
    const res = {};

    const dateTextcontent = document.querySelector('.summary .summary__item:first-child')?.textContent ?? '';
    const dateTextMatch = dateTextcontent.match(/\w+\s?(\d+)\s?(\w+)/);

    if (dateTextMatch && dateTextMatch.length === 3) {
      const year = '2022';
      const month = months[dateTextMatch[2]]
      const day = dateTextMatch[1].padStart(2, '0');
      res.startDate = `${year}-${month}-${day}`;
    } else {
      res.startDate = 'onbekend'
    }

    const timeTextcontent = document.querySelector('.summary .summary__item + .summary__item')?.textContent ?? '';
    const timeTextMatch = timeTextcontent.match(/(\d{2}:\d{2}).*(\d{2}:\d{2})/);
    if (timeTextMatch && timeTextMatch.length === 3) {
      res.doorOpenDateTime = new Date(`${res.startDate}T${timeTextMatch[1]}`).toISOString();
      res.startDateTime = new Date(`${res.startDate}T${timeTextMatch[2]}`).toISOString();
    } else {
      res.startDateTime = new Date(`${res.startDate}T${timeTextMatch[1]}`).toISOString();
    }

    res.priceTextcontent = document.querySelector('.prices__item__price')?.textContent ?? null;
    res.priceContexttext = document.querySelector('.prices')?.textContent ?? null;

    try {
      const summaryEl = document.querySelector('.content .summary');
      const longEl = summaryEl.parentNode;
      longEl.removeChild(summaryEl)
      res.longTextHTML = longEl.innerHTML;
    } catch (error) {
      res.error = error.message
    }


    const imageEl = document.querySelector('[style*="url"]');
    res.imageElLen = imageEl.length
    if (imageEl) {
      const imageMatch = imageEl.style.backgroundImage.match(/https.*jpg/) ?? null;
      if (imageMatch) {
        res.image = imageMatch[1]
      }
    }

    return res;
  }, neushoornMonths);
  if (pageInfo.error) {
    handleError(new Error(pageInfo.error, workerData, `get page info fail`))
  }
  return pageInfo
}

async function makeBaseEventList() {
  const page = await browser.newPage();

  await page.goto("https://neushoorn.nl/#/agenda", {
    waitUntil: "load",
  })

  try {
    await page.waitForSelector('[href*="Heavy"]', {
      timeout: 10000
    })
  } catch (error) {
    handleError(error, workerData, 'Neushoorn wacht op laden agenda pagina')
  }

  await page.click('[href*="Heavy"]')

  try {
    await page.waitForSelector('.productions__item', {
      timeout: 10000
    })
  } catch (error) {
    handleError(error, workerData, 'Neushoorn wacht op laden resultaten filter')
  }

  await waitFor(50)

  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".productions__item"))
      .map((itemEl) => {

        const textContent = itemEl.textContent.toLowerCase();
        const isRockInText = textContent.includes('punk') || textContent.includes('rock') || textContent.includes('metal') || textContent.includes('industrial') || textContent.includes('noise')
        const title = itemEl.querySelector('.productions__item__content span:first-child').textContent;
        const eventTitles = title.split('+').map(t => t.trim())
        const venueEventUrl = itemEl.href
        const location = 'neushoorn'
        return {
          location,
          venueEventUrl,
          textContent,
          isRockInText,
          title,
          eventTitles
        }
      });
  }, workerData.index);

  page.close();

  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}




