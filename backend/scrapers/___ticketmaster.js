import MusicEvent from "../mods/music-event.js";
import { Location } from "../mods/locations.js";
import puppeteer from "puppeteer";
import { parentPort, workerData } from "worker_threads";
import EventsList from "../mods/events-list.js";
import * as _t from "../mods/tools.js";
import { QuickWorkerMessage } from "../mods/rock-worker.js";
import getVenueMonths from "../mods/months.js";
import { workerConfig } from "../mods/worker-config.js";
import fs from 'fs';
import path from 'path';
import fsDirections from "../mods/fs-directions.js";

const qwm = new QuickWorkerMessage(workerData);

parentPort.on("message", (message) => {
  const pm = JSON.parse(message);
  if (pm?.type === "process" && pm?.subtype === "command-start") {
    try {
      scrapeTicketMaster(pm?.messageData);
    } catch (error) {
      parentPort.postMessage({
        status: "error",
        message: error,
      });
    }
  }
});


const rawTicketMasterJSONDir = fsDirections.temp + '/ticketmaster/raw';
const trimmedMJSONDir = fsDirections.temp + '/ticketmaster/trimmed';
const resultTMJSONDir = fsDirections.temp + '/ticketmaster/result';
const pagesToDo = 5
const freshScrape = true


async function scrapeTicketMaster(){

  parentPort.postMessage(qwm.workerInitialized());

  if (freshScrape) {
    await recursiveTickermasterFetch();
    parentPort.postMessage(qwm.messageRoll('recursive raw gedaan')); 
  }

  await waitFor(3000);

  // DO GENERATOR.
  await processRaw(0)
  parentPort.postMessage(qwm.messageRoll('process 0'));  
  await processRaw(1)
  parentPort.postMessage(qwm.messageRoll('process 1'));  
  await processRaw(2)
  parentPort.postMessage(qwm.messageRoll('process 2'));  
  await processRaw(3)
  parentPort.postMessage(qwm.messageRoll('process 3'));  
  await processRaw(4)
  parentPort.postMessage(qwm.messageRoll('process 4'));  
  await processRaw(5)
  parentPort.postMessage(qwm.messageRoll('process 5'));  
  const numberOfEvents = await collateResults();
  parentPort.postMessage(qwm.workerDone(numberOfEvents));

}

async function collateResults(){

  const totalJSON = '[' + fs.readdirSync(resultTMJSONDir)
    .map(fileName => {
      const fsRes = fs.readFileSync(resultTMJSONDir + '/' + fileName, 'utf8');
      return fsRes
    })
    .reduce((prev, next) => {
      return (prev ? prev + "," : prev) + next.substring(1, next.length -1)
    }, '') + ']';

  console.log('last filter')

  const parsedAgain = JSON.parse(totalJSON);
  const locationDateCombos = [];
  const filteredTotalSkipOfferings = parsedAgain.filter(pa => {
    const locDateCombo = `${pa.location} ${pa.startDateTime}`;
    if (locationDateCombos.indexOf(locDateCombo) === -1){
      locationDateCombos.push(locDateCombo);
      return true;
    } else {
      return false;
    }
  })

  fs.writeFileSync(`${fsDirections.eventLists}/ticketmaster/0.json`, JSON.stringify(filteredTotalSkipOfferings), "UTF-8", () => { })

  return filteredTotalSkipOfferings.length;

}

async function processRaw(index){
  const fileJSON = JSON.parse(fs.readFileSync(`${trimmedMJSONDir}/trimmed-${index}.json`, 'utf8'))

  const filtered = filterForMetal(fileJSON)
  
  const musicEvents = filtered
    .map(TMEvent => {
      const res = {}
      res.startDateTime = TMEvent.dates?.start?.dateTime;
      res.location = TMEvent?.venue?.name?.toLowerCase().replace(/\W/g,'') ?? '';
      // if (!res.location) {
      //   res.location = TMEvent?.promoter;
      // }
      res.venueEventUrl = TMEvent.url;
      res.title = TMEvent.name;
      const priceR = TMEvent.priceRanges
        .find(priceRange => {
          return priceRange.type.includes('fees')
        }) || TMEvent.priceRanges[0]
      res.price = Object.prototype.hasOwnProperty.call(priceR, 'max') && priceR.max
      if (TMEvent.attractions.length > 1) {
        res.shortTitle = TMEvent.attractions.reduce((prev, next) => {
          if (next.classifications[0] && next.classifications[0].genre?.name === 'Metal'){
            return prev + next.name + ", "
          } else {
            return prev;
          }
        }, 'Met oa: ')
        res.shortTitle = res.shortTitle.substring(0, res.shortTitle.length -2)
      }
      res.image = TMEvent.image;
      res.rescheduled = TMEvent.dates?.status?.code === 'rescheduled';
      res.unavailable = res.rescheduled 
        ? 'rescheduled' 
        : res.location ? false : 'geen location';

      return res;
    })
    .filter(musicEvent => musicEvent.startDateTime)
 
  console.log('writing ', index,`${resultTMJSONDir}/result-${index}.json`)
  // console.log(musicEvents)
  
  fs.writeFileSync(`${resultTMJSONDir}/result-${index}.json`, JSON.stringify(musicEvents), "UTF-8", () => { })

  // longtext
  // soldOut = null;  

}

function filterForMetal(fileJSON){
  return fileJSON.filter(evs => {
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

function* readRawJSON(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (file.isDirectory()) {
      yield* readRawJSON(path.join(dir, file.name));
    } else {
      yield fs.readFileSync(path.join(dir, file.name), 'utf-8');
    }
  }
}

function* resultPartialJSONs(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    if (file.isDirectory()) {
      yield* resultPartialJSONs(path.join(dir, file.name));
    } else {
      // console.log(path.join(dir, file.name))
      // const resres = fs.readFileSync("./" + dir + '/' + file.name, 'utf-8');
      // console.log(resres)
      yield path.join(dir, file.name);
    }
  }
}

/**
 * Haalt rauwe JSONs op en dumpt in rawTicketMasterJSON.
 *
 * @param {number} [page=0] 
 * @param {*} [fileSystemPromises=[]] 
 * @return 
 */
function recursiveTickermasterFetch(page = 0, fileSystemPromises = []) {

  parentPort.postMessage(qwm.messageRoll(`fetch page ${page}`)); 

  return fetch(`https://app.ticketmaster.com/discovery/v2/events.json?countryCode=NL&apikey=${process.env.TICKETMASTER_CONSUMER_KEY}&size=199&page=${page}`).then(result => {
    return result.json()
  }).then(fetchedData => {

    fileSystemPromises.push(fs.writeFile(`${rawTicketMasterJSONDir}/raw-${page}.json`, JSON.stringify(fetchedData), "UTF-8", () => { }))

    const trimmedData = fetchedData._embedded.events.map(rawEvent => {

      let _attractions = [];
      if (rawEvent?._embedded?.attractions) {
        _attractions = rawEvent?._embedded?.attractions.map(attr => {
          delete attr.externalLinks;
          const image = attr.images[0].url;
          attr.image = image;
          delete attr.images;
          delete attr.upcomingEvents;
          return attr;
        }) ?? [];
      }
      
      const venue1 = (Array.isArray(rawEvent?._embedded?.venues) && rawEvent?._embedded?.venues.length) ? rawEvent._embedded.venues[0] : null;
      const venueRefName = Array.isArray(rawEvent?._embedded?.venues) ? rawEvent?._embedded?.venues.find(venue => !!venue.name)?.name.toLowerCase() : 'GEEN VENUE REF'
      //   console.log(venueRefName)
      let promoter = rawEvent.promoter?.name?.toLowerCase();
      promoter = promoter ? promoter : 'GEEN PROMOTER';
      return {
        name: rawEvent.name,
        id: rawEvent.id,
        url: rawEvent.url,
        image: rawEvent.images[0].url,
        sales: rawEvent.sales,
        dates: rawEvent.dates,
        classifications: rawEvent.classifications,
        priceRanges: rawEvent.priceRanges,
        links: rawEvent.links,
        attractions: _attractions,
        promoter,
        venue: venue1,
        venueRefName
      }
    });  

    fileSystemPromises.push(fs.writeFile(`${trimmedMJSONDir}/trimmed-${page}.json`, JSON.stringify(trimmedData), "UTF-8", () => { }))
    if (page < pagesToDo) {
      return waitFor(50).then(() => {
        return recursiveTickermasterFetch(page + 1, fileSystemPromises)
      })
    }
    return Promise.all(fileSystemPromises);
  }).catch(fail => {
    console.log(fail)
  })
}

function trimRawEventData(event){
  
}

async function waitFor(wait = 500) {
  return new Promise((res) => {
    setTimeout(res, wait);
  });
}