import MusicEvent from "./music-event.js";
import puppeteer from "puppeteer";
import { parentPort } from "worker_threads";
import EventsList from "./events-list.js";
import { bibelotMonths } from "./months.js";
import {
  handleError,
  log,
  basicMusicEventsFilter,
  postPageInfoProcessing,
} from "./tools.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";

letScraperListenToMasterMessageAndInit(scrapeBibelot);
async function scrapeBibelot(workerIndex) {
  const browser = await puppeteer.launch({});

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
    EventsList.save("bibelot", workerIndex);
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
  return await page.evaluate((bibelotMonths) => {
    const res = {};
    try {
      const startDateEl = document.querySelector(".main-column h3");
      if (startDateEl) {
        const dateMatch = startDateEl.textContent.match(
          /(\d+)\s(\w+)\s(\d{4})/
        );
        if (dateMatch && dateMatch.length === 4) {
          let day = dateMatch[1].padStart(2, "0");
          let month = bibelotMonths[dateMatch[2]];
          let year = dateMatch[3];
          res.startDate = `${year}-${month}-${day}`;
          const startTimeElAr = Array.from(
            document.querySelectorAll(".meta-info")
          ).filter((metaInfo) => metaInfo.textContent.includes("Aanvang"));
          if (startTimeElAr && Array.isArray(startTimeElAr)) {
            const startTimeMatch =
              startTimeElAr[0].textContent.match(/\d\d:\d\d/);
            if (startTimeMatch && startTimeMatch.length) {
              res.startDateTime = new Date(
                `${res.startDate}T${startTimeMatch[0]}`
              ).toISOString();
            }
          }
          const EndTimeElAr = Array.from(
            document.querySelectorAll(".meta-info")
          ).filter((metaInfo) => metaInfo.textContent.includes("Sluit"));
          if (EndTimeElAr && Array.isArray(EndTimeElAr)) {
            const EndTimeMatch = EndTimeElAr[0].textContent.match(/\d\d:\d\d/);
            if (EndTimeMatch && EndTimeMatch.length) {
              res.endDateTime = new Date(
                `${res.startDate}T${EndTimeMatch[0]}`
              ).toISOString();
            }
          }
          const doorOpenElAr = Array.from(
            document.querySelectorAll(".meta-info")
          ).filter((metaInfo) => metaInfo.textContent.includes("Open"));
          if (doorOpenElAr && Array.isArray(doorOpenElAr)) {
            const doorOpenMatch =
              doorOpenElAr[0].textContent.match(/\d\d:\d\d/);
            if (doorOpenMatch && doorOpenMatch.length) {
              res.doorOpenDateTime = new Date(
                `${res.startDate}T${doorOpenMatch[0]}`
              ).toISOString();
            }
          }
        }
      }
    } catch (error) {}

    const verkoopElAr = Array.from(
      document.querySelectorAll(".meta-info")
    ).filter((metaInfo) => {
      return metaInfo?.textContent.toLowerCase().includes("verkoop");
    });

    if (verkoopElAr && Array.isArray(verkoopElAr) && verkoopElAr.length) {
      res.priceTextcontent = verkoopElAr[0].textContent;
    }

    res.longTextHTML =
      document.querySelector(".main-column .content")?.innerHTML ?? null;
    const imageMatch = document
      .querySelector(".achtergrond-afbeelding")
      ?.style.backgroundImage.match(/https.*.jpg|https.*.jpg/);
    if (imageMatch && imageMatch.length) {
      res.image = imageMatch[0];
    }
    return res;
  }, bibelotMonths);
}

async function makeBaseEventList(browser, workerIndex) {
  const page = await browser.newPage();
  await page.goto("https://bibelot.net/", {
    waitUntil: "load",
  });
  const rawEvents = await page.evaluate((bibelotMonths) => {
    return Array.from(
      document.querySelectorAll(
        '.event[class*="metal"], .event[class*="punk"], .event[class*="rock"]'
      )
    ).map((eventEl) => {
      const res = {};
      const titleEl = eventEl.querySelector("h1");
      res.title = titleEl ? titleEl.textContent.trim() : "";
      const shortTextEl = titleEl ?? titleEl.parentNode;
      const shortTextSplit = !!shortTextEl
        ? shortTextEl.textContent.split(res.title)
        : null;
      res.shortText = !!shortTextSplit ? shortTextSplit[1] : "";
      res.dataIntegrity = 10;
      const linkEl = eventEl.querySelector(".link");
      res.venueEventUrl = !!linkEl ? linkEl.href : null;
      res.location = "bibelot";

      return res;
    });
  }, bibelotMonths);
  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}
