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

  const axiosRes = await axios
    .get(this.puppeteerConfig.app.mainPage.url)
    .then(( response )=> {
      return response.data;
    })
    .catch((err)=> {
      _t.handleError(err, workerData, 'main axios fail')
    })

  const rawEvents = axiosRes.map(axiosResultSingle =>{
    return {
      venueEventUrl: axiosResultSingle.link,
      title: axiosResultSingle.title.rendered,
      location: 'deflux',
      id: axiosResultSingle.id
    }
  })
  
  if (!rawEvents.length) return true;

  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents}
  );

};

// GET PAGE INFO

defluxScraper.getPageInfo = async function ({ page }) {
 
  const {stopFunctie} =  await this.getPageInfoStart()

  const pageInfo = await page.evaluate(() => {
    const res = {
      unavailable: "",
      pageInfoID: `<a href='${document.location.href}'>${document.title}</a>`,
      errorsVoorErrorHandler: [],
    };

    const eventScheme = document.querySelector('.evo_event_schema');
    if(!eventScheme) {
      res.unavailable += ` geen event scheme gevonden` 
    }

    res.image = eventScheme.querySelector('[itemprop="image"]')?.getAttribute('content') ?? '';
    res.startDate = eventScheme.querySelector('[itemprop="startDate"]')?.getAttribute('content').split('T')[0].split('-').map(dateStuk => dateStuk.padStart(2, '0')).join('-')
    try {
      res.startTime = document.querySelector('.evcal_time.evo_tz_time').textContent.match(/\d\d:\d\d/)[0];
      res.startDateTime = new Date(`${res.startDate}T${res.startTime}:00`).toISOString()
    } catch (error) {
      res.errorsVoorErrorHandler.push({error, remarks: 'starttime match'})
    }
    
    if (!res.startDateTime) {
      res.unavailable += ' geen start date time'
    }

    if (document.querySelector('.evcal_desc3')?.textContent.toLowerCase().includes('deur open') ?? false) {
      try {
        res.endTime = document.querySelector('.evcal_desc3').textContent.match(/\d\d:\d\d/)[0];
        res.endDateTime = new Date(`${res.startDate}T${res.endTime}:00`).toISOString();
      } catch (error) {
        //res.errorsVoorErrorHandler.push({error, remarks: 'door open starttime match'})
      }
    }
    
    res.price = eventScheme.querySelector('[itemprop="event-price"]')?.getAttribute('content') ?? '';
    res.longTextHTML = document.querySelector('[itemprop="description"]')?.innerHTML ?? '';
    return res;
  }, null);

  return await this.getPageInfoEnd({pageInfo, stopFunctie})

};
