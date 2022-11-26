import { QuickWorkerMessage } from "../mods/rock-worker.js";
import {parentPort, workerData} from "worker_threads"
import puppeteer from "puppeteer";
import fsDirections from "../mods/fs-directions.js";
import crypto from "crypto";
import * as _t from "../mods/tools.js";
import fs from "fs";
import EventsList from "../mods/events-list.js";

/**
 * @method eventGenerator<Generator> 
 *
 * @export
 * @class AbstractScraper
 */
export default class AbstractScraper {
  qwm;
  browser;
  constructor(obj) {
    this.install(obj);
  }

  install(obj) {
    this.qwm = new QuickWorkerMessage(workerData);
    this.baseEventTimeout = obj.baseEventTimeout ?? 15000;
    this.singlePageTimeout = obj.singlePageTimeout ?? 5000;
    this.maxExecutionTime = obj.maxExecutionTime ?? 30000;
    this.months = obj.months ?? null;
  }

  /**
   * Wrapper om parentPort.postMessage(qwm.toConsole(xx)) heen.
   *
   * @param {*} logSource wat dan ook.
   * @param {string} [key=null] hint voor in console.
   * @memberof AbstractScraper
   */
  dirtyLog(logSource, key = null) {
    const logThis = key ? { [`${key}`]: logSource } : logSource;
    parentPort.postMessage(this.qwm.toConsole(logThis));
  }

  async scrapeInit() {
    this.browser = await puppeteer.launch();

    const baseMusicEvents = await this.makeBaseEventList().catch(
      this.handleOuterScrapeCatch
    );
    if (!baseMusicEvents) return false;
    const checkedEvents = await this.announceAndCheck(baseMusicEvents).catch(
      this.handleOuterScrapeCatch
    );
    if (!checkedEvents) return false;
    await this.processSingleMusicEvent(checkedEvents).catch(
      this.handleOuterScrapeCatch
    );
    await this.announceToMonitorDone();
    await this.closeBrowser();
    await this.saveEvents();
    // overige catch in om init heen
  }

  // step 1
  async makeBaseEventList() {
    throw Error("abstract method used thx ");
  }

  // step 2
  /**
   * take base events announce and check
   * Kondigt begin taak aan aan monitor
   * Initeert de generator check op events
   *
   * @param {[MusicEvents]} baseMusicEvents uitgedraaid door makeBaseEventList
   * @return {checkedEvents [MusicEvent]}  Want geeft werk van eventAsyncCheck door.
   * @memberof AbstractScraper
   *
   * checkedEvents
   */
  async announceAndCheck(baseMusicEvents) {
    parentPort.postMessage(this.qwm.workerStarted());
    const eventGen = this.eventGenerator(baseMusicEvents);
    const checkedEvents = [];
    return await this.eventAsyncCheck({
      eventGen,
      checkedEvents,
    });
  }

  // step 2.5

  /**
   * Event Async Check controleert of events bv. wel metal zijn.
   * In navolging van generators loopt deze een extra rondje; de uiteindelijke
   * return zit na controle generatedEvent.done
   *
   * @param {eventGen Generator, checkedEvents [MusicEvent]}
   * @return {checkedEvents [MusicEvent]}
   * @memberof AbstractScraper
   */
  async eventAsyncCheck({ eventGen, checkedEvents }) {
    try {
      const useableEventsCheckedArray = checkedEvents.map((a) => a);

      const generatedEvent = eventGen.next();
      if (generatedEvent.done) return useableEventsCheckedArray;

      if ((await this.singleEventCheck(generatedEvent.value)).success) {
        useableEventsCheckedArray.push(generatedEvent.value);
      }

      return await this.eventAsyncCheck({
        eventGen,
        checkedEvents: useableEventsCheckedArray,
      });
    } catch (error) {
      _t.handleError(
        error,
        workerData,
        `eventAsyncCheck faal met ${nextEvent?.value?.title}`
      );
    }
  }

  *eventGenerator(events) {
    while (events.length) {
      yield events.shift();
    }
  }

  /**
   * abstracte methode, te overschrijve in de kindWorkers.
   *
   * @param {MusicEvent} event om te controleren
   * @return {event {MusicEvent, success bool}}
   * @memberof AbstractScraper
   */
  async singleEventCheck(event) {
    // abstracte methode, over te schrijven
    return {
      event,
      success: true,
    };
  }

  /**
   * Process single Music Event
   * Naait het scrapen aan elkaar
   * Laat puppeteer pagina maken
   * Haalt page info op
   * Doet nabewerking page info: prijs en lange HTML
   * Laat het muziek event zich registeren
   *
   * step 3
   *
   * @recursive
   * @param {checkedEvents MusicEvents[]}
   * @return {Promise<checkedEvents MusicEvents[]>}
   * @memberof AbstractScraper
   */
  async processSingleMusicEvent(eventsList = []) {
    // verwerk events 1
    const useableEventsList = eventsList.map((a) => a);
    if (useableEventsList.length === 0) return useableEventsList;

    const singleEvent = useableEventsList.shift();
    parentPort.postMessage(this.qwm.todoNew(useableEventsList.length));

    // maak pagina
    const singleEventPage = await this.createSinglePage(
      singleEvent.venueEventUrl
    );
    if (!singleEventPage) {
      return useableEventsList.length
        ? this.processSingleMusicEvent(useableEventsList)
        : useableEventsList;
    }

    // page info ophalen
    const pageInfo = await this.getPageInfo({
      page: singleEventPage,
      url: singleEvent.venueEventUrl,
    });
    if (!pageInfo || !!pageInfo?.unavailable) {
      parentPort.postMessage(
        this.qwm.messageRoll(
          `${singleEventPage.title} onbeschikbaar ${
            pageInfo?.unavailable ?? ""
          }`
        )
      );
      return useableEventsList.length
        ? this.processSingleMusicEvent(useableEventsList)
        : useableEventsList;
    }

    //parentPort.postMessage(this.qwm.toConsole({ pageInfo }));

    // nabewerken page info
    pageInfo.price = this.getPrice(pageInfo?.priceTextcontent);
    pageInfo.longText = this.writeLongTextHTML(pageInfo?.longTextHTML);

    // samenvoegen & naar EventsList sturen
    singleEvent.merge(pageInfo);
    singleEvent.isValid
      ? singleEvent.register()
      : singleEvent.registerINVALID(this.workerData);

    !singleEventPage.isClosed() && (await singleEventPage.close());

    return useableEventsList.length
      ? this.processSingleMusicEvent(useableEventsList)
      : useableEventsList;
  }

  getPrice(priceTextcontent) {
    if (!priceTextcontent) return;
    return _t.getPriceFromHTML(priceTextcontent);
  }

  writeLongTextHTML(longTextHTML) {
    try {
      if (!longTextHTML) return null;
      let uuid = crypto.randomUUID();
      const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;
      fs.writeFile(longTextPath, longTextHTML, "utf-8", () => {});
      return longTextPath;
    } catch (err) {
      _t.handleError(err, workerData, `write long text fail`);
    }
  }

  // step 3.5
  async getPageInfo(page, url) {
    // abstract function getPageInfo
    throw Error("abstact function getPAgeInfo called");
  }

  // step 4
  async announceToMonitorDone() {
    parentPort.postMessage(this.qwm.workerDone(EventsList.amountOfEvents));
    return true;
  }

  // step 4.5
  async closeBrowser() {
    this.browser &&
      this.browser.hasOwnProperty("close") &&
      this.browser.close();
    return true;
  }

  handleOuterScrapeCatch(catchError) {
    _t.handleError(
      catchError,
      workerData,
      `outer catch scrape ${workerData.family}`
    );
  }

  /**
   *
   *
   * @param {string} url
   * @return {page} reeds genavigeerde pagina
   * @memberof AbstractScraper
   */
  async createSinglePage(url) {
    try {
      const page = await this.browser.newPage();
      await page.goto(url, {
        waitUntil: "load",
        timeout: this.singlePageTimeout,
      });
      return page;
    } catch (error) {
      _t.handleError(
        error,
        workerData,
        `Mislukken aanmaken <a href='${url}'>single pagina</a> wss duurt te lang`
      );
    }
  }

  // step 6
  async saveEvents() {
    EventsList.save(workerData.family, workerData.index);
  }

  listenToMasterThread() {
    parentPort.on("message", (message) => {
      const pm = JSON.parse(message);
      if (pm?.type === "process" && pm?.subtype === "command-start") {
        this.scrapeInit(pm?.messageData).catch(this.handleOuterScrapeCatch);
      }
    });
  }
}

