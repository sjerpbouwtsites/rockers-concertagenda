import { workerData } from "worker_threads";
import AbstractScraper from "./gedeeld/abstract-scraper.js";
import makeScraperConfig from "./gedeeld/scraper-config.js";
import * as _t from "../mods/tools.js";
import crypto from "crypto";
import {workerNames} from "../mods/worker-config.js";

//#region [rgba(0, 60, 0, 0.1)]       SCRAPER CONFIG
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
        requiredProperties:['venueEventUrl', 'title', 'price', 'start']
      }
    }
  }
}));
//#endregion                          SCRAPER CONFIG

ticketmasterScraper.listenToMasterThread();

//#region [rgba(0, 120, 0, 0.1)]      MAIN PAGE EVENT CHECK
//#endregion                          MAIN PAGE EVENT CHECK

//#region [rgba(0, 180, 0, 0.1)]      SINGLE PAGE EVENT CHECK
//#endregion                          SINGLE PAGE EVENT CHECK

//#region [rgba(0, 240, 0, 0.1)]      MAIN PAGE
ticketmasterScraper.mainPage = async function() {

  const availableBaseEvents = await this.checkBaseEventAvailable(workerData.name);
  if (availableBaseEvents){
    return await this.mainPageEnd({
      stopFunctie: null, rawEvents: availableBaseEvents}
    );    
  } 

  const {stopFunctie} = await this.mainPageStart()

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
        copyEvent.venueEventUrl = rawEvent.url;

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
    return await this.mainPageEnd({
      stopFunctie, rawEvents: []}
    );  
  }

  //fs.writeFile(`${fsDirections.temp + '/ticketmaster/trimmed'}/${workerData.index}.json`, JSON.stringify(rawEvents), "UTF-8", ()=>{})

  let filteredRawEvents = this.filterForMetal(rawEvents)

  this.saveBaseEventlist(workerData.name, filteredRawEvents)
  return await this.mainPageEnd({
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
//#endregion                          MAIN PAGE

//#region [rgba(120, 0, 0, 0.3)]     SINGLE PAGE
ticketmasterScraper.singlePage = async function ({event}) {
 
  const {stopFunctie} =  await this.singlePageStart()

  const pageInfo = {
    pageInfo: `<a class='page-info' href='${event.url}'>TM ${event.title}</a>`,
    errors: [],
    unavailable: '',
  };

  pageInfo.start = event.dates?.start?.dateTime;
  
  
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
    return await this.singlePageEnd({pageInfo, stopFunctie})
  }

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
    return await this.singlePageEnd({pageInfo, stopFunctie})
  }
  if (pageInfo.title.toLowerCase().includes("heaven")){
    this.dirtyLog(event)
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

  
  const imageCrypto = crypto.randomUUID();
  const imagePath = `${this.eventImagesFolder}/${pageInfo.location}/${imageCrypto}`;
  await this.downloadImageCompress(event, event.image, imagePath, pageInfo.location)
  await _t.waitTime(25);
  event.image = imagePath;
  pageInfo.image = imagePath;
  
  if (event.dates?.status?.code === 'rescheduled') {
    pageInfo.unavailable += ' verplaatst';
  }

  const tl = pageInfo.title.toLowerCase();
  if (tl.includes('|') || (tl.includes('package') || tl.includes('parking'))){
    pageInfo.unavailable += ' double event' 
  }




  return await this.singlePageEnd({pageInfo, stopFunctie})

};

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
  return false;
}
//#endregion                         SINGLE PAGE

