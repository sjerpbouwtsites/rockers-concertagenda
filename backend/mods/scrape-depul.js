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
import { depulMonths } from "./months.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";

letScraperListenToMasterMessageAndInit(scrapeInit);

async function scrapeInit(workerIndex) {
  const browser = await puppeteer.launch({
    headLess: false,
  });

  try {
    const baseMusicEvents = await makeBaseEventList(browser, workerIndex);
    // titles are written to inconsistent for other rock check method
    const eventGen = eventGenerator(baseMusicEvents);
    const nextEvent = eventGen.next().value;
    const checkedEvents = await eventAsyncCheck(browser, eventGen, nextEvent);

    await fillMusicEvents(browser, checkedEvents, workerIndex);
  } catch (error) {
    handleError(error, 'Generic error catch De Pul scrape init');
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
    EventsList.save("depul", workerIndex);
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
      })
    }
    return res;
  }, depulMonths);
}

async function makeBaseEventList(browser, workerIndex) {
  const page = await browser.newPage();
  await page.goto("https://www.livepul.com/agenda/", {
    waitUntil: "load",
  });

  let rawEvents = await page.evaluate(depulMonths => {

    // hack op site
    loadContent('all', 'music');

    return Array.from(document.querySelectorAll('.agenda-item'))
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
  }, depulMonths);
  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}


async function eventAsyncCheck(browser, eventGen, currentEvent = null, checkedEvents = []) {

  const firstCheckText = `${currentEvent.title} ${currentEvent.shortText}`;
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
      const tc = document.getElementById('content-box')?.textContent ?? '';
      return tc.includes('metal') ||
        tc.includes('punk') ||
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
    return eventAsyncCheck(browser, eventGen, nextEvent, checkedEvents)
  } else {
    return checkedEvents;
  }

}

function* eventGenerator(baseMusicEvents) {

  while (baseMusicEvents.length) {
    yield baseMusicEvents.shift();

  }
}
