import { parentPort, workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";
import * as _t from "../mods/tools.js";
import {workerNames} from "../mods/worker-config.js";


// SCRAPER CONFIG

const ticketmasterScraper = new AbstractScraper(makeScraperConfig({
  maxExecutionTime: 75003,
  workerData: Object.assign({}, workerData),
  puppeteerConfig: {
    mainPage: {
      timeout: 60007,
    },
    singlePage: {
      timeout: 30005
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
        requiredProperties:['venueEventUrl', 'title', 'price', 'startDateTime']
      }
    }
  }
}));

ticketmasterScraper.listenToMasterThread();

ticketmasterScraper.makeBaseEventList = async function() {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.name);
  if (availableBaseEvents){
    return await this.makeBaseEventListEnd({
      stopFunctie: null, rawEvents: availableBaseEvents}
    );    
  } 

  const {stopFunctie} = await this.makeBaseEventListStart()

  let rawEvents = await fetch(this.puppeteerConfig.app.mainPage.url)
    .then(result => {
      
      return result.json()
    })
    .then(fetchedData => {

      //fs.writeFile(`${fsDirections.temp + '/ticketmaster/raw'}/${workerData.index}.json`, JSON.stringify(fetchedData), "UTF-8", ()=>{})

      if (fetchedData?.fault) {
        this.dirtyDebug(fetchedData?.fault, 'TM 249')
        throw new Error(`429 🪓 TicketMaster weigert met ${fetchedData?.fault.faultstring}\nWACHT EVEN.`)
      }

      const res1 = {
        unavailable: '',
        pageInfo: `<a class='page-info' href='${this.puppeteerConfig.app.mainPage.url}'>Ticketmaster overview ${workerData.index}</a>`,
        errors: [],
      };      

      const res = fetchedData?._embedded?.events.map(rawEvent => {
        const copyEvent = {...rawEvent, ...res1};
        copyEvent.title = rawEvent.name
        copyEvent.image = copyEvent.images[0].url;
        delete copyEvent.images;
        copyEvent.attractions = editAttractionsInRaw(copyEvent?._embedded?.attractions ?? []);
        copyEvent.venue = (Array.isArray(copyEvent?._embedded?.venues) && copyEvent?._embedded?.venues.length) ? copyEvent._embedded.venues[0] : 'geenvenue'
        copyEvent._embedded;
        return copyEvent;
      });  



      return res;
    }).catch((response) => {
      _t.handleError(
        response,
        workerData,
        "ticketmaster mainpage fetch",
        "close-thread",
        response
      );
    });

  if (!Array.isArray(rawEvents) || !rawEvents.length) {
    return await this.makeBaseEventListEnd({
      stopFunctie, rawEvents: []}
    );  
  }

  //fs.writeFile(`${fsDirections.temp + '/ticketmaster/trimmed'}/${workerData.index}.json`, JSON.stringify(rawEvents), "UTF-8", ()=>{})

  let filteredRawEvents = this.filterForMetal(rawEvents)

  this.saveBaseEventlist(workerData.name, filteredRawEvents)
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
    pageInfo: `<a class='page-info' href='${event.url}'>TM ${event.title}</a>`,
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
  } else if (event?.venue?.id === 'Z698xZbpZ171axd'){
    pageInfo.location = 'liveinhoorn';
  } else {
    if (event?.venue?.url){
      const locatieMatch = event?.venue?.url.match(/venue\/([\w-]+)-tickets/)
      if (Array.isArray(locatieMatch) && locatieMatch.length > 1){
        const spl = locatieMatch[1].split('-');
        pageInfo.location = spl.map((locDeel, locDeelIndex) =>{
          if (locDeelIndex < (spl.length - 1)) {
            return locDeel;
          } 
          return '';
        }).join(' ').trim();
      }
      pageInfo.location = 'ticketmasterland';
    } 
    pageInfo.location = 'ticketmasterland';
   
  }

  if (workerNames.includes(pageInfo.location) || pageInfo.location === 'metropoolenschede'){
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
    pageInfo.errors.push({
      remarks: `Geen prijs gevonden ${pageInfo.pageInfo}`,
      debug: {
        prijzen: event?.priceRanges
      }
    })    
    return await this.getPageInfoEnd({pageInfo, stopFunctie})
  }

  if (event.attractions.length > 1) {
    pageInfo.shortTitle = event.attractions.reduce((prev, next) => {
      const isMetal = ticketmasterScraper.classificationsMetal(next.classifications[0]);
      if (isMetal){
        return prev + next.name + ", "
      } else {
        return prev;
      }
    }, 'Met oa: ')
    pageInfo.shortTitle = pageInfo.shortTitle.substring(0, pageInfo.shortTitle.length -2)
  }
  pageInfo.image = event.image;
  if (!pageInfo.image){
    pageInfo.errors.push({
      remarks: `image missing ${pageInfo.pageInfo}`
    })
  }

  pageInfo.rescheduled = event.dates?.status?.code === 'rescheduled';
  if (pageInfo.rescheduled) {
    pageInfo.unavailable += ' rescheduled' 
  }    

  const tl = pageInfo.title.toLowerCase();
  if (tl.includes('|') || (tl.includes('package') || tl.includes('ticket') || tl.includes('parking'))){
    pageInfo.unavailable += ' double event' 
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

  // event
  //  attractions []
  //    classifications []
  //      genre || subgenre {} 
  //        id {string} name {string}
  // genre metal id = KnvZfZ7vAvt
  // subgenre punk van rock id = KZazBEonSMnZfZ7v6a6
  // subgenre hardcore van rock id = KZazBEonSMnZfZ7v6kl
  // LET OP niet genre rock nemen want pop is ook een subgenre hiervan

  return rawEvents.filter(rawEvent => {
    const attractions = rawEvent?.attractions ?? null;
    if (!attractions || attractions.length < 1) return false;
    const firstAttractionClassifications = attractions[0].classifications;
    return this.classificationsMetal(firstAttractionClassifications);
  })
}

ticketmasterScraper.classificationsMetal = function (classifications){

  const classification = Array.isArray(classifications) ? classifications[0] : classifications;
  if (classification?.genre.id === `KnvZfZ7vAvt`) return true; // metal
  if (classification?.subGenre.id === `KZazBEonSMnZfZ7v6a6`) return true; // punk
  if (classification?.subGenre.id === `KZazBEonSMnZfZ7v6kl`) return true; // hardrock
  this.dirtyTalk(`geen metal gevonden ${classification?.genre?.name} ${classification?.subGenre?.name}`)
  return false;
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

