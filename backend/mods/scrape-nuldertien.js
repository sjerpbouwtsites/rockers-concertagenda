import MusicEvent from "./music-event.js";
import puppeteer from "puppeteer";
import { parentPort } from "worker_threads";
import EventsList from "./events-list.js";
import fs from "fs";
import crypto from "crypto";
import fsDirections from "./fs-directions.js";
import { handleError, errorAfterSeconds, getPriceFromHTML } from "./tools.js";

parentPort.on("message", (messageData) => {
  if (messageData.command && messageData.command === "start") {
    try {
      scrapeNul13(messageData.data.page);
    } catch (error) {
      parentPort.postMessage({
        status: "error",
        message: "Algemene gevangen error nul13crape",
        data: error,
      });
    }
  }
});

async function scrapeNul13(workerIndex) {
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
  parentPort.postMessage({
    status: "working",
    message: `Will scrape ${baseMusicEvents.length} events.`,
  });

  return processSingleMusicEvent(
    browser,
    baseMusicEventsCopy,
    workerIndex
  ).finally(() => {
    setTimeout(() => {
      browser.close();
    }, 500);
    parentPort.postMessage({
      status: "done",
    });
    EventsList.save("nuldertien", workerIndex);
  });
}

async function processSingleMusicEvent(browser, baseMusicEvents, workerIndex) {
  if (baseMusicEvents.length % 5 === 0) {
    parentPort.postMessage({
      status: "console",
      message: `🦾 still ${baseMusicEvents.length} todo.`,
    });
  }

  const newMusicEvents = [...baseMusicEvents];
  const firstMusicEvent = newMusicEvents.shift();

  if (
    !firstMusicEvent ||
    baseMusicEvents.length === 0 ||
    !firstMusicEvent ||
    typeof firstMusicEvent === "undefined"
  ) {
    return true;
  }

  if (!firstMusicEvent.venueEventUrl) {
    return true;
  }

  const page = await browser.newPage();
  await page.goto(firstMusicEvent.venueEventUrl, {
    waitUntil: "load",
    timeout: 0,
  });

  try {
    const pageInfo = await Promise.race([
      getPageInfo(page),
      errorAfterSeconds(15000),
    ]);

    if (pageInfo && (pageInfo.priceTextcontent || pageInfo.priceContextText)) {
      pageInfo.price = getPriceFromHTML(
        pageInfo.priceTextcontent,
        pageInfo.priceContextText
      );
    }

    if (pageInfo && pageInfo.longTextHTML) {
      let uuid = crypto.randomUUID();
      const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;

      fs.writeFile(longTextPath, pageInfo.longTextHTML, "utf-8", () => {});
      pageInfo.longText = longTextPath;
    }

    // no date no registration.
    if (pageInfo && !pageInfo.cancelReason) {
      delete pageInfo.cancelReason;
      firstMusicEvent.merge(pageInfo);
    } else if (pageInfo.cancelReason !== "") {
      parentPort.postMessage({
        status: "console",
        message: `Incomplete info for ${firstMusicEvent.title}`,
      });
    } else {
      const pageInfoError = new Error(`unclear why failure at: ${
        firstMusicEvent.title
      }
      ${JSON.stringify(pageInfo)}
       ${JSON.stringify(firstMusicEvent)}`);
      handleError(pageInfoError);
    }
    firstMusicEvent.register();

    page.close();
  } catch (error) {
    handleError(error);
  }

  if (newMusicEvents.length) {
    return processSingleMusicEvent(browser, newMusicEvents, workerIndex);
  } else {
    return true;
  }
}

async function getPageInfo(page, months) {
  let pageInfo = {};
  pageInfo.cancelReason = "";
  try {
    pageInfo = await page.evaluate(
      ({ months }) => {
        let image = "";
        const imageEl = document.querySelector(".event-spotlight__image");
        if (!!imageEl) {
          image = imageEl.src;
        }

        let priceTextcontent =
          document.querySelector(".practical-information tr:first-child dd")
            ?.textContent ?? null;
        let priceContextText =
          document.querySelector(".practical-information")?.textContent ?? null;

        const doorOpenEl = document.querySelector(
          ".timetable__times dl:first-child time"
        );
        let doorOpenDateTime;
        if (!!doorOpenEl) {
          doorOpenDateTime = new Date(
            doorOpenEl.getAttribute("datetime")
          ).toISOString();
        }

        const longTextHTMLEl = document.querySelector(
          ".event-detail header + div"
        );
        let longTextHTML = null;
        if (longTextHTMLEl) {
          longTextHTML = longTextHTMLEl.innerHTML;
        }

        return {
          image,
          priceTextcontent,
          priceContextText,
          doorOpenDateTime,
          longTextHTML,
        };
      },
      { months }
    );
    return pageInfo;
  } catch (error) {
    handleError(error);
    return pageInfo;
  }
}

async function makeBaseEventList(browser, workerIndex) {
  const page = await browser.newPage();
  await page.goto("https://www.013.nl/programma/heavy", {
    waitUntil: "load",
  });
  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".event-list-item"))
      .filter((eventEl, index) => {
        return index % 4 === workerIndex;
      })
      .map((eventEl) => {
        const res = {};
        res.title = "";

        const linkEl = eventEl.querySelector(".event-list-item__link");
        res.dataIntegrity = 10;

        if (!!linkEl) {
          res.venueEventUrl = linkEl.href;
        }
        const titleEl = eventEl.querySelector(".event-list-item__title");
        if (!!titleEl) {
          res.title = titleEl.textContent.trim();
        }
        const datumEl = eventEl.querySelector(".event-list-item__date");
        if (!!datumEl) {
          res.startDateTime = new Date(
            datumEl.getAttribute("datetime")
          ).toISOString();
        }
        res.location = "nul13";
        const subtitleEl = eventEl.querySelector(".event-list-item__subtitle");
        if (!!subtitleEl) {
          res.shortText = subtitleEl.textContent.trim();
        }
        return res;
      })
      .filter((musicEvent) => {
        if (!musicEvent || !musicEvent.title) {
          return false;
        }
        const lowercaseTitle = musicEvent.title.toLowerCase();
        return (
          !lowercaseTitle.includes("uitgesteld") &&
          !lowercaseTitle.includes("sold out") &&
          !lowercaseTitle.includes("gecanceld") &&
          !lowercaseTitle.includes("afgelast") &&
          !lowercaseTitle.includes("geannuleerd")
        );
      });
  }, workerIndex);
  return rawEvents.map((event) => new MusicEvent(event));
}
