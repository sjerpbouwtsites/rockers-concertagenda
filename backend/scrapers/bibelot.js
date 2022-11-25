import MusicEvent from "../mods/music-event.js";
import puppeteer from "puppeteer";
import { parentPort, workerData } from "worker_threads";
import EventsList from "../mods/events-list.js";
import {
  handleError,
  postPageInfoProcessing,
  errorAfterSeconds,
  basicMusicEventsFilter,
} from "../mods/tools.js";
import { letScraperListenToMasterMessageAndInit } from "../mods/generic-scraper.js";
import { QuickWorkerMessage } from "../mods/rock-worker.js";
import { bibelotMonths } from "../mods/months.js";
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

async function processSingleMusicEvent(baseMusicEvents) {
  qwm.todo(baseMusicEvents.length).forEach((JSONblob) => {
    parentPort.postMessage(JSONblob);
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

  const singleEventPage = await createSinglePage(firstMusicEvent.venueEventUrl);
  if (!singleEventPage) {
    return newMusicEvents.length
      ? processSingleMusicEvent(newMusicEvents)
      : true;
  }

  let pageInfo = await getPageInfo(singleEventPage);
  pageInfo = postPageInfoProcessing(pageInfo);
  firstMusicEvent.merge(pageInfo);
  firstMusicEvent.registerIfValid();
  if (!singleEventPage.isClosed() && singleEventPage.close());

  return newMusicEvents.length
    ? processSingleMusicEvent(newMusicEvents)
    : true;
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
    } catch (error) { 
      res.error = error;
    }

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

async function makeBaseEventList() {
  const page = await browser.newPage();
  await page.goto("https://bibelot.net/", {
    waitUntil: "load",
  });
  const rawEvents = await page.evaluate(() => {
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
      const linkEl = eventEl.querySelector(".link");
      res.venueEventUrl = !!linkEl ? linkEl.href : null;
      res.location = "bibelot";

      return res;
    });
  });
  return rawEvents
    .filter(basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
}
