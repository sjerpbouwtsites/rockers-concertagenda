import EventsList from "./events-list.js";

export default class MusicEvent {
  doorOpenDateTime = null;
  startDateTime = null;
  endDateTime = null;
  venueEventUrl = null;
  title = null;
  location = null;
  price = null;
  shortText = null;
  longText = null;
  image = null;
  dataIntegrity = 0;
  constructor(init) {
    this.merge(init);
  }
  merge(conf) {
    for (let confKey in conf) {
      if (this.hasOwnProperty(confKey)) {
        this[confKey] = conf[confKey];
      }
    }
  }
  register() {
    EventsList.addEvent(this);
  }
}
