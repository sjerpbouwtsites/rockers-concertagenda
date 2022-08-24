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
import { paradisoMonths } from "./months.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";

letScraperListenToMasterMessageAndInit(scrapeInit);

async function scrapeInit(workerIndex) {
  const browser = await puppeteer.launch({
    headLess: false,
  });

  try {
    const baseMusicEvents = await makeBaseEventList(browser, workerIndex);

    const eventGen = eventGenerator(baseMusicEvents);
    const nextEvent = eventGen.next().value;
    const checkedEvents = await eventAsyncCheck(browser, eventGen, nextEvent);
    await fillMusicEvents(browser, checkedEvents, workerIndex);
  } catch (error) {
    handleError(error, 'Generic error catch Paradiso scrape init');
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
    EventsList.save("paradiso", workerIndex);
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
  } else {
    log(firstMusicEvent)
  }

  page.close();

  return newMusicEvents.length
    ? processSingleMusicEvent(browser, newMusicEvents, workerIndex)
    : true;
}

async function getPageInfo(page) {

  try {
    await page.waitForSelector('.header-template-2__subcontent .date', {
      timeout: 7500
    })
  } catch (error) {
    handleError(error, 'Paradiso wacht op laden single pagina')
  }

  const result = await page.evaluate(paradisoMonths => {

    const res = {};

    const contentBox = document.querySelector('.header-template-2__description') ?? null;
    if (contentBox) {
      res.longTextHTML = contentBox.innerHTML;
    }

    const startDateMatch = document.querySelector('.header-template-2__subcontent .date')?.textContent.toLowerCase().match(/(\d{1,2})\s+(\w+)\s+(\d{4})/)
    if (startDateMatch && Array.isArray(startDateMatch) && startDateMatch.length === 4) {
      res.startDate = `${startDateMatch[3]}-${paradisoMonths[startDateMatch[2]]}-${startDateMatch[1].padStart(2, '0')}`
    }

    const timesMatch = document.querySelector('.template-2__content-header')?.textContent.match(/(\d\d:\d\d)/g) ?? null
    res.timesMatch = timesMatch;
    res.tijdText = document.querySelector('.template-2__content-header')?.textContent;
    if (timesMatch && Array.isArray(timesMatch) && timesMatch.length >= 1) {
      try {
        if (timesMatch.length === 1) {
          res.startDateTime = new Date(`${res.startDate}T${timesMatch[0]}:00`).toISOString()
        } else {
          res.doorOpenDateTime = new Date(`${res.startDate}T${timesMatch[0]}:00`).toISOString()
          res.startDateTime = new Date(`${res.startDate}T${timesMatch[1]}:00`).toISOString()
        }
      } catch (error) {
        res.error = `ongeldige tijden: ${timesMatch.join(' ')}\n${error.message}`;
      }

    }
    res.priceTextcontent = document.querySelector('.template-2__price-wrapper-container')?.textContent ?? null;
    return res;
  }, paradisoMonths);

  if (result.error) {
    handleError(new Error(result.error), 'Paradiso getPageInfo')
  }
  return result

}

async function makeBaseEventList(browser, workerIndex) {
  const page = await browser.newPage();
  await page.goto("https://www.paradiso.nl/nl/zoeken/categorie/", {
    waitUntil: "load",
  });
  try {
    await page.waitForSelector('[data-category="60102"]', {
      timeout: 2500
    })
  } catch (error) {
    handleError(error, 'Paradiso wacht op punk categorie')
  }
  await page.click('[data-category="60102"]')
  try {
    await page.waitForSelector('.block-list-search__submit', {
      timeout: 1000
    })
  } catch (error) {
    handleError(error, 'Paradiso wacht op submit knop filters')
  }
  await page.click('.block-list-search__submit')
  try {
    await page.waitForSelector('.event-list__item', {
      timeout: 5000
    })
  } catch (error) {
    handleError(error, 'Paradiso wacht op laden agenda na filter')
  }
  await waitFor(150);

  let rawEvents = await page.evaluate(({ paradisoMonths, workerIndex }) => {

    return Array.from(document.querySelectorAll('.event-list__item'))
      .filter((rawEvent, eventIndex) => {
        return eventIndex % 4 === workerIndex;
      })
      .map(rawEvent => {

        const title = rawEvent.querySelector('.event-list__item-title')?.textContent.trim() ?? '';
        const shortText = rawEvent.querySelector('.event-list__item-subtitle')?.textContent.trim() ?? '';
        const venueEventUrl = rawEvent.hasAttribute('href') ? rawEvent.href : null

        return {
          venueEventUrl,
          location: 'paradiso',
          title,
          shortText,
        }
      })
  }, { paradisoMonths, workerIndex });
  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}


async function eventAsyncCheck(browser, eventGen, currentEvent = null, checkedEvents = []) {

  const firstCheckText = `${currentEvent.title} ${currentEvent.shortText}`.toLowerCase();
  if (
    !firstCheckText.includes('indie') &&
    !firstCheckText.includes('dromerig') &&
    !firstCheckText.includes('shoegaze') &&
    !firstCheckText.includes('alternatieve rock')
  ) {
    checkedEvents.push(currentEvent)
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


// const startDay = rawEvent.querySelector('time .number')?.textContent.trim()?.padStart(2, '0') ?? null;
// const startMonthName = rawEvent.querySelector('.time month')?.textContent.trim() ?? null;
// const startMonth = depulMonths[startMonthName]
// const startMonthJSNumber = Number(startMonth) - 1;
// const refDate = new Date();
// let startYear = refDate.getFullYear();
// if (startMonthJSNumber < refDate.getMonth()) {
//   startYear = startYear + 1;
// }
// const startDate = `${startYear}-${startMonth}-${startDay}`
// const venueEventUrl = rawEvent.querySelector('a')?.href ?? null;

// const imageMatch = rawEvent.querySelector('a')?.getAttribute('style').match(/url\(\'(.*)\'\)/) ?? null;
// let image;
// if (imageMatch && Array.isArray(imageMatch) && imageMatch.length === 2) {
//   image = imageMatch[1]
// }