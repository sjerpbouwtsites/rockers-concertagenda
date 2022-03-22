import fs from "fs";
import path from "path";
export default class EventsList {
  static _events = [];

  static save(name, destroy = true) {
    EventsList.checkTimestampsExist();
    const pathToEventList = path.resolve("./event-lists");
    const pathToEventListFile = `${pathToEventList}/${name}.json`;
    fs.writeFileSync(
      pathToEventListFile,
      JSON.stringify(EventsList._events, "\t")
    );
    const eventListTimestamps = JSON.parse(
      fs.readFileSync(`${pathToEventList}/timestamps.json`)
    );
    const d = new Date();
    eventListTimestamps[name] = d.getTime();

    fs.writeFileSync(
      `${pathToEventList}/timestamps.json`,
      JSON.stringify(eventListTimestamps)
    );
    if (destroy) {
      delete EventsList._events;
    }
  }

  static checkTimestampsExist() {
    const pathToEventList = path.resolve("./event-lists");
    if (!fs.existsSync(`${pathToEventList}/timestamps.json`)) {
      fs.writeFileSync(
        `${pathToEventList}/timestamps.json`,
        JSON.stringify({})
      );
    }
  }

  static isOld(name) {
    EventsList.checkTimestampsExist();
    const pathToEventList = path.resolve("./event-lists");
    const eventListTimestamps = JSON.parse(
      fs.readFileSync(`${pathToEventList}/timestamps.json`)
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
    EventsList._events.push(event);
  }

  static async printAllToJSON(writeFolder) {
    await waitABit();

    const pathToEventList = path.resolve("./event-lists");
    const eventListTimestamps = JSON.parse(
      fs.readFileSync(`${pathToEventList}/timestamps.json`)
    );

    EventsList._events = [];
    const allEventLists = Object.keys(eventListTimestamps).map(
      (eventListKey) => {
        return JSON.parse(
          fs.readFileSync(`${pathToEventList}/${eventListKey}.json`)
        );
      }
    );
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
      `${writeFolder}/events-list.json`,
      JSON.stringify(EventsList._events, null, "\t"),
      "utf-8"
    );
    fs.copyFileSync(
      `${writeFolder}/events-list.json`,
      `./concertagenda-voorkant/public/events-list.json`
    );
    fs.copyFileSync(
      `./event-lists/timestamps.json`,
      `./concertagenda-voorkant/public/timestamps.json`
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
