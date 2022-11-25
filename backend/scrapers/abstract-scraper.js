import { QuickWorkerMessage } from "../mods/rock-worker.js";
import {parentPort, workerData} from "worker_threads"
import puppeteer from "puppeteer";
import fsDirections from "../mods/fs-directions.js";
import crypto from "crypto";
import * as _t from "../mods/tools.js";
import fs from "fs";
import EventsList from "../mods/events-list.js";

export default class AbstractScraper {
  qwm;
  browser;
  baseEventTimeout = 15000;
  singlePageTimeout = 5000;
  self;
  constructor(obj){
    if (obj.hasOwnProperty('baseEventTimeout')) {
      this.baseEventTimeout = obj['baseEventTimeout']
    }
    if (obj.hasOwnProperty('singlePageTimeout')) {
      this.singlePageTimeout = obj['singlePageTimeout']
    }
    if (obj.hasOwnProperty('months')) {
      this.singlePageTimeout = obj['months']
    }    
    this.qwm = new QuickWorkerMessage(workerData);
    this.self = this;
  }

  async scrapeInit(){
    const qwm = new QuickWorkerMessage(workerData);
    // parentPort.postMessage(this.qwm.workerInitialized());
    this.browser = await puppeteer.launch();
    parentPort.postMessage(qwm.messageRoll(`scrapeInit`)) 
    const self = this.self;
    Promise
      .race([self.makeBaseEventList(self), _t.errorAfterSeconds(self.baseEventTimeout)])
      .then(self.takeBaseEventsAnnounceAndCheck)
       .then(self.processSingleMusicEvent)
      .then(self.announceToMonitorDone)
      .then(self.closeBrowser)
      .catch(self.handleOuterScrapeCatch)
      .then(self.saveEvents)
  }

  // step 1 
  async makeBaseEventList(self){
    throw Error('abstract method used thx ')
  }

  // step 2
  async takeBaseEventsAnnounceAndCheck({self, baseMusicEvents}){
    const qwm = new QuickWorkerMessage(workerData);
    parentPort.postMessage(qwm.messageRoll(`take base events announce and check`)) 
      parentPort.postMessage(self.qwm.workerStarted());
      const eventGen = self.eventGenerator(baseMusicEvents);
      const nextEvent = eventGen.next().value;
      return self.eventAsyncCheck({eventGen, currentEvent: nextEvent, self})    
  }

  // step 2.5
  async eventAsyncCheck({eventGen, currentEvent, self, checkedEvents}) {
    const qwm = new QuickWorkerMessage(workerData);
    parentPort.postMessage(qwm.messageRoll(`eventAsyncCheck`)) 
    const cEvents = checkedEvents || [];
    const checkedEventsCopy = [...cEvents]
    checkedEventsCopy.push(currentEvent)
    const nextEvent = eventGen.next().value;
    if (nextEvent) {
      parentPort.postMessage(qwm.messageRoll(`er is nog een event`)) 
      return self.eventAsyncCheck({eventGen, currentEvent: nextEvent, self, checkedEvents: checkedEventsCopy})
    } else {
      parentPort.postMessage(qwm.messageRoll(`geen verdere events`)) 
      return {checkedEvents: checkedEventsCopy, self};
    }
  }

  // step 3
  async processSingleMusicEvent({checkedEvents, self}){
    const qwm = new QuickWorkerMessage(workerData);
    parentPort.postMessage(qwm.messageRoll(`process single music event`)) 
    const {firstMusicEvent, eventsCopy} = self.eventsCopyAndFirstMusicEvent({checkedEvents, self})
    if(!firstMusicEvent) {
      parentPort.postMessage(qwm.messageRoll(`first music event nee`)) 
      return self
    }

    const singleEventPage = await self.createSinglePage({url: firstMusicEvent.venueEventUrl, self});
    if (!singleEventPage) {
      parentPort.postMessage(qwm.messageRoll(`geen single event page`)) 
      return eventsCopy.length
        ? self.processSingleMusicEvent({checkedEvents: eventsCopy, self})
        : {self, checkedEvents: eventsCopy};
    }
 
      const pageInfo = await Promise
      .race([
        self.getPageInfo({page: singleEventPage, url: firstMusicEvent.venueEventUrl, self}),
        _t.errorAfterSeconds(self.singlePageTimeout),
      ])
      .catch(error => { _t.handleError(error, workerData, `single page race failure`) })
      parentPort.postMessage(qwm.toConsole(pageInfo))
      pageInfo.price = await self
        .getPrice(pageInfo?.priceTextcontent)
        .catch(err => { _t.handleError(err, workerData, `page info prijs fail`) });
      
      pageInfo.longText = await self
        .writeLongTextHTML(pageInfo?.longTextHTML ?? null)
        .catch(err => { _t.handleError(err, workerData, `page info longTextHTML fail`) })
      
      firstMusicEvent.merge(pageInfo);
      self.registerEvent(firstMusicEvent)

      !singleEventPage.isClosed() && await singleEventPage.close();
  
    return eventsCopy.length
      ? self.processSingleMusicEvent({checkedEvents: eventsCopy, self})
      : {self, checkedEvents: eventsCopy};
  }

  registerEvent(ev){
    const qwm = new QuickWorkerMessage(workerData);
    if (ev.isValid) {
      parentPort.postMessage(qwm.messageRoll(`is valid`)) 
      ev.register();
    } else {
      parentPort.postMessage(qwm.messageRoll(`not valid`)) 
      _t.handleError(new Error(`
      title: ${ev.title} \n
      url: ${ev.url} \n
      startDateTime: ${ev.startDateTime}
      `), workerData, `Music event ongeldig`)
    }   
    return ev 
  }

  async getPrice(priceTextcontent){
    if (!priceTextcontent)return;
    const qwm = new QuickWorkerMessage(workerData);
    parentPort.postMessage(qwm.messageRoll(`get price`)) 
      return _t.getPriceFromHTML(priceTextcontent);
  }

  async writeLongTextHTML(longTextHTML){
    const qwm = new QuickWorkerMessage(workerData);
    parentPort.postMessage(qwm.messageRoll(`write logn text html`)) 
    if (!longTextHTML) return null;
    let uuid = crypto.randomUUID();
    const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;
    fs.writeFile(longTextPath, longTextHTML, "utf-8", () => {});
    return longTextPath;
  }

  eventsCopyAndFirstMusicEvent({checkedEvents, self}){
    const qwm = new QuickWorkerMessage(workerData);
    parentPort.postMessage(qwm.messageRoll(`events copy and first music event`)) 
    const eventsCopy = Array.isArray(checkedEvents) ? [...checkedEvents] : []
    self.qwm.todo(eventsCopy.length).forEach((JSONblob) => {
      parentPort.postMessage(JSONblob);
    });
    
    const firstMusicEvent = eventsCopy.shift();
  
    if (!firstMusicEvent || eventsCopy.length === 0) {
      return {firstMusicEvent: null, eventsCopy};
    } else {
      return {firstMusicEvent, eventsCopy};
    }
  }

  // step 3.5
  async getPageInfo(page, url) {
    // abstract function getPageInfo
    throw Error('abstact function getPAgeInfo called')
  }

  // step 4
  async announceToMonitorDone({self}){
    const qwm = new QuickWorkerMessage(workerData);
    parentPort.postMessage(qwm.messageRoll(`announce to monitor done`)) 
    parentPort.postMessage(self.qwm.workerDone(EventsList.amountOfEvents));    
    return true;
  }

  // step 4.5
  async closeBrowser(self){
    const qwm = new QuickWorkerMessage(workerData);
    parentPort.postMessage(qwm.messageRoll(`clsoe rbwoser`)) 
    self.browser && self.browser.hasOwnProperty("close") && self.browser.close();
    return self;
  }    

  async handleOuterScrapeCatch(catchError) {
    _t.handleError(catchError, workerData, `outer catch scrape ${workerData.family}`)
  }

  async createSinglePage({url, self}) {
    const qwm = new QuickWorkerMessage(workerData);
    parentPort.postMessage(qwm.messageRoll(`create single page`)) 
    const page = await self.browser.newPage();
    await page
      .goto(url, {
        waitUntil: "load",
        timeout: 20000,
      })
      .then(() => {
        const qwm = new QuickWorkerMessage(workerData);
        parentPort.postMessage(qwm.messageRoll(`page goto then success`)) 
        return true
      })
      .catch((err) => {
        const qwm = new QuickWorkerMessage(workerData);
        parentPort.postMessage(qwm.messageRoll(`page goto mislukt ${url}`)) 
        _t.handleError(
          err,
          workerData,
          `${workerData.name} goto single page mislukt:<br><a href='${url}'>${url}</a><br>`
        );
        return false;
      });
    return page;
  }

  // step 6
  async saveEvents(){
    const qwm = new QuickWorkerMessage(workerData);
    parentPort.postMessage(qwm.messageRoll(`sage events`)) 
    EventsList.save(workerData.family, workerData.index);
  }

  *eventGenerator(events) {
    const qwm = new QuickWorkerMessage(workerData);
    parentPort.postMessage(qwm.messageRoll(`event generator`)) 
    while (events.length) {
      yield events.shift();
  
    }
  }  

  listenToMasterThread(){
    const qwm = new QuickWorkerMessage(workerData);
    parentPort.postMessage(qwm.messageRoll(`listen to master thread`)) 
    parentPort.on("message", (message) => {
      const pm = JSON.parse(message);
      if (pm?.type === 'process' && pm?.subtype === "command-start") {
        this.scrapeInit(pm?.messageData).catch(scrapInitErr =>{
          _t.handleError(scrapInitErr, workerData, `top level catch scrapers`)
        });
      }
    });    
  }


}

