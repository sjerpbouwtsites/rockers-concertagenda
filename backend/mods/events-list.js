import fs from "fs";
import fsDirections from "./fs-directions.js";
import { handleError, errorAfterSeconds } from "./tools.js";
export default class EventsList {
  static _events = [];

  static save(name, workerIndex = null) {
    try {
      EventsList.checkTimestampsExist();
      const pathToEventList = fsDirections.eventLists;
      const inbetweenFix = !!workerIndex ? `-${workerIndex}` : ``;
      const pathToEventListFile = `${pathToEventList}/${name}${inbetweenFix}.json`;
      fs.writeFileSync(
        pathToEventListFile,
        JSON.stringify(EventsList._events, "\t")
      );
      const eventListTimestamps = JSON.parse(
        fs.readFileSync(fsDirections.timestampsJson)
      );
      const d = new Date();
      eventListTimestamps[name] = d.getTime();

      fs.writeFileSync(
        fsDirections.timestampsJson,
        JSON.stringify(eventListTimestamps)
      );
    } catch (error) {
      handleError(error);
      return false;
    }
    return true;
  }

  static checkTimestampsExist() {
    if (!fs.existsSync(fsDirections.timestampsJson)) {
      fs.writeFileSync(fsDirections.timestampsJson, JSON.stringify({}));
    }
  }

  static isOld(name) {
    EventsList.checkTimestampsExist();
    const eventListTimestamps = JSON.parse(
      fs.readFileSync(fsDirections.timestampsJson)
    );
    const d = new Date();
    const currentMilliseconds = d.getTime();
    const stored = eventListTimestamps.hasOwnProperty(name)
      ? eventListTimestamps[name]
      : "0";
    const ageOfStoredEventList = Number(stored);
    const oneDay = 86400000;

    const notFresh = currentMilliseconds > ageOfStoredEventList + 2 * oneDay;
    return notFresh || ageOfStoredEventList == 0;
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
      handleError(error);
    }
  }

  static async printAllToJSON() {
    await waitABit();

    const pathToEventList = fsDirections.eventLists;
    const eventListTimestamps = Object.keys(
      JSON.parse(fs.readFileSync(fsDirections.timestampsJson))
    );

    EventsList._events = [];
    const allEventLists = fs
      .readdirSync(fsDirections.eventLists)
      .filter((fileInEventsListDir) => {
        const correspondingTimestampName = fileInEventsListDir
          .replace(/-\d/, "")
          .replace(".json", "");
        if (eventListTimestamps.includes(correspondingTimestampName)) {
          return fileInEventsListDir;
        }
        return false;
      })
      .map((fileInEventsListDir) => {
        return JSON.parse(
          fs.readFileSync(`${pathToEventList}/${fileInEventsListDir}`)
        );
      });

    EventsList._events = allEventLists.flat();

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
      fsDirections.eventsListJson,
      JSON.stringify(EventsList._events, null, "\t"),
      "utf-8"
    );
    fs.copyFileSync(
      fsDirections.eventsListJson,
      fsDirections.eventsListPublicJson
    );
    fs.copyFileSync(
      fsDirections.timestampsJson,
      fsDirections.timestampsPublicJson
    );
    console.log("events written to events-list.json");
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
