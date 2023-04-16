import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import axios from "axios";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const boerderijScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 30000,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 30000,
    },
    singlePage: {
      timeout: 20000
    },
    app: {
      mainPage: {
        useCustomScraper: true,
        url: `https://poppodiumboerderij.nl/includes/ajax/events.php?filters=7,8,9,6&search=&limit=15&offset=${
          workerData.index * 15
        }&lang_id=1&rooms=&month=&year=`,
        requiredProperties: ['venueEventUrl', 'title']
      }
    }
  }
}));

boerderijScraper.listenToMasterThread();

// MAKE BASE EVENTS

boerderijScraper.makeBaseEventList = async function () {

  const {stopFunctie} = await this.makeBaseEventListStart()

  const rawEvents = await axios
    .get(this.puppeteerConfig.app.mainPage.url)
    .then((response) => {
      return response.data;
    });

  if (rawEvents.length) {
    rawEvents.forEach((event) => {
      event.image = `https://lift3cdn.nl/image/115/784x476/${event.file}`;
      event.venueEventUrl = `https://poppodiumboerderij.nl/programma/${event.seo_slug}`;
      event.shortText = event.subtitle;
      event.title = event.title + `&id=${event.id}`;
    });
  } else {
    // debugger
  }

  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents}
  );

};

// GET PAGE INFO

boerderijScraper.getPageInfo = async function ({ event }) {
 
  const {stopFunctie} =  await this.getPageInfoStart()

  const [realEventTitle, realEventId] = event.title.split("&id=");
  event.title = realEventTitle;

  const res = {
    unavailable: event.unavailable,
    pageInfo: `<a class='page-info' href='${this.puppeteerConfig.app.mainPage.url}'>${event.title}</a>`,
    errors: [],
  };

  const url = `https://poppodiumboerderij.nl/includes/ajax.inc.php?id=${realEventId}&action=getEvent&lang_id=1`;
  const ajaxRes = await axios
    .get(url)
    .then((response) => {
      return response.data;
    })
    .catch(caughtError => {
      res.errors.push({
        error:caughtError,
        remarks: `ajax ${url} faal ${res.pageInfo}`,
      });
      res.unavailable += 'singlePage gecatched'
    });

  if (!ajaxRes) {
    res.unavailable += `ajax verzoek faalt naar ${url}`;
    return await this.getPageInfoEnd({res, stopFunctie})
  }

  try {
    const youtubeVideoIDMatch = ajaxRes?.video ?? ""; //ajaxRes.video.match(/embed\/(\w+)?/);
    let youtubeIframe;
    if (youtubeVideoIDMatch && youtubeVideoIDMatch.length) {
      youtubeIframe = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${youtubeVideoIDMatch[0]}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    }
    res.longTextHTML =`${ajaxRes.description}<br>${youtubeIframe}`;
  } catch (catchedError) {
    res.errors.push({
      error: catchedError,
      remarks: `Mislukt iframe te knutselen met video ${res.pageInfo}`,
    });
  }

  res.boerderijID = ajaxRes.id;

  try {
    
    res.priceTextcontent = `${ajaxRes?.entrance_price ?? ''} ${ajaxRes?.ticket_price ?? ''} `
  } catch (catchedError) {
    res.errors.push({
      error: catchedError,
      remarks: `prijsbewerking faal ${res.pageInfo}`,
    });
  }

  try {
    res.startDateTime = new Date(
      `${ajaxRes.event_date}T${ajaxRes.event_start}`
    ).toISOString();
  } catch (catchedError) {
    res.errors.push({
      error: catchedError,
      remarks: `startDateTime samenvoeging ${res.pageInfo}`,
    });
    res.unavailable += " geen startDateTime";
  }
  try {
    res.doorOpenDateTime = new Date(
      `${ajaxRes.event_date}T${ajaxRes.event_open}`
    ).toISOString();
  } catch (catchedError) {
    res.errors.push({
      error: catchedError,
      remarks: `doorOpenDateTime samenvoeging ${res.pageInfo}`,
    });
  }

  res.soldOut = ajaxRes?.label?.title?.toLowerCase().includes('uitverkocht') ?? null

  return await this.getPageInfoEnd({pageInfo: res, stopFunctie})

};
