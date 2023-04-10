import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import axios from "axios";
import makeScraperConfig from "./gedeeld/scraper-config.js";
import * as _t from "../mods/tools.js";

// SCRAPER CONFIG


const vandaag = new Date().toISOString().split('T')[0]
const defluxScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 30000,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 5000,
    },
    singlePage: {
      timeout: 20000
    },
    app: {
      mainPage: {
        useCustomScraper: true,
        url: `https://www.podiumdeflux.nl/wp-json/wp/v2/ajde_events?event_type=81,87,78,88,80&filter[startdate]=${vandaag}`,
        requiredProperties: ['venueEventUrl', 'title']
      }
    }
  }
}));

defluxScraper.listenToMasterThread();

// MAKE BASE EVENTS

defluxScraper.makeBaseEventList = async function () {

  const {stopFunctie} = await this.makeBaseEventListStart()

  const axiosRes = await axios //TODO naar fetch
    .get(this.puppeteerConfig.app.mainPage.url)
    .then(( response )=> {
      return response.data;
    })
    .catch((caughtError)=> {
      _t.handleError(caughtError, workerData, `main axios fail`, 'close-thread')
    })
  if (!axiosRes) return;
  const rawEvents = axiosRes.map(axiosResultSingle =>{
    const title = axiosResultSingle.title.rendered;
    const res = {
      unavailable: "",
      pageInfo: `<a class='pageinfo' href="${this.puppeteerConfig.app.mainPage.url}">${workerData.family} main - ${title}</a>`,
      errors: [],
      venueEventUrl: axiosResultSingle.link,
      id: axiosResultSingle.id,
      title,
    };    
    return res;
  })
  
  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents}
  );

};

// GET PAGE INFO

defluxScraper.getPageInfo = async function ({ page, event}) {
 
  const {stopFunctie} =  await this.getPageInfoStart()

  const pageInfo = await page.evaluate(({event}) => {

    const res = {
      unavailable: event.unavailable,
      pageInfo: `<a href='${document.location.href}'>${document.title}</a>`,
      errors: [],
    };

    const eventScheme = document.querySelector('.evo_event_schema');
    if(!eventScheme) {
      res.errors.push({error: new Error('HTML parsing error'), remarks: `geen event scheme gevonden ${res.pageInfo}`})
      res.unavailable += 'geen event scheme gevonden, geen data'
      return res;  
    }

    res.image = eventScheme.querySelector('[itemprop="image"]')?.getAttribute('content') ?? '';
    res.startDate = eventScheme.querySelector('[itemprop="startDate"]')?.getAttribute('content').split('T')[0].split('-').map(dateStuk => dateStuk.padStart(2, '0')).join('-')
    try {
      res.startTime = document.querySelector('.evcal_time.evo_tz_time').textContent.match(/\d\d:\d\d/)[0];
      res.startDateTime = new Date(`${res.startDate}T${res.startTime}:00`).toISOString()
    } catch (caughtError) {
      res.errors.push({error: caughtError, remarks: `starttime match ${res.pageInfo}`})
      return res;
    }

    if (document.querySelector('.evcal_desc3')?.textContent.toLowerCase().includes('deur open') ?? false) {
      try {
        res.endTime = document.querySelector('.evcal_desc3').textContent.match(/\d\d:\d\d/)[0];
        res.endDateTime = new Date(`${res.startDate}T${res.endTime}:00`).toISOString();
      } catch (caughtError) {
        res.errors.push({error: caughtError, remarks: `door open starttime match ${res.pageInfo}`})
      }
    }
    
    res.price = eventScheme.querySelector('[itemprop="event-price"]')?.getAttribute('content') ?? '';
    res.longTextHTML = document.querySelector('[itemprop="description"]')?.innerHTML ?? '';
    return res;
  }, {event});

  return await this.getPageInfoEnd({pageInfo, stopFunctie})

};
