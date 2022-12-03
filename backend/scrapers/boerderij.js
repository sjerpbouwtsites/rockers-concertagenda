import MusicEvent from "../mods/music-event.js";
import { parentPort, workerData } from "worker_threads";
import * as _t from "../mods/tools.js";
import AbstractScraper from "./abstract-scraper.js";
import axios from "axios";

// SCRAPER CONFIG

const scraperConfig = {
  baseEventTimeout: 15000,
  singlePageTimeout: 20000,
  maxExecutionTime: 30000,
  // @TODO maak geen puppeteer aan config
  workerData: Object.assign({}, workerData),
};
const boerderijScraper = new AbstractScraper(scraperConfig);

boerderijScraper.listenToMasterThread();

// MAKE BASE EVENTS

boerderijScraper.makeBaseEventList = async function () {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `makeBaseEventList is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);

  const rawEvents = await axios
    .get(
      `https://poppodiumboerderij.nl/includes/ajax/events.php?filters=7,8,9,6&search=&limit=15&offset=${
        workerData.index * 15
      }&lang_id=1&rooms=&month=&year=`
    )
    .then((response) => {
      return response.data;
    });

  if (!rawEvents.length) return true;
  rawEvents.forEach((event) => {
    event.image = `https://lift3cdn.nl/image/115/784x476/${event.file}`;
    event.venueEventUrl = `https://poppodiumboerderij.nl/programma/${event.seo_slug}`;
    event.shortText = event.subtitle;
    event.title = event.title + `&id=${event.id}`;
  });

  clearTimeout(stopFunctie);

  return rawEvents
    .map((event) => {
      (!event.venueEventUrl || !event.title) &&
        parentPort.postMessage(
          this.qwm.messageRoll(
            `Red het niet: <a href='${event.venueEventUrl}'>${event.title}</a> ongeldig.`
          )
        );
      return event;
    })
    .filter(_t.basicMusicEventsFilter)
    .map((event) => new MusicEvent(event));
};

// GET PAGE INFO

boerderijScraper.getPageInfo = async function ({ page, url, event }) {
  const stopFunctie = setTimeout(() => {
    throw new Error(
      `getPageInfo is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
    );
  }, this.maxExecutionTime);

  !page.isClosed() && page.close();

  const [realEventTitle, realEventId] = event.title.split("&id=");
  event.title = realEventTitle;

  const pageInfo = {
    unavailable: "",
    pageInfoID: `<a href='${event.venueEventUrl}'>${event.title}</a>`,
    errorsVoorErrorHandler: [],
    ...event,
  };

  ///

  const ajaxRes = await axios
    .get(
      `https://poppodiumboerderij.nl/includes/ajax.inc.php?id=${realEventId}&action=getEvent&lang_id=1`
    )
    .then((response) => {
      return response.data;
    })
    .catch((error) => {
      pageInfo.errorsVoorErrorHandler.push({
        error,
        remarks: `ajax req ${`https://poppodiumboerderij.nl/includes/ajax.inc.php?id=${realEventId}&action=getEvent&lang_id=1`} faal`,
      });
    });

  if (!ajaxRes) {
    pageInfo.unavailable += ` ajax verzoek faalt naar ${`https://poppodiumboerderij.nl/includes/ajax.inc.php?id=${realEventId}&action=getEvent&lang_id=1`}`;
    clearTimeout(stopFunctie);
    return pageInfo;
  }

  try {
    const youtubeVideoIDMatch = ajaxRes?.video ?? ""; //ajaxRes.video.match(/embed\/(\w+)?/);
    let youtubeIframe;
    if (youtubeVideoIDMatch && youtubeVideoIDMatch.length) {
      youtubeIframe = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${youtubeVideoIDMatch[0]}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    }
    pageInfo.longTextHTML = `${ajaxRes.description}<br>${youtubeIframe}`;
  } catch (error) {
    pageInfo.errorsVoorErrorHandler.push({
      error,
      remarks: "ajax fail lol",
    });
  }

  pageInfo.boerderijID = ajaxRes.id;

  try {
    let price = ajaxRes?.ticket_price?.replace("-", "00").replace(",", ".");
    if (isNaN(Number(price))) {
      price = ajaxRes?.ticket_price;
    }
    pageInfo.price = price;
  } catch (error) {
    pageInfo.errorsVoorErrorHandler.push({
      error,
      remarks: "prijsbewerking faal",
    });
  }

  try {
    pageInfo.startDateTime = new Date(
      `${ajaxRes.event_date}T${ajaxRes.event_start}`
    ).toISOString();
  } catch (error) {
    pageInfo.errorsVoorErrorHandler.push({
      error,
      remarks: "startDateTime samenvoeging",
    });
    pageInfo.unavailable += " geen startDateTime";
  }
  try {
    pageInfo.doorOpenDateTime = new Date(
      `${ajaxRes.event_date}T${ajaxRes.event_open}`
    ).toISOString();
  } catch (error) {
    pageInfo.errorsVoorErrorHandler.push({
      error,
      remarks: "doorOpenDateTime samenvoeging",
    });
  }
  pageInfo.location = "boerderij";

  pageInfo?.errorsVoorErrorHandler?.forEach((errorHandlerMeuk) => {
    _t.handleError(
      errorHandlerMeuk.error,
      workerData,
      errorHandlerMeuk.remarks
    );
  });

  clearTimeout(stopFunctie);

  if (!pageInfo) {
    return {
      unavailable: `Geen resultaat <a href="${url}">van pageInfo</a>`,
    };
  }
  return pageInfo;
};
