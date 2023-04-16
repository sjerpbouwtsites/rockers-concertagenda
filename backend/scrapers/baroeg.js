import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";

// SCRAPER CONFIG

const baroegScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 60000,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 45000,
    },
    singlePage: {
      timeout: 15000
    },
    app: {
      mainPage: {
        url: "  https://baroeg.nl/agenda-categorieen/",
        requiredProperties: ['venueEventUrl', 'title', 'startDateTime']
      }
    }    
  }
}));

baroegScraper.listenToMasterThread();

// MAKE BASE EVENTS

baroegScraper.makeBaseEventList = async function () {

  const {stopFunctie, page} = await this.makeBaseEventListStart()

  const rawEvents = await page.evaluate(({workerData}) => {
    const reedsGevondenEvents = [];
    const toegestaneCategorieen = `death metal,doom,hardcore,new wave,punk,hardcore punk,heavy rock 'n roll,symphonic metal,thrash,metalcore,black,crossover,grindcore,industrial,noise,post-punk,heavy metal,power metal,heavy psych,metal,surfpunkabilly`;
    return Array
      .from(document.querySelectorAll('.wpt_listing .wp_theatre_event'))
      .map(eventEl => {
        const venueEventUrl = eventEl.querySelector('.wp_theatre_event_title a + a').href;
        if (!reedsGevondenEvents.includes(venueEventUrl)){
          reedsGevondenEvents.push(venueEventUrl)
        } else {
          return false;
        }
        const categorieTeksten = Array.from(eventEl.querySelectorAll('.wpt_production_categories li')).map(li => {
          const categorieNaam = li.textContent.toLowerCase().trim();
          return categorieNaam
        });
        const heeftGoedeCategorie = categorieTeksten.some(categorieNaam => {
          return toegestaneCategorieen.includes(categorieNaam)
        })
        if (!heeftGoedeCategorie){
          return false;
        }
        return {
          eventEl,
          categorieTeksten,
          venueEventUrl
        }
      })
      .filter(eventData => eventData)
      .filter((eventData, index) => index % workerData.workerCount === workerData.index)
      .map(({eventEl,categorieTeksten,venueEventUrl}) => {
        const title = eventEl.querySelector('.wp_theatre_event_title')?.textContent.trim() ?? null;
        const res = {
          unavailable: "",
          pageInfo: `<a href='${document.location.href}'>${workerData.family} main - ${title}</a>`,
          errors: [],
        };
        res.title = title;
        res.shortText = eventEl.querySelector('.wp_theatre_prod_excerpt')?.textContent.trim() ?? null;
        res.shortText += categorieTeksten;
        res.image =eventEl.querySelector('.media .attachment-thumbnail')?.src.replace(/\d\d\dx\d\d\d/, '300x300') ?? null; //TODO opzoeken wat ideale maten zijn
        res.venueEventUrl =venueEventUrl;
        
        res.startDate = eventEl.querySelector('.wp_theatre_event_startdate')?.textContent.trim().substring(3,26).split('/').reverse() ?? null;
        if (!res.startDate) {
          res.unavailable += 'geen startdate gevonden';
          // debugger
          return res;
        }
        const startYear = res.startDate[0].padStart(4, '20');
        const startMonth = res.startDate[1].padStart(2, '0');
        const startDay = res.startDate[2].padStart(2, '0');
        res.startDate = `${startYear}-${startMonth}-${startDay}`;
        res.startTime = eventEl.querySelector('.wp_theatre_event_starttime')?.textContent ?? null;
        if (!res.startTime){
          res.unavailable += 'geen startDateTime etc gevonden';
          // debugger
          return res;   
        }
        try{
          res.startDateTime = new Date(`${res.startDate}T${res.startTime}:00`).toISOString();
        } catch (errorCaught) {
          res.errors.push({
            error: errorCaught,
            remarks: `date omzetting error ${res.pageInfo}`,
            // TODO debugger ${error.message}<br>${res.pageInfo}<br>${res.startDateTime}
          });
        }
        return res;
      })
  }, {workerData});

  return await this.makeBaseEventListEnd({
    stopFunctie, page, rawEvents}
  );
};

// GET PAGE INFO

baroegScraper.getPageInfo = async function ({ page, event }) {
  
  const {stopFunctie} =  await this.getPageInfoStart()

  const pageInfo = await page.evaluate(
    ({event}) => {
      const res = {
        unavailable: event.unavailable,
        pageInfo: `<a class='page-info' href='${document.location.href}'>${event.title}</a>`,
        errors: [],
      };

      res.priceTextcontent =
        document.querySelector(".wp_theatre_event_tickets")?.textContent ??
        '';

      const postContent = document.querySelector('.single-post .post-content') ?? null;
      if (postContent){
        const postHeading = postContent.querySelector('.wpt_events') ?? null;
        if (postHeading) {
          postContent.removeChild(postHeading)
        }
        const someH3 = postContent.querySelector('h3') ?? null;
        if (someH3) {
          postContent.removeChild(someH3)
        }
        res.longTextHTML = postContent.innerHTML;
      }
      res.soldOut = !!(document.querySelector('.wp_theatre_event_tickets_status_soldout') ?? null)

      return res;
    }, {event}
    
  );

  return await this.getPageInfoEnd({pageInfo, stopFunctie, page})
  
};


