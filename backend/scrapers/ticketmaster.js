import { parentPort, workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";
import fs from 'fs';
import fsDirections from "../mods/fs-directions.js";
import * as _t from "../mods/tools.js";
import {workerNames} from "../mods/worker-config.js";


// SCRAPER CONFIG

const ticketmasterScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 30000,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 60000,
    },
    singlePage: {
      timeout: 30000
    },
    app: {
      mainPage: {
        useCustomScraper: true,
        url: `https://app.ticketmaster.com/discovery/v2/events.json?countryCode=NL&apikey=${workerData.masterEnv.TICKETMASTER_CONSUMER_KEY}&size=199&page=${workerData.index}`,
        requiredProperties: [],
        enforceMusicEventType: false, // TODO
      }, 
      singlePage: {
        useCustomScraper: true, // TODO in pageinfo mogelijk maken geen browser wordt gebruikt. Indien mainpage & singlepage allebei geen puppeteer dan cancel browser.
        requiredProperties: ['venueEventUrl', 'title'], //TODO inbouwen in abstractscraper
      }
    }
  }
}));

ticketmasterScraper.listenToMasterThread();

ticketmasterScraper.makeBaseEventList = async function() {

  const {stopFunctie} = await this.makeBaseEventListStart()

  let rawEvents = await fetch(this.puppeteerConfig.app.mainPage.url)
    .then(result => {
      
      return result.json()
    })
    .then(fetchedData => {

      fs.writeFile(`${fsDirections.temp + '/ticketmaster/raw'}/${workerData.index}.json`, JSON.stringify(fetchedData), "UTF-8", ()=>{})
      
      const res = fetchedData._embedded.events.map(rawEvent => {
        const copyEvent = {...rawEvent};
        copyEvent.image = copyEvent.images[0].url;
        delete copyEvent.images;
        copyEvent.attractions = editAttractionsInRaw(copyEvent?._embedded?.attractions ?? []);
        copyEvent.venue = (Array.isArray(copyEvent?._embedded?.venues) && copyEvent?._embedded?.venues.length) ? copyEvent._embedded.venues[0] : 'geenvenue'
        delete copyEvent._embedded;
        return copyEvent;
      });  
      
      
      return res;
    }).catch((response) => {
      _t.handleError(
        response,
        workerData,
        "ticketmaster mainpage fetch"
      );
    });

  if (!rawEvents.length) return true;

  fs.writeFileSync(`${fsDirections.temp + '/ticketmaster/trimmed'}/${workerData.index}.json`, JSON.stringify(rawEvents), "UTF-8")

  let filteredRawEvents = this.filterForMetal(rawEvents)
  filteredRawEvents = this.filterCoveredLocations(filteredRawEvents);

  return await this.makeBaseEventListEnd({
    stopFunctie, rawEvents: filteredRawEvents}
  );  
  
}

function editAttractionsInRaw(attractions){
  
  return attractions.map(attr => {
    delete attr.externalLinks;
    const image = attr.images[0].url;
    attr.image = image;
    delete attr.images;
    delete attr.upcomingEvents;
    return attr;
  }) ?? [];
  
}

// GET PAGE INFO

ticketmasterScraper.getPageInfo = async function ({event}) {
 
  const {stopFunctie} =  await this.getPageInfoStart()

  const pageInfo = {
    unavailable: "",
    pageInfoID: `<a href='${this.puppeteerConfig.app.mainPage.url}'>ticketMaster JSON page ${workerData.index}</a>`,
    errorsVoorErrorHandler: [],
  };

  pageInfo.startDateTime = event.dates?.start?.dateTime;
  if (pageInfo.startDateTime) {
    pageInfo.startDateTime = new Date(pageInfo.startDateTime).toISOString();
  }
  
  pageInfo.location = 'GEENLOCATIEBEKEND';
  if (event?.venue?.name){
    pageInfo.location = event?.venue?.name?.toLowerCase().replace(/\W/g,'')
    if (pageInfo.location === 'spotdeoosterpoort'){
      pageInfo.location = 'oosterpoort';
    }
    if (pageInfo.location === 'kinderboerderijleeuwarden') {
      pageInfo.location = 'oldehoofsterkerkhof';
    }
  } else if (event?.venue?.id === 'Z598xZbpZd6ak') {
    pageInfo.location = 'melkweg';
  } else if (event?.venue?.id === 'Z598xZbpZ7aak') {
    pageInfo.location = 'ijssportcentrum';
  } else if (event?.venue?.id === 'Z598xZbpZkde1') {
    pageInfo.location = 'musicon';
  } else if (event?.venue?.id === 'Z598xZbpZAdAF') {
    pageInfo.location = 'afaslive';
  }  
  
  else {
  
    parentPort.postMessage(this.qwm.debugger(event?.venue))
    _t.handleError(
      new Error('Geen locatie gevonden'),
      workerData,
      "getPageInfo ticketmaster."
    )    
  }


  pageInfo.venueEventUrl = event.url;
  pageInfo.title = event.name;
  const priceR = event.priceRanges
    .find(priceRange => {
      return priceRange.type.includes('fees')
    }) || event.priceRanges[0]
  pageInfo.price = Object.prototype.hasOwnProperty.call(priceR, 'max') && priceR.max
  if (event.attractions.length > 1) {
    pageInfo.shortTitle = event.attractions.reduce((prev, next) => {
      if (next.classifications[0] && next.classifications[0].genre?.name === 'Metal'){
        return prev + next.name + ", "
      } else {
        return prev;
      }
    }, 'Met oa: ')
    pageInfo.shortTitle = pageInfo.shortTitle.substring(0, pageInfo.shortTitle.length -2)
  }
  pageInfo.image = event.image;
  pageInfo.rescheduled = event.dates?.status?.code === 'rescheduled';
  pageInfo.unavailable = pageInfo.pageInfocheduled 
    ? 'rescheduled' 
    : pageInfo.location ? false : 'geen location';

  return await this.getPageInfoEnd({pageInfo, stopFunctie})

};


// ON EVENT REGISTER

// TODO
// ticketmasterScraper.afterFamilyDone = async function(){

//   const parsedAgain = JSON.parse(totalJSON);
//   const locationDateCombos = [];
//   const filteredTotalSkipOfferings = parsedAgain.filter(pa => {
//     const locDateCombo = `${pa.location} ${pa.startDateTime}`;
//     if (locationDateCombos.indexOf(locDateCombo) === -1){
//       locationDateCombos.push(locDateCombo);
//       return true;
//     } else {
//       return false;
//     }
//   })

//   fs.writeFileSync(`${fsDirections.eventLists}/ticketmaster/0.json`, JSON.stringify(filteredTotalSkipOfferings), "UTF-8", () => { })
// }

ticketmasterScraper.filterCoveredLocations = function(eventList){
  return eventList.filter(TMEvent =>{
    return !workerNames.includes(TMEvent.location) 
  })
}

ticketmasterScraper.filterForMetal = function(rawEvents){

  return rawEvents.filter(evs => {
    const hasMetalSelf = evs?.classifications.some(classif => {
      return classif.genre.name.toLowerCase() === 'metal' 
    })  
    const hasMetalAttractions = evs?.attractions.some(attr => {
      return attr.classifications.some(classif => {
        return classif.genre.name.toLowerCase() === 'metal' 
      })
    })
    return hasMetalSelf || hasMetalAttractions;
  })
}

// function* readRawJSON(dir) {
//   const files = fs.readdirSync(dir, { withFileTypes: true });
//   for (const file of files) {
//     if (file.isDirectory()) {
//       yield* readRawJSON(path.join(dir, file.name));
//     } else {
//       yield fs.readFileSync(path.join(dir, file.name), 'utf-8');
//     }
//   }
// }

// function* resultPartialJSONs(dir) {
//   const files = fs.readdirSync(dir, { withFileTypes: true });
//   for (const file of files) {
//     if (file.isDirectory()) {
//       yield* resultPartialJSONs(path.join(dir, file.name));
//     } else {
//       // console.log(path.join(dir, file.name))
//       // const resres = fs.readFileSync("./" + dir + '/' + file.name, 'utf-8');
//       // console.log(resres)
//       yield path.join(dir, file.name);
//     }
//   }
// }

