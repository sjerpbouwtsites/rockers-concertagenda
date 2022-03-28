import axios from "axios";
import MusicEvent from "./music-event.js";
import puppeteer from "puppeteer";
import { parentPort } from "worker_threads";
import EventsList from "./events-list.js";
import fs from "fs";
import crypto from "crypto";
import fsDirections from "./fs-directions.js";
import { handleError, errorAfterSeconds } from "./tools.js";

parentPort.on("message", (messageData) => {
  if (messageData.command && messageData.command === "start") {
    try {
      scrapePatronaat(messageData.data.page);
    } catch (error) {
      parentPort.postMessage({
        status: "error",
        message: "Algemene gevangen error patronaatcrape",
        data: error,
      });
    }
  }
});

async function scrapePatronaat(workerIndex) {
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
    }, 5000);
    parentPort.postMessage({
      status: "done",
    });
    EventsList.save("patronaat", workerIndex);
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
        let price = null;
        let priceEl = document.querySelector(".event__info-bar--ticket-price");
        let errors = [];
        if (!!priceEl) {
          const match = priceEl.textContent.trim().match(/(\d\d)[\,\.]+(\d\d)/);
          if (match && match.length) {
            price = match[0].replace(",", ".");
          }
        }
        let startDatum = "";
        let startDatumMatch = document.location.href.match(
          /(\d\d)\-(\d\d)\-(\d\d)/
        );
        if (startDatumMatch && startDatumMatch.length > 3) {
          const j = `20${startDatumMatch[3]}`;
          const m = startDatumMatch[2];
          const d = startDatumMatch[1];
          startDatum = `${j}-${m}-${d}`;
        }

        let startDateTime;
        try {
          const startEl = document.querySelector(
            ".event__info-bar--start-time"
          );
          let startTime;
          if (!!startEl && !!startDatum) {
            const match = startEl.textContent.trim().match(/(\d\d)[\:]+(\d\d)/);
            if (match && match.length) {
              startTime = match[0];
              startDateTime = new Date(
                `${startDatum}T${startTime}:00`
              ).toISOString();
            }
          }
        } catch (error) {
          errors.push(error);
        }

        let doorOpenDateTime;
        try {
          const doorsEl = document.querySelector(
            ".event__info-bar--doors-open"
          );
          let doorsTime;
          if (!!doorsEl) {
            const match = doorsEl.textContent.trim().match(/(\d\d)[\:]+(\d\d)/);
            if (match && match.length) {
              doorsTime = match[0];
              doorOpenDateTime = new Date(
                `${startDatum}T${doorsTime}:00`
              ).toISOString();
            }
          }
        } catch (error) {
          errors.push(error);
        }

        let endDateTime;
        try {
          const endEl = document.querySelector(".event__info-bar--end-time");
          let endTime;
          if (!!endEl) {
            const match = endEl.textContent.trim().match(/(\d\d)[\:]+(\d\d)/);
            if (match && match.length) {
              endTime = match[0];
              endDateTime = new Date(`${startDatum}T${endTime}:00`);
              if (endDateTime < startDateTime) {
                endDateTime.setDate(startDateTime.getDate() + 1);
                endDateTime.setHours(startDateTime.getHours());
                endDateTime.setMinutes(startDateTime.getMinutes());
              }
            }
          }
          endDateTime = endDateTime.toISOString();
        } catch (error) {
          errors.push(error);
        }

        const longTextHTMLEl = document.querySelector(".event__content");
        let longTextHTML = null;
        if (longTextHTMLEl) {
          longTextHTML = longTextHTMLEl.innerHTML;
        }

        return {
          price,
          startDateTime,
          startDatumMatch,
          doorOpenDateTime,
          endDateTime,
          startDatum,
          longTextHTML,
        };
      },
      { months }
    );
    return pageInfo;
  } catch (error) {
    handleError(error);
    if (pageInfo.errors.length) {
      pageInfo.errors.forEach((error) => {
        handleError(error);
      });
    }
    return pageInfo;
  }
}

async function makeBaseEventList(browser, workerIndex) {
  const page = await browser.newPage();
  await page.goto(
    "https://patronaat.nl/programma/?type=event&s=&eventtype%5B%5D=84",
    {
      waitUntil: "load",
    }
  );
  const rawEvents = await page.evaluate((workerIndex) => {
    return Array.from(document.querySelectorAll(".overview__list-item--event"))
      .filter((eventEl, index) => {
        return index % 3 === workerIndex;
      })
      .map((eventEl) => {
        const res = {};
        res.title = "";
        const imageEl = eventEl.querySelector(".event__image img");
        if (!!imageEl) {
          res.image = imageEl.src;
        }
        const linkEl = eventEl.querySelector("a[href]");
        res.dataIntegrity = 10;

        if (!!linkEl) {
          res.venueEventUrl = linkEl.href;
        }
        const titleEl = eventEl.querySelector(".event__name");
        if (!!titleEl) {
          res.title = titleEl.textContent.trim();
        }
        res.location = "patronaat";
        const subtitleEl = eventEl.querySelector(".event__subtitle");
        if (!!subtitleEl) {
          res.shortText = subtitleEl.textContent.trim();
        }
        return res;
      })
      .filter((musicEvents) => {
        if (!musicEvents || !musicEvents.title) {
          return false;
        }
        const lowercaseTitle = musicEvents.title.toLowerCase();
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
