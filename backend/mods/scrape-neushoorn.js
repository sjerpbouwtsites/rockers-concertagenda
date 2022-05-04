import MusicEvent from "./music-event.js";
import puppeteer from "puppeteer";
import { parentPort } from "worker_threads";
import EventsList from "./events-list.js";
import {
  handleError,
  basicMusicEventsFilter,
  autoScroll,
  waitFor,
  postPageInfoProcessing,
  log,
} from "./tools.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";
import { neushoornMonths } from "./months.js";

letScraperListenToMasterMessageAndInit(scrapeNeushoorn);

async function scrapeNeushoorn(workerIndex) {
  const browser = await puppeteer.launch({
    headLess: false
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
    EventsList.save("neushoorn", workerIndex);
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
  return await page.evaluate((months) => {
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
      //
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
}

async function makeBaseEventList(browser, workerIndex) {
  const page = await browser.newPage();
  await page.goto("https://neushoorn.nl/#/search?category=Heavy", {
    waitUntil: "load",
  });

  await autoScroll(page);
  await waitFor(500);
  await autoScroll(page);
  await waitFor(500); await autoScroll(page);
  await waitFor(500); await autoScroll(page);
  await waitFor(500); await autoScroll(page);
  await waitFor(500);

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
  }, workerIndex);

  page.close();

  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}




