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
  soldOut = null;
  unavailable = null; // wordt: of iets verplaatst is.
  corrupted = null; // wordt: als datum ontbreekt oid.
  origin = null;
  constructor(init, enforceMusicEventType = true) {
    this.merge(init, enforceMusicEventType);
  }
  merge(conf, enforceMusicEventType = true) {
    if (enforceMusicEventType){
      for (let confKey in conf) {
        if (Object.prototype.hasOwnProperty.call(this, confKey)) {
          this[confKey] = conf[confKey];
        }
      }
    } else {
      for (let confKey in conf) {
        this[confKey] = conf[confKey];
      }      
    }
  }
  register() {
    EventsList.addEvent(this);
    return this;
  }
  get isValid() {
    return (
      this.startDateTime &&
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(this.startDateTime)
      && !this.unavailable 
      && !this.corrupted
    );
  }
  registerIfValid() {
    if (this.isValid) {
      this.register(); // @TODO registreer welke events invalid waren.
    }
  }
  registerINVALID(workerData = {}) {
    const prod = {};
    Object.assign(prod, this);
    Object.assign(prod, workerData);
    EventsList.addInvalidEvent(prod);
  }
}
