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
import { depulMonths } from "../mods/months.js";

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
  return await page.evaluate(depulMonths => {

    const res = {};

    const contentBox = document.querySelector('#content-box') ?? null;
    if (contentBox) {
      [
        contentBox.querySelector('.item-bottom') ?? null,
        contentBox.querySelector('.social-content') ?? null,
        contentBox.querySelector('.facebook-comments') ?? null
      ].forEach(removeFromContentBox => {
        if (removeFromContentBox) {
          contentBox.removeChild(removeFromContentBox)
        }
      })
      res.longTextHTML = contentBox.innerHTML;
    }

    const agendaTitleBar = document.getElementById('agenda-title-bar') ?? null;
    res.shortText = agendaTitleBar?.querySelector('h3')?.textContent.trim();
    const rightHandDataColumn = agendaTitleBar?.querySelector('.column.right') ?? null
    if (rightHandDataColumn) {
      rightHandDataColumn.querySelectorAll('h1 + ul li')?.forEach(columnRow => {
        const lowerCaseTextContent = columnRow.textContent.toLowerCase();
        if (lowerCaseTextContent.includes('datum')) {
          const startDateMatch = lowerCaseTextContent.match(/(\d\d)\s+(\w{2,3})\s+(\d{4})/)
          if (startDateMatch && Array.isArray(startDateMatch) && startDateMatch.length === 4) {
            res.startDate = `${startDateMatch[3]}-${depulMonths[startDateMatch[2]]}-${startDateMatch[1]}`
          }
        } else if (lowerCaseTextContent.includes('aanvang')) {
          if (!res.startDate) {
            return;
          }
          const startTimeMatch = lowerCaseTextContent.match(/\d\d:\d\d/);
          if (startTimeMatch && Array.isArray(startTimeMatch) && startTimeMatch.length === 1) {
            res.startDateTime = new Date(`${res.startDate}T${startTimeMatch[0]}:00`).toISOString()
          }
        } else if (lowerCaseTextContent.includes('open')) {
          if (!res.startDate) {
            return;
          }
          const doorTimeMatch = lowerCaseTextContent.match(/\d\d:\d\d/);
          if (doorTimeMatch && Array.isArray(doorTimeMatch) && doorTimeMatch.length === 1) {
            res.doorOpenDateTime = new Date(`${res.startDate}T${doorTimeMatch[0]}:00`).toISOString()
          }
        }
        if (!res.startDateTime && res.doorOpenDateTime) {
          res.startDateTime = res.doorOpenDateTime;
          res.doorOpenDateTime = null;
        }
      })
    }
    return res;
  }, depulMonths);
}

async function makeBaseEventList() {
  const page = await browser.newPage();
  await page.goto("https://www.livepul.com/agenda/", {
    waitUntil: "load",
  });

  let rawEvents = await page.evaluate(({ depulMonths, workerIndex }) => {

    // hack op site
    loadContent('all', 'music');

    return Array.from(document.querySelectorAll('.agenda-item'))
      .filter((rawEvent, eventIndex) => {
        return eventIndex % 3 === workerIndex;
      })
      .map(rawEvent => {

        const title = rawEvent.querySelector('h2')?.textContent.trim() ?? '';
        const shortText = rawEvent.querySelector('.text-box .desc')?.textContent.trim() ?? '';
        const startDay = rawEvent.querySelector('time .number')?.textContent.trim()?.padStart(2, '0') ?? null;
        const startMonthName = rawEvent.querySelector('.time month')?.textContent.trim() ?? null;
        const startMonth = depulMonths[startMonthName]
        const startMonthJSNumber = Number(startMonth) - 1;
        const refDate = new Date();
        let startYear = refDate.getFullYear();
        if (startMonthJSNumber < refDate.getMonth()) {
          startYear = startYear + 1;
        }
        const startDate = `${startYear}-${startMonth}-${startDay}`
        const venueEventUrl = rawEvent.querySelector('a')?.href ?? null;

        const imageMatch = rawEvent.querySelector('a')?.getAttribute('style').match(/url\(\'(.*)\'\)/) ?? null;
        let image;
        if (imageMatch && Array.isArray(imageMatch) && imageMatch.length === 2) {
          image = imageMatch[1]
        }

        return {
          image,
          venueEventUrl,
          location: 'depul',
          title,
          startDate,
          shortText,
        }
      })
  }, { depulMonths, workerIndex: workerData.index });
  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}


async function eventAsyncCheck(eventGen, currentEvent = null, checkedEvents = []) {

  const firstCheckText = `${currentEvent?.title ?? ''} ${currentEvent?.shortText ?? ''}`;
  if (
    firstCheckText.includes('metal') ||
    firstCheckText.includes('punk') ||
    firstCheckText.includes('punx') ||
    firstCheckText.includes('noise') ||
    firstCheckText.includes('industrial')
  ) {
    currentEvent.passReason = `title and/or short text genre match`
    checkedEvents.push(currentEvent)
  } else {

    const tempPage = await browser.newPage();
    await tempPage.goto(currentEvent.venueEventUrl, {
      waitUntil: "load",
    });

    const rockMetalOpPagina = await tempPage.evaluate(() => {
      const tc = document.getElementById('content-box')?.textContent.toLowerCase() ?? '';
      return tc.includes('metal') ||
        tc.includes('punk') ||
        tc.includes('thrash') ||
        tc.includes('punx') ||
        tc.includes('noise') ||
        tc.includes('industrial')
    });

    if (rockMetalOpPagina) {
      currentEvent.passReason = `Page of event contained genres`
      checkedEvents.push(currentEvent)
    }

    await tempPage.close();

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
