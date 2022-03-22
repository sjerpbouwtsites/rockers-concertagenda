import axios from "axios";
import MusicEvent from "./music-event.js";
import locations from "./locations.js";
import puppeteer from "puppeteer";
import { parentPort } from "worker_threads";
import EventsList from "./events-list.js";
import fs from "fs";
import crypto from "crypto";
import path from "path";

parentPort.on("message", (messageData) => {
  if (messageData.command && messageData.command === "start") {
    try {
      scrapeBaroeg(messageData.data.page);
    } catch (error) {
      parentPort.postMessage({
        status: "error",
        message: "Algemene gevangen error baroegscrape",
        data: error,
      });
    }
  }
});

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

  const baseMusicEvents = await makeBaseEventList(workerIndex);
  const filledMusicEvents = await fillMusicEvents(
    baseMusicEvents,
    months,
    workerIndex
  );

  parentPort.postMessage({
    status: "done",
    message: `Baroeg worker-${workerIndex} done.`,
  });
  EventsList.save("baroeg");
}

async function fillMusicEvents(baseMusicEvents, months, workerIndex) {
  const browser = await puppeteer.launch();
  const baseMusicEventsCopy = [...baseMusicEvents];
  parentPort.postMessage({
    status: "working",
    message: `Baroeg worker-${workerIndex} will scrape ${baseMusicEvents.length} events.`,
  });

  return processSingleMusicEvent(
    browser,
    baseMusicEventsCopy,
    months,
    workerIndex
  );
}

async function processSingleMusicEvent(
  browser,
  baseMusicEvents,
  months,
  workerIndex
) {
  if (baseMusicEvents.length % 3 === 0) {
    parentPort.postMessage({
      status: "console",
      message: `🦾 Baroeg worker-${workerIndex} has still ${baseMusicEvents.length} todo.`,
    });
  }

  const newMusicEvents = [...baseMusicEvents];
  const firstMusicEvent = newMusicEvents.shift();
  if (
    baseMusicEvents.length === 0 ||
    !firstMusicEvent ||
    typeof firstMusicEvent === "undefined"
  ) {
    return true;
  }
  const page = await browser.newPage();
  await page.goto(firstMusicEvent.venueEventUrl);

  const pageInfo = await getPageInfo(page, months);

  // no date no registration.
  if (pageInfo.startDateTime) {
    firstMusicEvent.merge(pageInfo);
    firstMusicEvent.register();
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
  return await page.evaluate(
    ({ months }) => {
      const startDateEl = document.querySelector(".wp_theatre_event_startdate");
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

      let price = null;
      let priceEl = document.querySelector(".wp_theatre_event_tickets_url");
      if (!!priceEl) {
        const match = priceEl.textContent.trim().match(/(\d\d[\,\.]+\d\d)/);
        if (match && match.length) {
          price = match[0];
        }
      }
      return {
        price,
        startDateTime,
      };
    },
    { months }
  );
}

async function makeBaseEventList(page) {
  let errorMan = false;
  const baroegLijst = await axios
    .get(
      `https://baroeg.nl/wp-json/wp/v2/wp_theatre_prod?_embed&per_page=9&offset=${
        page * 9
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

  const musicEvents = baroegLijst.map((event, index) => {
    delete event.yoast_head;
    delete event.yoast_head_json;

    const musicEventConf = {};
    musicEventConf.title = event.title.rendered;
    musicEventConf.shortText = event.excerpt.rendered;
    if (
      event._embedded["wp:featuredmedia"] &&
      event._embedded["wp:featuredmedia"].length
    ) {
      const fm0 = event._embedded["wp:featuredmedia"][0];
      musicEventConf.image = fm0?.media_details?.sizes?.medium_large?.file;
      musicEventConf.venueEventUrl = event.link;
      musicEventConf.location = "baroeg";
      let uuid = crypto.randomUUID();
      const longTextPath = path.resolve(`./texts/${uuid}.html`);

      fs.writeFile(longTextPath, event.content.rendered, "utf-8", () => {});
      musicEventConf.longText = longTextPath;
      musicEventConf.dataIntegrity = 10;
    }
    return new MusicEvent(musicEventConf);
  });
  return musicEvents;
}
