import MusicEvent from "./music-event.js";
import puppeteer from "puppeteer";
import { parentPort } from "worker_threads";
import EventsList from "./events-list.js";
import {
  handleError,
  basicMusicEventsFilter,
  waitFor,
  autoScroll,
  postPageInfoProcessing,
  isRock
} from "./tools.js";
import { afasliveMonths } from "./months.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";

letScraperListenToMasterMessageAndInit(scrapeInit);

async function scrapeInit(workerIndex) {
  const browser = await puppeteer.launch({
    headLess: false,
  });

  try {
    const baseMusicEvents = await makeBaseEventList(browser, workerIndex);
    const filteredForRock = await filterForRock(browser, baseMusicEvents);
    await fillMusicEvents(browser, filteredForRock, workerIndex);
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
    EventsList.save("afaslive", workerIndex);
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
  return await page.evaluate((afasliveMonths) => {


    const res = {};

    const startDateMatch = document.querySelector('.eventTitle')
      ?.parentNode.querySelector('time')
      ?.textContent.match(/(\d+)\s+(\w+)\s+(\d\d\d\d)/) ?? null
    if (startDateMatch && Array.isArray(startDateMatch) && startDateMatch.length > 3) {
      res.startDate = `${startDateMatch[3]}-${afasliveMonths[startDateMatch[2]]}-${startDateMatch[1]}`
    }

    const startEl = document.querySelector('.eventInfo .tickets ~ p.align-mid ~ p.align-mid');
    if (startEl) {
      const startmatch = startEl.textContent.match(/\d\d:\d\d/);
      if (startmatch) {
        res.startTime = startmatch[0]
      }
    }

    const doorEl = document.querySelector('.eventInfo .tickets ~ p.align-mid');
    if (doorEl) {
      const doormatch = doorEl.textContent.match(/\d\d:\d\d/);
      if (doormatch) {
        res.doorTime = doormatch[0]
      }
    }

    try {
      if (res.startTime) {
        res.startDateTime = new Date(`${res.startDate}T${res.startTime}:00`).toISOString();
      }

      if (res.doorTime) {
        res.doorOpenDateTime = new Date(`${res.startDate}T${res.doorTime}:00`).toISOString();
      }
    } catch (error) {
      res.error = error;
    }


    res.longTextHTML = document.querySelector('article .wysiwyg')?.innerHTML ?? null;

    res.priceTextcontent =
      document.querySelector("#tickets")?.textContent.trim() ??
      null;
    return res;
  }, afasliveMonths);
}

async function makeBaseEventList(browser, workerIndex) {
  const page = await browser.newPage();
  await page.goto("https://www.afaslive.nl/agenda", {
    waitUntil: "load",
  });

  await autoScroll(page);
  await waitFor(3000)
  await autoScroll(page);
  await waitFor(3000)
  await autoScroll(page);
  await waitFor(3000)
  await autoScroll(page);

  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".agenda__item__block "))
      .filter((event, eventIndex) => {
        return (eventIndex + workerIndex) % 4 === 0;
      })
      .map((agendaBlock) => {

        const res = {}
        res.venueEventUrl = agendaBlock.querySelector('a')?.href ?? null
        res.image = agendaBlock.querySelector('img')?.src ?? null
        res.title = agendaBlock.querySelector('.eventTitle')?.textContent ?? ''
        res.location = 'afaslive';
        return res;

      });
  }, workerIndex);

  page.close();

  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}

async function filterForRock(browser, musicEvents, filteredEvents = []) {

  if (!musicEvents.length) {
    return filteredEvents;
  }

  const newMusicEvents = [...musicEvents];
  const newFilteredEvents = [...filteredEvents];
  const firstEvent = newMusicEvents.shift();
  const eventTitles = firstEvent.title.split('&');
  const isRockEvent = await isRock(browser, eventTitles);
  if (isRockEvent) {
    newFilteredEvents.push(firstEvent)
  }

  return await filterForRock(browser, newMusicEvents, newFilteredEvents)
}

