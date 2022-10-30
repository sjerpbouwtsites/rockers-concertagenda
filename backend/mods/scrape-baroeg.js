import axios from "axios";
import MusicEvent from "./music-event.js";
import puppeteer from "puppeteer";
import { parentPort } from "worker_threads";
import EventsList from "./events-list.js";
import fs from "fs";
import crypto from "crypto";
import fsDirections from "./fs-directions.js";
import {
  handleError,
  basicMusicEventsFilter,
  errorAfterSeconds,
  log,
  getPriceFromHTML,
} from "./tools.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";

letScraperListenToMasterMessageAndInit(scrapeBaroeg);

async function scrapeBaroeg(workerIndex) {
  const months = {
    januari: "01",
    februari: "02",
    maart: "03",
    april: "04",
    mei: "05",
    juni: "06",
    juli: "07",
    augustus: "08",
    september: "09",
    oktober: "10",
    november: "11",
    december: "12",
  };

  try {
    const baseMusicEvents = await Promise.race([
      makeBaseEventList(workerIndex),
      errorAfterSeconds(20000),
    ]);
    await fillMusicEvents(baseMusicEvents, months, workerIndex);
  } catch (error) {
    handleError(error);
  }
}

async function fillMusicEvents(baseMusicEvents, months, workerIndex) {
  const browser = await puppeteer.launch();
  const baseMusicEventsCopy = [...baseMusicEvents];

  return processSingleMusicEvent(
    browser,
    baseMusicEventsCopy,
    months,
    workerIndex
  ).finally(() => {
    browser.close();
    parentPort.postMessage({
      status: "done",
      message: `Baroeg worker-${workerIndex} done.`,
    });
    EventsList.save("baroeg", workerIndex);
  });
}

async function processSingleMusicEvent(
  browser,
  baseMusicEvents,
  months,
  workerIndex
) {
  parentPort.postMessage({
    status: "todo",
    message: baseMusicEvents.length,
  });

  const newMusicEvents = [...baseMusicEvents];
  const firstMusicEvent = newMusicEvents.shift();

  if (!firstMusicEvent) {
    return true;
  }
  if (
    baseMusicEvents.length === 0 ||
    !firstMusicEvent ||
    typeof firstMusicEvent === "undefined"
  ) {
    return true;
  }
  const page = await browser.newPage();
  await page.goto(firstMusicEvent.venueEventUrl, {
    waitUntil: "load",
    timeout: 0,
  });

  try {
    const pageInfo = await Promise.race([
      getPageInfo(page, months, workerIndex),
      errorAfterSeconds(15000),
    ]);

    if (pageInfo && (pageInfo.priceElText || pageInfo.contextText)) {
      firstMusicEvent.price = getPriceFromHTML(
        pageInfo.priceText,
        pageInfo.contextText
      );
      delete pageInfo.price;
    }

    // no date no registration.
    if (pageInfo && !pageInfo.cancelReason) {
      delete pageInfo.cancelReason;
      firstMusicEvent.merge(pageInfo);
    } else if (pageInfo.cancelReason !== "") {
      // parentPort.postMessage({
      //   status: "console",
      //   message: `Incomplete info for ${firstMusicEvent.title}`,
      // });
    } else {
      const pageInfoError = new Error(`unclear why failure at: ${firstMusicEvent.title
        }
      ${JSON.stringify(pageInfo)}
       ${JSON.stringify(firstMusicEvent)}`);
      handleError(pageInfoError);
    }
    if (firstMusicEvent.startDateTime) {
      firstMusicEvent.register();
    }
  } catch (error) {
    handleError(error);
  }

  if (newMusicEvents.length) {
    return processSingleMusicEvent(
      browser,
      newMusicEvents,
      months,
      workerIndex
    );
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
        const ticketsEl = document.querySelector(".wp_theatre_event_tickets");

        if (!ticketsEl) {
          return {
            cancelReason: "no tickets available",
          };
        }

        const startDateEl = document.querySelector(
          ".wp_theatre_event_startdate"
        );
        if (!startDateEl) {
          return {
            cancelReason: "no start date found",
          };
        }
        let startDateTime = null;
        if (!!startDateEl) {
          let startDateSplit = startDateEl?.textContent
            .replace(",", "")
            .trim()
            .split(" ");
          if (startDateSplit.length > 2) {
            const startYear = startDateSplit[2];
            const startDay = startDateSplit[1].padStart(2, "0");
            const monthSplicesOf = startDateSplit[0];
            const startMonth = months[monthSplicesOf];
            const startDate = `${startYear}-${startMonth}-${startDay}`;
            const startTime = document
              .querySelector(".wp_theatre_event_starttime")
              .textContent.trim();
            startDateTime = new Date(`${startDate}T${startTime}`).toISOString();
          }
        }

        const priceElText =
          document.querySelector(".wp_theatre_event_tickets_url")
            ?.textContent ?? null;
        const contextText =
          document.getElementById("content")?.textContent ?? null;

        return {
          priceElText,
          startDateTime,
          contextText,
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

async function makeBaseEventList(page) {
  let errorMan = false;
  const baroegLijst = await axios
    .get(
      `https://baroeg.nl/wp-json/wp/v2/wp_theatre_prod?_embed&per_page=10&offset=${page * 10
      }&modified_after=2022-01-01T00:00:00Z`
    )
    .then((response) => {
      return response.data;
    })
    .catch((response) => {
      parentPort.postMessage({
        status: "console",
        message: axios.error(response),
      });
      errorMan = true;
    });

  if (errorMan) {
    return [];
  }

  const musicEvents = baroegLijst
    .map((event, index) => {
      delete event.yoast_head;
      delete event.yoast_head_json;

      const musicEventConf = {};
      musicEventConf.title = event.title.rendered;
      musicEventConf.shortText = event.excerpt.rendered;
      if (!event._embedded) {
        const title = event?.title?.rendered ?? '';
        const url = event?.link ?? '';
        handleError(`Event zonder _embedded. ${title} ${url}`, `Baroeg ${page}`)
        return null;
      }
      if (
        event._embedded["wp:featuredmedia"] &&
        event._embedded["wp:featuredmedia"].length
      ) {
        const fm0 = event._embedded["wp:featuredmedia"][0];
        musicEventConf.image =
          fm0?.media_details?.sizes?.medium_large?.source_url ??
          fm0?.media_details?.sizes?.thumbnail?.source_url;
        musicEventConf.venueEventUrl = event.link;
        musicEventConf.location = "baroeg";
        let uuid = crypto.randomUUID();
        const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;

        fs.writeFile(longTextPath, event.content.rendered, "utf-8", () => { });
        musicEventConf.longText = longTextPath;
      }
      return new MusicEvent(musicEventConf);
    })
    .filter(basicMusicEventsFilter);
  return musicEvents;
}
