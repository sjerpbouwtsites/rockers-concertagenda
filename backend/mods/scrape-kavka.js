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
import { kavkaMonths } from "./months.js";
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
    handleError(error, 'Generic catch scrape init Kavka');
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
    EventsList.save("kavka", workerIndex);
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
  const pageInfoPromise = kavkaPageInfo(page, firstMusicEvent);
  const failurePromise = failurePromiseAfter(7500);

  return Promise.race([pageInfoPromise, failurePromise])
    .then(firstResult => {
      if (firstResult.status !== 'success') {
        const errMsg = firstResult.data && typeof firstResult.data === 'string' ? `\nOriginal error message:\n${firstResult.data}` : '';
        const err = new Error(`Kavka single failure, failure promise fired, at: \n${firstMusicEvent.title}\n${firstMusicEvent.venueEventUrl}${errMsg}`)
        handleError(err, "Kavka promise race")
      } else {
        const pageInfo = firstResult.data;
        firstMusicEvent.merge(pageInfo);
        if (firstMusicEvent.isValid) {
          firstMusicEvent.register();
        }
      }

    }).catch(() => {
      //
    }).finally(() => {
      page.close();
      return newMusicEvents.length
        ? processSingleMusicEvent(browser, newMusicEvents, workerIndex)
        : true;
    })
}

function failurePromiseAfter(time) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject({
        status: 'failure',
        data: null
      });
    }, time)
  })
}


async function kavkaPageInfo(page, firstMusicEvent) {
  try {
    await page.goto(firstMusicEvent.venueEventUrl, {
      waitUntil: "load",
      timeout: 7500
    });
  } catch (error) {
    error.message = `${error.message}\nurl: ${firstMusicEvent.venueEventUrl}`
    return {
      status: 'failure',
      data: error.message
    }
  }

  let pageInfo = await getPageInfo(page);
  pageInfo = postPageInfoProcessing(pageInfo);
  return {
    status: 'success',
    data: pageInfo
  };
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
    log(error)
  }
  return pageInfo;
}

async function makeBaseEventList(browser, workerIndex) {
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

        let startDateTime, ojee, startDateEl, startDate, startTime, startDay, startMonthName, startMonth, startMonthJSNumber, refDate, startYear, dateStringAttempt
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
          startTime = rawEvent.querySelector('.loc-time time')?.textContent.trim() ?? '';
          dateStringAttempt = `${startDate}T${startTime}:00`;
          startDateTime = new Date(dateStringAttempt).toISOString();
        } catch (error) {
          ojee = `${error.message} \n ${[dateStringAttempt, startDateTime, startDate, startTime, startDay, startMonthName, startMonth, startMonthJSNumber, refDate, startYear].join('\n')}`;
        }

        const title = rawEvent.querySelector('article h3:first-child')?.textContent.trim() ?? '';
        const shortText = rawEvent.querySelector('article h3 + p')?.textContent.trim() ?? '';
        return {
          error: ojee,
          venueEventUrl: rawEvent.href,
          location: 'kavka',
          title,
          startDateTime,
          shortText,
        }
      })
  }, kavkaMonths);
  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}
