import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import axios from "axios";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const boerderijScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 30004,
  workerData: Object.assign({}, workerData),
  hasDecentCategorisation: true,
  puppeteerConfig: {
    mainPage: {
      timeout: 30005,
    },
    singlePage: {
      timeout: 20006
    },
    app: {
      mainPage: {
        useCustomScraper: true,
        url: `https://poppodiumboerderij.nl/includes/ajax/events.php?filters=6,7,8&search=&limit=15&offset=${
          workerData.index * 15
        }&lang_id=1&rooms=&month=&year=`,
        requiredProperties: ['venueEventUrl', 'title']
      },
      singlePage: {
        requiredProperties: ['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  }
}));

boerderijScraper.singleRawEventCheck = async function(event){

  const isRefused = await this.rockRefuseListCheck(event, event.title)
  if (isRefused.success) return {
    reason: isRefused.reason,
    event,
    success: false
  };

  const isAllowed = await this.rockAllowListCheck(event, event.title)
  if (isAllowed.success) return isAllowed;

  const hasForbiddenTerms = await this.hasForbiddenTerms(event, ['title']);
  if (hasForbiddenTerms.success) {
    await this.saveRefusedTitle(event.title.toLowerCase())
    return {
      reason: hasForbiddenTerms.reason,
      success: false,
      event
    }
  }

  return {
    reason: [isRefused.reason, isAllowed.reason, hasForbiddenTerms.reason].join(';'),
    event,
    success: true
  }
  
}

boerderijScraper.listenToMasterThread();

// MAKE BASE EVENTS

boerderijScraper.makeBaseEventList = async function () {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.family);
  if (availableBaseEvents){
    const thisWorkersEvents = availableBaseEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: thisWorkersEvents}
    );    
  }   

  const {stopFunctie} = await this.makeBaseEventListStart()

  let rawEvents = await axios
    .get(this.puppeteerConfig.app.mainPage.url)
    .then((response) => {
      return response.data;
    });

  if (rawEvents.length) {
    rawEvents = rawEvents.map((event) => {
      event.image = `https://lift3cdn.nl/image/115/784x476/${event.file}`;
      event.venueEventUrl = `https://poppodiumboerderij.nl/programma/${event.seo_slug}`;
      event.shortText = event.subtitle;
      event.title = event.title + `&id=${event.id}`;
      return event;
    })
      .map(this.isMusicEventCorruptedMapper);
  }

  this.saveBaseEventlist(workerData.family, rawEvents)
  const thisWorkersEvents = rawEvents.filter((eventEl, index) => index % workerData.workerCount === workerData.index)
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: thisWorkersEvents}
  );

};

// GET PAGE INFO

boerderijScraper.getPageInfo = async function ({ event }) {
 
  const {stopFunctie} =  await this.getPageInfoStart()

  const [realEventTitle, realEventId] = event.title.split("&id=");
  event.title = realEventTitle;

  const res = {

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
        errorLevel: 'close-thread',
        toDebug: event,
      });
    });

  

  if (!ajaxRes) {
    res.corrupted += `ajax verzoek faalt naar ${url}`;
    return await this.getPageInfoEnd({res, stopFunctie})
  }

  if (!event.image){
    res.errors.push({
      remarks: `image missing ${res.pageInfo}`
    })
  }

  res.boerderijID = ajaxRes.id;
  res.priceTextcontent = `${ajaxRes?.entrance_price ?? ''} ${ajaxRes?.ticket_price ?? ''} `
  

  try {
    res.startDateTime = new Date(
      `${ajaxRes.event_date}T${ajaxRes.event_start}`
    ).toISOString();
  } catch (catchedError) {
    res.errors.push({
      error: catchedError,
      remarks: `startDateTime samenvoeging ${res.pageInfo}`,
      toDebug:res,
    });
  }
  try {
    res.doorOpenDateTime = new Date(
      `${ajaxRes.event_date}T${ajaxRes.event_open}`
    ).toISOString();
  } catch (catchedError) {
    res.errors.push({
      error: catchedError,
      remarks: `doorOpenDateTime samenvoeging ${res.pageInfo}`,
      toDebug:res,
    });
  }

  // #region longHTML

  // media obj maken voordat HTML verdwijnt
  res.mediaForHTML = !ajaxRes?.video ? [] : [{
    outer: ajaxRes.video,
    src: null,
    id: null,
    type: 'youtube'
  }] // socials obj maken voordat HTML verdwijnt
  res.socialsForHTML = []

  // tekst.
  res.textForHTML = ajaxRes.description

  // #endregion longHTML


  res.soldOut = ajaxRes?.label?.title?.toLowerCase().includes('uitverkocht') ?? null

  return await this.getPageInfoEnd({pageInfo: res, stopFunctie})

};
