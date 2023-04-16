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
        enforceMusicEventType: false,
      }, 
      singlePage: {
        useCustomScraper: true,
        requiredProperties: ['venueEventUrl', 'title'], 
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

      if (fetchedData?.fault) {
        this.dirtyDebug(fetchedData?.fault, 'TM 249')
        throw new Error(`429 🪓 TicketMaster weigert met ${fetchedData?.fault.faultstring}\nWACHT EVEN.`)
      }

      const res1 = {
        unavailable: '',
        pageInfo: `<a href='${this.puppeteerConfig.app.mainPage.url}'>Ticketmaster overview ${workerData.index}</a>`,
        errors: [],
      };      

      const res = fetchedData?._embedded?.events.map(rawEvent => {
        const copyEvent = {...rawEvent, ...res1};
        copyEvent.title = rawEvent.name
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
        "ticketmaster mainpage fetch",
        "close-app"
      );
    });

  if (!Array.isArray(rawEvents) || !rawEvents.length) {
    return await this.makeBaseEventListEnd({
      stopFunctie, rawEvents: []}
    );  
  }

  fs.writeFileSync(`${fsDirections.temp + '/ticketmaster/trimmed'}/${workerData.index}.json`, JSON.stringify(rawEvents), "UTF-8")

  let filteredRawEvents = this.filterForMetal(rawEvents)

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
    unavailable: event.unavailable,
    pageInfo: `<a class='page-info' href='${event.venueEventUrl}'>TM ${event.title}</a>`,
    errors: [],
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
  } else if (event?.venue?.id === 'Z598xZbpZ77ek') {
    pageInfo.location = 'groeneheuvels';
  }
  else {
    pageInfo.location = event?.venue?.id;
    this.dirtyDebug(event?.venue, 'Geen herkende ID locatie')
  }

  if (workerNames.includes(pageInfo.location)){
    pageInfo.unavailable += ` locatie ${pageInfo.location} niet bij TM.`
    return await this.getPageInfoEnd({pageInfo, stopFunctie})
  }


  pageInfo.venueEventUrl = event.url;
  pageInfo.title = event.name;
  try {
    const priceR = event?.priceRanges
      .find(priceRange => {
        return priceRange.type.includes('fees')
      }) || event?.priceRanges[0]
    pageInfo.price = Object.prototype.hasOwnProperty.call(priceR, 'max') && priceR.max    
  } catch (caughtError) {
    // TODO moet eerst errors zaak niet laten crashen
    // pageInfo.errors.push({
    //   error: new Error('Geen price gevonden'),
    //   remarks: `Geen prijs ${pageInfo.pageInfo}`,
    // })    

  }

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
  if (pageInfo.rescheduled) {
    pageInfo.unavailable += ' rescheduled' 
  }    

  return await this.getPageInfoEnd({pageInfo, stopFunctie})

};


// ON EVENT REGISTER


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
  // this.dirtyLog({
  //   workerNames,
  //   eventList
  // })
  return eventList.filter(TMEvent =>{
    return !workerNames.includes(TMEvent.location) 
  })
}

ticketmasterScraper.filterForMetal = function(rawEvents){

  return rawEvents.filter(evs => {
    const hasMetalSelf = evs?.classifications.some(classif => {
      const genreAndSub = `${classif?.genre?.name} ${classif?.subGenre?.name}`.toLowerCase();
      return genreAndSub.includes('metal') || genreAndSub.includes('rock') ||genreAndSub.includes('punk') 
    })
    const hasMetalAttractions = evs?.attractions.some(attr => {
      return attr.classifications.some(classif => {
        const genreAndSub = `${classif?.genre?.name} ${classif?.subGenre?.name}`.toLowerCase();
        return genreAndSub.includes('rock') || genreAndSub.includes('metal') || genreAndSub.includes('punk')
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

