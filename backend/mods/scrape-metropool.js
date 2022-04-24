import MusicEvent from "./music-event.js";
import puppeteer from "puppeteer";
import { parentPort } from "worker_threads";
import EventsList from "./events-list.js";
import {
  handleError,
  errorAfterSeconds,
  basicMusicEventsFilter,
  log,
  saveLongTextHTML,
  postPageInfoProcessing,
  autoScroll,
} from "./tools.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";

letScraperListenToMasterMessageAndInit(scrapeMetropool);

async function scrapeMetropool(workerIndex) {
  const browser = await puppeteer.launch();

  try {
    const baseMusicEvents = await Promise.race([
      makeBaseEventList(browser, workerIndex),
      errorAfterSeconds(15000),
    ]);
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
    EventsList.save("metropool", workerIndex);
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
  const cheatForBasicEventsFilter = [firstMusicEvent].filter(
    basicMusicEventsFilter
  );
  if (firstMusicEvent.isValid && cheatForBasicEventsFilter.length) {
    firstMusicEvent.register();
  }

  page.close();

  return newMusicEvents.length
    ? processSingleMusicEvent(browser, newMusicEvents, workerIndex)
    : true;
}

async function getPageInfo(page) {
  let pageInfo;

  const months = {
    jan: "01",
    feb: "02",
    mrt: "03",
    apr: "04",
    mei: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    okt: "10",
    nov: "11",
    dec: "12",
  };

  try {
    pageInfo = await page.evaluate((months) => {
      const res = {};

      res.cancelReason = "";
      res.title = document.querySelector(".event-title-js")?.textContent.trim();

      res.priceTextcontent =
        document.querySelector(".doorPrice")?.textContent.trim() ?? null;

      res.longTextHTML =
        Array.from(document.querySelectorAll(".event-title-wrap ~ div"))
          .map((divEl) => {
            return divEl.outerHTML;
          })
          .join("") ?? null;

      try {
        const startDateRauwMatch = document
          .querySelector(".event-title-wrap")
          ?.innerHTML.match(
            /(\d{1,2})\s*(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)\s*(\d{4})/
          );
        let startDate;
        if (startDateRauwMatch && startDateRauwMatch.length) {
          const day = startDateRauwMatch[1];
          const month = months[startDateRauwMatch[2]];
          const year = startDateRauwMatch[3];
          startDate = `${year}-${month}-${day}`;
        }

        if (startDate) {
          const startTimeMatch = document
            .querySelector(".beginTime")
            ?.innerHTML.match(/\d\d:\d\d/);
          if (startTimeMatch && startTimeMatch.length) {
            res.startDateTime = new Date(
              `${startDate}:${startTimeMatch[0]}`
            ).toISOString();
          }
          const doorTimeMatch = document
            .querySelector(".doorOpen")
            ?.innerHTML.match(/\d\d:\d\d/);
          if (doorTimeMatch && doorTimeMatch.length) {
            res.doorOpenDateTime = new Date(
              `${startDate}:${doorTimeMatch[0]}`
            ).toISOString();
          }
        }
      } catch (error) { }
      res.image = document.querySelector(".object-fit-cover")
        ? `https://metropool.nl/${document.querySelector(".object-fit-cover")?.srcset
        }`
        : null;

      res.location = "metropool";

      return res;
    }, months);
    return pageInfo;
  } catch (error) {
    handleError(error);
    handleError(pageInfo);
    return pageInfo;
  }
}

async function makeBaseEventList(browser, workerIndex) {
  const page = await browser.newPage();
  await page.goto("https://metropool.nl/zoeken?text=metal", {
    waitUntil: "load",
  });
  await autoScroll(page);

  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(
      document.querySelectorAll("#search-content a[href*='agenda']")
    )
      .filter((rawEvent, index) => {
        return index % 4 === workerIndex;
      })
      .map((rawEvent) => {
        return {
          venueEventUrl: rawEvent.href,
        };
      });
  }, workerIndex);
  return rawEvents.map((event) => new MusicEvent(event));
}
