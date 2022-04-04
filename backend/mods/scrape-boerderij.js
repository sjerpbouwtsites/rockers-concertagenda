import MusicEvent from "./music-event.js";
import fs from "fs";
import crypto from "crypto";
import { parentPort } from "worker_threads";
import EventsList from "./events-list.js";
import axios from "axios";
import fsDirections from "./fs-directions.js";
import { letScraperListenToMasterMessageAndInit } from "./generic-scraper.js";

letScraperListenToMasterMessageAndInit(scrapeBoerderij);

async function scrapeBoerderij(workerIndex) {
  await getBaseMusicEvents(workerIndex);

  parentPort.postMessage({
    status: "done",
    message: `Boerderij worker-${workerIndex} done.`,
  });
  EventsList.save("boerderij");
}
async function getBaseMusicEvents(workerIndex) {
  const allRockBatch = await axios
    .get(
      `https://poppodiumboerderij.nl/includes/ajax/events.php?filters=7,8,9,6&search=&limit=15&offset=${
        workerIndex * 15
      }&lang_id=1&rooms=&month=&year=`
    )
    .then((response) => {
      return response.data;
    });

  parentPort.postMessage({
    status: "todo",
    message: allRockBatch.length,
  });

  if (!allRockBatch.length) return true;
  allRockBatch.forEach((event) => {
    event.image = `https://lift3cdn.nl/image/115/784x476/${event.file}`;
  });

  await recursiveSingleGet(allRockBatch, workerIndex);
  return true;
}

async function recursiveSingleGet(baseMusicEvents, workerIndex) {
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
      parentPort.postMessage({
        status: "error",
        message: error,
      });
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
  fs.writeFile(longTextPath, longText, "utf-8", () => {});

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
    startDateTime: new Date(`${ajaxRes.event_date}T${ajaxRes.event_start}`),
    doorOpenDateTime: new Date(`${ajaxRes.event_date}T${ajaxRes.event_open}`),
    location: "boerderij",
    price,
    dataIntegrity: 10,
    venueEventUrl: "https://poppodiumboerderij.nl/",
  });

  musicEvent.register();

  if (newMusicEvents.length) {
    return recursiveSingleGet(newMusicEvents, workerIndex);
  } else {
    return true;
  }
}
