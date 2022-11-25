import MusicEvent from "../mods/music-event.js";
import puppeteer from "puppeteer";
import { parentPort, workerData } from "worker_threads";
import EventsList from "../mods/events-list.js";
import fs from "fs";
import crypto from "crypto";
import fsDirections from "../mods/fs-directions.js";
import axios from "axios";
import * as _t from "../mods/tools.js";
import { letScraperListenToMasterMessageAndInit } from "../mods/generic-scraper.js";
import { QuickWorkerMessage } from "../mods/rock-worker.js";
const qwm = new QuickWorkerMessage(workerData);

letScraperListenToMasterMessageAndInit(scrapeInit);

async function scrapeInit() {
  parentPort.postMessage(qwm.workerInitialized());
  Promise.race([makeBaseEventList(), _t.errorAfterSeconds(30000)])
    .then((baseMusicEvents) => {
      parentPort.postMessage(qwm.workerStarted());
      const baseMusicEventsCopy = [...baseMusicEvents];
      return recursiveSingleGet(baseMusicEventsCopy);
    })
    .then(() => {
      parentPort.postMessage(qwm.workerDone(EventsList.amountOfEvents));
      EventsList.save(workerData.family, workerData.index);
      return true;
    })
    .catch((error) =>
      _t.handleError(error, workerData, `outer catch scrape ${workerData.family}`)
    )
    .finally(() => {
      // NO BROWSER USED
    });

}
async function makeBaseEventList() {
  const allRockBatch = await axios
    .get(
      `https://poppodiumboerderij.nl/includes/ajax/events.php?filters=7,8,9,6&search=&limit=15&offset=${workerData.index * 15
      }&lang_id=1&rooms=&month=&year=`
    )
    .then((response) => {
      return response.data;
    });

  if (!allRockBatch.length) return true;
  allRockBatch.forEach((event) => {
    event.image = `https://lift3cdn.nl/image/115/784x476/${event.file}`;
  });

  return allRockBatch

}

async function recursiveSingleGet(baseMusicEvents) {
  qwm.todo(baseMusicEvents.length).forEach((JSONblob) => {
    parentPort.postMessage(JSONblob);
  });  
  const newMusicEvents = [...baseMusicEvents];
  const firstMusicEvent = newMusicEvents.shift();

  const ajaxRes = await axios
    .get(
      `https://poppodiumboerderij.nl/includes/ajax.inc.php?id=${firstMusicEvent.id}&action=getEvent&lang_id=1`
    )
    .then((response) => {
      return response.data;
    })
    .catch((error) => {
      _t.handleError(error, workerData, `recursive single get fail`)
    });

  let uuid = crypto.randomUUID();
  const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;

  const youtubeVideoIDMatch =
    ajaxRes?.video ?? ajaxRes.video.match(/embed\/(\w+)?/);
  let youtubeIframe;
  if (youtubeVideoIDMatch && youtubeVideoIDMatch.length) {
    youtubeIframe = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${youtubeVideoIDMatch[0]}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  }
  const longText = `${ajaxRes.description}<br>${youtubeIframe}`;
  fs.writeFile(longTextPath, longText, "utf-8", () => { });

  let price = ajaxRes?.ticket_price?.replace("-", "00").replace(",", ".");
  if (isNaN(Number(price))) {
    price = ajaxRes.ticket_price;
  }

  const musicEvent = new MusicEvent({
    ...firstMusicEvent,
    boerderijID: ajaxRes.id,
    title: `${ajaxRes.title} ${ajaxRes?.subTitle ?? ""}`,
    shortText: ajaxRes.intro,
    longText: longTextPath,
    startDateTime: new Date(`${ajaxRes.event_date}T${ajaxRes.event_start}`).toISOString(),
    doorOpenDateTime: new Date(`${ajaxRes.event_date}T${ajaxRes.event_open}`).toISOString(),
    location: "boerderij",
    price,
    venueEventUrl: "https://poppodiumboerderij.nl/",
  });

  musicEvent.registerIfValid();

  return newMusicEvents.length
    ? await recursiveSingleGet(newMusicEvents)
    : true;
}
