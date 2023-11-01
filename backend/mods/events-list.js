import fs from 'fs';
import fsDirections from './fs-directions.js';

export default class EventsList {
  static _events = [];

  static _invalidEvents = [];

  static _meta = {};

  static timestampsExistenceVerified = false;

  static workerSignature = {
    // dit is (nog) geen worker
    family: 'events-list',
    index: 0,
    name: `${'events-list-0'}`,
    scraper: false,
  };

  static get amountOfEvents() {
    return EventsList._events.length;
  }

  static save(name, workerIndex = null) {
    try {
      // EventsList.guaranteeTimestampExistence(); // TODO LEGACY
      const pathToEventList = fsDirections.eventLists;
      const pathToINVALIDEventList = fsDirections.invalidEventLists;
      const inbetweenFix = workerIndex !== null ? `${workerIndex}` : '0';
      const pathToEventListFile = `${pathToEventList}/${name}/${inbetweenFix}.json`;
      const pathToINVALIDEventListFile = `${pathToINVALIDEventList}/${name}/invalid-${inbetweenFix}.json`;
      fs.writeFile(pathToEventListFile, JSON.stringify(EventsList._events, null, '  '), () => {});
      fs.writeFile(
        pathToINVALIDEventListFile,
        JSON.stringify(EventsList._invalidEvents, null, '  '),
        () => {},
      );

      const eventListTimestamps = JSON.parse(fs.readFileSync(fsDirections.timestampsJson));
      const d = new Date();
      eventListTimestamps[name] = d.getTime();

      fs.writeFileSync(
        fsDirections.timestampsJson,
        JSON.stringify(eventListTimestamps, null, '  '),
      );
    } catch (error) {
      console.log(
        error,
        EventsList.workerSignature,
        `error while saving name ${name} and workerIndex ${workerIndex}`,
        'close-app',
        {
          events: EventsList._events,
          invalidEvents: EventsList._invalidEvent,
          meta: EventsList._meta,
        },
      );
      return false;
    }
    return true;
  }

  static guaranteeTimestampExistence() {
    // TODO LEGACY
    // if (EventsList.timestampsExistenceVerified) return true;
    // if (!fs.existsSync(fsDirections.timestampsJson)) {
    //   fs.writeFileSync(fsDirections.timestampsJson, JSON.stringify({}));
    // } else {
    //   try {
    //     JSON.parse(fs.readFileSync(fsDirections.timestampsJson));
    //   } catch (error) {
    //     handleError(
    //       error,
    //       EventsList.workerSignature,
    //       `timestamps konden niet gelezen worden als JSON. nieuwe timestamp json gemaakt`
    //     );
    //     fs.writeFileSync(fsDirections.timestampsJson, JSON.stringify({}));
    //   }
    // }
    // return true;
  }

  static merge(events) {
    events.forEach((event) => {
      EventsList.addEvent(event);
    });
  }

  static addEvent(event) {
    EventsList._events.push(event);
  }

  static addInvalidEvent(invalidEvent) {
    EventsList._invalidEvents.push(invalidEvent);
  }
}

function isIsoDate(str) {
  if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/.test(str)) return false;
  const d = new Date(str);
  return d.toISOString() === str;
}

function waitABit() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, 500);
  });
}
