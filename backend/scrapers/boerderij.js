import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import axios from "axios";
import makeScraperConfig from "./gedeeld/scraper-config.js";

//#region [rgba(0, 60, 0, 0.3)]       SCRAPER CONFIG
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
//#endregion                          SCRAPER CONFIG

boerderijScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.3)]      RAW EVENT CHECK
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
//#endregion                          RAW EVENT CHECK

//#region [rgba(0, 180, 0, 0.3)]      SINGLE EVENT CHECK
//#endregion                          SINGLE EVENT CHECK

//#region [rgba(0, 240, 0, 0.3)]      BASE EVENT LIST
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
//#endregion                          BASE EVENT LIST


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
  const priceRes = await this.boerderijCustomPrice(`${ajaxRes?.entrance_price ?? ''} ${ajaxRes?.ticket_price ?? ''}`, res.pageInfo, res.title);
  res.errors = res.errors.concat(priceRes.errors);
  res.price = priceRes.price;
  this.dirtyTalk(res.price)
    
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

  // LONG HTML HIER WANT BOERDERIJ VIA AJAX.....
  // #region [rgba(60, 0, 0, 0.5)]     LONG HTML

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

  // #endregion                        LONG HTML

  res.soldOut = ajaxRes?.label?.title?.toLowerCase().includes('uitverkocht') ?? null

  return await this.getPageInfoEnd({pageInfo: res, stopFunctie})

};


boerderijScraper.boerderijCustomPrice = async function (testText, pi, title) {
  let priceRes = {
    price: null,
    errors: []
  };
  if (!testText) {
    priceRes.errors.push({
      remarks: 'geen testText'
    })
    return priceRes
  } 

  if (testText.match(/start/i)) {
    priceRes.price = null;
    this.debugPrice && this.dirtyDebug({
      title: title,
      price:priceRes.price,
      type: 'NOG ONBEKEND',
    })      
    return priceRes
  }

  if (testText.match(/gratis|free/i)) {
    priceRes.price = 0;
    this.debugPrice && this.dirtyDebug({
      title: title,
      price:priceRes.price,
      type: 'GRATIS',
    })      
    return priceRes
  }

  if (testText.match(/uitverkocht|sold\sout/i)) {
    priceRes.price = null;
    this.debugPrice && this.dirtyDebug({
      title: title,
      price:priceRes.price,
      type: 'UITVERKOCHT',
    })      
    return priceRes
  }

  const priceMatch = testText
    .replaceAll(/[\s\r\t ]/g,'')
    .match(/(?<euros>\d+)(?<scheiding>[,.]?)(?<centen>\d\d|-)/);

  const priceMatchEuros = testText
    .replaceAll(/[\s\r\t ]/g,'')
    .match(/\d+/);

  if (!Array.isArray(priceMatch) && !Array.isArray(priceMatchEuros)) {
    priceRes.errors.push({
      remarks: `geen match met ${pi}`, 
    });
    return priceRes
  }

  if (!Array.isArray(priceMatch) && Array.isArray(priceMatchEuros)){
    priceRes.price = Number(priceMatchEuros[0]);
    this.checkIsNumber(priceRes, pi)
    this.debugPrice && this.dirtyDebug({
      title: title,
      price:priceRes.price,
    })      
    return priceRes;
  }

  if (priceMatch.groups?.centen && priceMatch.groups?.centen.includes('-')){
    priceMatch.groups.centen = '00';
  }

  try {
    if (priceMatch.groups.scheiding){
      if (priceMatch.groups.euros && priceMatch.groups.centen){
        priceRes.price = (Number(priceMatch.groups.euros) * 100 + Number(priceMatch.groups.centen)) / 100;
      }
      if (priceMatch.groups.euros){
        priceRes.price = Number(priceMatch.groups.euros)
      }
    } else {
      priceRes.price = Number(priceMatch.groups.euros)
    }
    this.checkIsNumber(priceRes, pi)
    this.debugPrice && this.dirtyDebug({
      title: title,
      price: priceRes.price
    })      
    return priceRes;

  } catch (priceCalcErr) {
    
    priceRes.push({
      error: priceCalcErr,
      remarks: `price calc err ${pi}`, 
      toDebug: {testText, priceMatch, priceRes}
    });
    return priceRes
    
  }

  return priceRes;

}  