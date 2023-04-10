import fs from "fs";
import fsDirections from "./fs-directions.js";
import { handleError } from "./tools.js";
import { QuickWorkerMessage } from "./rock-worker.js";
import passMessageToMonitor from "../monitor/pass-message-to-monitor.js";
import { workerConfig } from "./worker-config.js";
import MusicEvent from "./music-event.js";

export default class EventsList {
  static _events = [];
  static _invalidEvents = [];
  static _meta = {};
  static timestampsExistenceVerified = false;

  static workerSignature = {
    // dit is (nog) geen worker
    family: "events-list",
    index: 0,
    name: `${"events-list-0"}`,
    scraper: false,
  };

  static get amountOfEvents() {
    return EventsList._events.length;
  }
  static save(name, workerIndex = null) {
    try {
      EventsList.guaranteeTimestampExistence();
      const pathToEventList = fsDirections.eventLists;
      const pathToINVALIDEventList = fsDirections.invalidEventLists;
      const inbetweenFix = workerIndex !== null ? `${workerIndex}` : `0`;
      const pathToEventListFile = `${pathToEventList}/${name}/${inbetweenFix}.json`;
      const pathToINVALIDEventListFile = `${pathToINVALIDEventList}/${name}/invalid-${inbetweenFix}.json`;
      fs.writeFile(
        pathToEventListFile,
        JSON.stringify(EventsList._events, null, "  "),
        () => {}
      );
      fs.writeFile(
        pathToINVALIDEventListFile,
        JSON.stringify(EventsList._invalidEvents, null, "  "),
        () => {}
      );

      const eventListTimestamps = JSON.parse(
        fs.readFileSync(fsDirections.timestampsJson)
      );
      const d = new Date();
      eventListTimestamps[name] = d.getTime();

      fs.writeFileSync(
        fsDirections.timestampsJson,
        JSON.stringify(eventListTimestamps, null, "  ")
      );
    } catch (error) {
      handleError(
        error,
        EventsList.workerSignature,
        `error while saving name ${name} and workerIndex ${workerIndex}`
      );
      return false;
    }
    return true;
  }

  static guaranteeTimestampExistence() {
    if (EventsList.timestampsExistenceVerified) return true;
    if (!fs.existsSync(fsDirections.timestampsJson)) {
      fs.writeFileSync(fsDirections.timestampsJson, JSON.stringify({}));
    } else {

      try {
        JSON.parse(fs.readFileSync(fsDirections.timestampsJson));
      } catch (error) {
        handleError(
          error,
          EventsList.workerSignature,
          `timestamps konden niet gelezen worden als JSON. nieuwe timestamp json gemaakt`
        );
        fs.writeFileSync(fsDirections.timestampsJson, JSON.stringify({}));
      }
    }
    return true;
  }

  static isOld(name, ignoreAgeForceScrape = false) {

    // @TODO helemaal herschrijven. timestamps onzin eruit halen. 

    if (ignoreAgeForceScrape) {
      return true;
    }

    //@ TODO TIJDELIJK;
    return false;

    // let eventListTimestamps;
    // if (EventsList.guaranteeTimestampExistence()) {
    //   try {
    //     eventListTimestamps = JSON.parse(
    //       fs.readFileSync(fsDirections.timestampsJson)
    //     );
    //   } catch (error) {
    //     throw new Error(`Kan timestamp niet lezen van naam ${name}.\n<br>
    //     locatie van timestamps zou moeten zijn ${fsDirections.timestampsJson}.\n<br>
    //     ${error.message}`);
    //   }
    // }

    // const d = new Date();
    // const currentMilliseconds = d.getTime();
    // const stored = Object.prototype.hasOwnProperty.call(eventListTimestamps, name)
    //   ? eventListTimestamps[name]
    //   : "0";
    // const ageOfStoredEventList = Number(stored);
    // const oneDay = 86400000;

    // const notFresh = currentMilliseconds > ageOfStoredEventList + 2 * oneDay;
    // return notFresh || ageOfStoredEventList == 0;
  }

  static merge(events) {
    events.forEach((event) => {
      EventsList.addEvent(event);
    });
  }

  static addEvent(event) {
    try {
      EventsList._events.push(event);
    } catch (error) {
      handleError(
        error,
        EventsList.workerSignature,
        `kan niet pushen addEvent`
      );
    }
  }
  static addInvalidEvent(invalidEvent) {
    EventsList._invalidEvents.push(invalidEvent);
  }

  static async printAllToJSON() {
    await waitABit();

    const pathToEventList = fsDirections.eventLists;
    // const eventListTimestamps = Object.keys(
    //   JSON.parse(fs.readFileSync(fsDirections.timestampsJson))
    // ); // @TODO hele timestamps concept wegsodemieteren. Verplaatsen naar Meta.

    EventsList._events = [];
    EventsList._meta.locations = {};

    let allEventListFiles = [];
    Object.entries(workerConfig).forEach(([familyName, {workerCount}]) =>{
    
      for (let i = 0; i < workerCount; i++){
        const pad = `${pathToEventList}/${familyName}/${i}.json`;
        if (fs.existsSync(pad)) {
          allEventListFiles.push(pad)
        }
      }
      
    })

    EventsList._events = allEventListFiles
      .map(eventListFile => {
        const parsedEventFile = JSON.parse(fs.readFileSync(eventListFile));
        return parsedEventFile;
      })
      .flat()
    
    // console.log(`!!!!!!!!!!!!!!!!!!!!!!!!!`.red)
    // console.log(`NOODGREEP. eventslist is vervuild geraakt. Hardhandig leegrukken!`.underline.green)
    // console.log(`!!!!!!!!!!!!!!!!!!!!!!!!!`.red)
    // //TODO FIX
    // const refMusicEvent = new MusicEvent();


    EventsList._events.forEach(eventUitLijst => {
      const loc = eventUitLijst.location;
      if (!EventsList._meta.locations[loc]) {
        EventsList._meta.locations[loc] = {};
        EventsList._meta.locations[loc].name =
            loc;
        EventsList._meta.locations[loc].count = 0;
      }

      EventsList._meta.locations[loc].count = EventsList._meta.locations[loc].count + 1;
    })


    EventsList._events.sort((eventA, eventB) => {
      const dataA = eventA.startDateTime || "2050-01-01T00:00:00.000Z";
      const dataB = eventB.startDateTime || "2050-01-01T00:00:00.000Z";
      if (!isIsoDate(dataA)) {
        return -1;
      }
      const startA = new Date(dataA);
      const startB = new Date(dataB);
      if (startB > startA) {
        return -1;
      } else if (startB < startA) {
        return 1;
      } else {
        return 0;
      }
    });
    fs.writeFileSync(
      fsDirections.metaJson,
      JSON.stringify(EventsList._meta, null, "  "),
      "utf-8"
    );
    const qwm = new QuickWorkerMessage(EventsList.workerSignature);
    passMessageToMonitor(
      qwm.toConsole(EventsList._meta),
      EventsList.workerSignature
    );

    fs.writeFileSync(
      fsDirections.eventsListJson,
      JSON.stringify(EventsList._events, null, "  "),
      "utf-8"
    );
    passMessageToMonitor(
      qwm.toConsole(EventsList._events),
      EventsList.workerSignature
    );

    fs.copyFileSync(fsDirections.metaJson, fsDirections.metaPublicJson);

    fs.copyFileSync(
      fsDirections.eventsListJson,
      fsDirections.eventsListPublicJson
    );
    fs.copyFileSync(
      fsDirections.timestampsJson,
      fsDirections.timestampsPublicJson
    );
    console.log(
      "hier was de events perlocation",
      "events-list EventsList._events.sort"
    );
    // console.log(" ")
    // console.log("Events per location:")
    // Object.values(EventsList._meta.locations).forEach(locationMeta => {
    //   console.log(`${locationMeta.name.padEnd(30, ' ')} ${locationMeta.count}`)
    // })
  }
}

function isIsoDate(str) {
  if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/.test(str)) return false;
  var d = new Date(str);
  return d.toISOString() === str;
}

function waitABit() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, 500);
  });
}
