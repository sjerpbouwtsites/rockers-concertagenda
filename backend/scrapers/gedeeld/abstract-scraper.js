import { QuickWorkerMessage } from "../../mods/rock-worker.js";
import {parentPort, workerData} from "worker_threads"
import puppeteer from "puppeteer";
import fsDirections from "../../mods/fs-directions.js";
import crypto from "crypto";
import * as _t from "../../mods/tools.js";
import fs from "fs";
import EventsList from "../../mods/events-list.js";
import MusicEvent from "../../mods/music-event.js";
import getVenueMonths from "../../mods/months.js";

/**
 * @method eventGenerator<Generator>
 *
 * @export
 * @class AbstractScraper
 */
export default class AbstractScraper {
  constructor(obj) {
    this.qwm;
    this.browser;
    this.install(obj);
  }

  install(obj) {
    this.qwm = new QuickWorkerMessage(workerData);
    this.maxExecutionTime = obj.maxExecutionTime ?? 30000;
    this.puppeteerConfig = obj.puppeteerConfig ?? {};
    this.months = getVenueMonths(workerData.family)
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

  /**
   * Wrapper om parentPort.postMessage(qwm.debugger(xx)) heen.
   *
   * @param {*} logSource wat dan ook.
   * @param {string} [title=null] titel erboven.
   * @memberof AbstractScraper
   */
  dirtyDebug(logSource, title = null) {
    parentPort.postMessage(this.qwm.debugger(logSource, title));
  }

  /**
   * Wrapper om parentPort.postMessage(qwm.messageRoll(xx)) heen.
   *
   * @param {*} talkingString wat dan ook.
   * @memberof AbstractScraper
   */
  dirtyTalk(talkingString) {
    parentPort.postMessage(this.qwm.messageRoll(String(talkingString)));
  }  
  
  async scrapeInit() {

    if (!this.puppeteerConfig.app.mainPage.useCustomScraper || !this.puppeteerConfig.app.singlePage.useCustomScraper) {
      this.browser = await puppeteer.launch();
    } else {
      this.browser = 'disabled';
    }

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
    if (!this.puppeteerConfig.app.mainPage.useCustomScraper || !this.puppeteerConfig.app.singlePage.useCustomScraper) {
      await this.closeBrowser();
    }
    await this.saveEvents();
    // overige catch in om init heen
  }

  // step 1
  async makeBaseEventList() {
    throw Error("abstract method used thx ");
  }

  /**
   * // stap 1.2
   * Initieert stopFunctie; 
   * indien puppeteer niet uitgezet, initieert pagina & navigeert naar main
   * @returns {stopFunctie timeout, page puppeteer.Page}
   */
  async makeBaseEventListStart(){


    // @TODO 3 stopfuncties maken: 1 base events; 1 single; 1 totaal.
    const stopFunctie = setTimeout(() => {
      _t.handleError(
        new Error(`makeBaseEvent overtijd. Max: ${this.puppeteerConfig.mainPage.timeout}`), 
        this.workerData
      );
    }, this.puppeteerConfig.mainPage.timeout);
    
  
    if (this.puppeteerConfig.app.mainPage.useCustomScraper) {
      parentPort.postMessage(this.qwm.messageRoll('customScraper'))
      return {
        stopFunctie,
        page: null
      }
    }
    if (!this.puppeteerConfig.app.mainPage.url) {
      throw new Error(`geen app.mainPage.url ingesteld`);
    }
    if (this.puppeteerConfig.app.mainPage.useCustomScraper) {
      return {stopFunctie}
    }
    const page = await this.browser.newPage();
    await page.goto(this.puppeteerConfig.app.mainPage.url, this.puppeteerConfig.mainPage); 
    return {
      stopFunctie,
      page,
    } 
  }

  
  /**
   * beeindigt stopFunctie timeout
   * sluit page
   * verwerkt mogelijke witruimte weg
   * verwerkt fouten van raw make base events
   * haalt rawEvents door basicMusicEventsFilter en returned
   *
   * @param {stopFunctie timeout, page Puppeteer.Page, rawEvents {}<>} 
   * @return {MusicEvent[]}
   * @memberof AbstractScraper
   */
  async makeBaseEventListEnd({stopFunctie, page, rawEvents}){

    clearTimeout(stopFunctie);
    
    page && !page.isClosed() && page.close();

    rawEvents = rawEvents.map(event => {
      if (event.longTextHTML) {
        event.longTextHTML = _t.killWhitespaceExcess(event.longTextHTML);
      } 
      if (event.shortText) {
        event.shortText = _t.killWhitespaceExcess(event.shortText);
      } return event;
    })

    rawEvents.forEach((event) => {
      const errorVerz = Object.prototype.hasOwnProperty.call(event, 'errors') 
        ? event.errors 
        : Object.prototype.hasOwnProperty.call(event, 'errors') 
          ? event.errors
          : [];
      errorVerz.forEach((errorWrappers) => {
        _t.handleError(
          errorWrappers?.error,
          this.workerData,
          errorWrappers?.remarks,
          errorWrappers?.errorLevel, //TODO
        );
      });
    });

    const r = rawEvents
      .map(rawEvent => {
        rawEvent.location = workerData.family;
        return rawEvent
      })
      .filter(this.basicMusicEventsFilter)
    ;
    if (this.puppeteerConfig.app.mainPage.enforceMusicEventType){
      return r.map((event) => new MusicEvent(event));
    } else {
      return r;
    }
      
  }

  /**
   * verifieert requiredProperties uit puppeteerConfig.app.mainPage.requiredProperties
   * waarschuwt naar monitor wie uitvalt 
   * controleert op verboden woorden zoals 'verplaatst' etc.
   * 
   * // TODO maak aparte property 'check for afgelastetc'. Bij https://gebrdenobel.nl/programma/nazareth-14-dec-2022/ 
   * // bv staat 'afgelast' in de soort van titelbalk maar niet helemaal.
   * 
   * @param {MusicEvent} musicEvent 
   * @return {boolean}
   * @memberof AbstractScraper
   */
  basicMusicEventsFilter = (musicEvent) => {

    const meetsRequiredProperties = this.puppeteerConfig.app.mainPage.requiredProperties.reduce((prev, next)=>{
      return prev && musicEvent[next]
    }, true)        
    if (!meetsRequiredProperties) {
      parentPort.postMessage(this.qwm.messageRoll(`
      <a href='${musicEvent.venueEventUrl}'>${musicEvent.title}</a> ongeldig.
    `));
    }
   
    const t = musicEvent?.title ?? "";
    const st = musicEvent?.shortText ?? "";
    const searchShowNotOnDate = `${t.toLowerCase()} ${st.toLowerCase()}`;
    
    let forbiddenTermUsed = '';
    const hasForbiddenTerm = [
      "uitgesteld",
      "gecanceld",
      "afgelast",
      "geannuleerd",
      "verplaatst",
    ].map((forbiddenTerm) => {
      if (searchShowNotOnDate.includes(forbiddenTerm)) {
        forbiddenTermUsed += ` ${forbiddenTerm}`;
      }
      return searchShowNotOnDate.includes(forbiddenTerm);
    }).reduce((prev, next) =>{
      return prev && next
    }, true);
    
    if (hasForbiddenTerm) {
      parentPort.postMessage(this.qwm.messageRoll(`<a href='${musicEvent.venueEventUrl}'>${musicEvent.title}</a> is ${forbiddenTermUsed}/`));
    }

    return !hasForbiddenTerm && meetsRequiredProperties;
     
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
    let generatedEvent;
    try {
      const useableEventsCheckedArray = checkedEvents.map((a) => a);

      const generatedEvent = eventGen.next();
      if (generatedEvent.done) return useableEventsCheckedArray;

      const eventToCheck = generatedEvent.value;
      const checkResult = await this.singleEventCheck(eventToCheck);
      if (checkResult.success) {
        useableEventsCheckedArray.push(eventToCheck);
      } else {
        parentPort.postMessage(
          this.qwm.debugger([
            `${eventToCheck?.title} uitgefilterd asyncCheck`,
            {
              title: eventToCheck.title,
              shortText: eventToCheck.shortText,
              url: eventToCheck.venueEventUrl,
              reason: checkResult.reason,
            },
          ])
        );
      }

      // parentPort.postMessage(
      //   this.qwm.debugger([
      //     `${eventToCheck?.title} filterres`,
      //     {sucess: checkResult.success, reason: checkResult.reason},
      //   ])
      // );

      return await this.eventAsyncCheck({
        eventGen,
        checkedEvents: useableEventsCheckedArray,
      });
    } catch (error) {
      _t.handleError(
        error,
        workerData,
        `eventAsyncCheck faal met ${generatedEvent?.value?.title}`
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
      reason: null,
    };
  }

  /**
   * methode waarmee singleEventCheck vervangen kan worden.
   * kijkt naar 'voornaamste titel', dwz de event.title tot aan een '&'.
   *
   * @param {*} event
   * @return {event: MusicEvent, success: boolean}
   * @memberof AbstractScraper
   */
  async isRock(event) {
    const mainTitle = event.title.replace(/&.*/, "").trim().toLowerCase();
    const MetalEncFriendlyTitle = mainTitle.replace(/\s/g, "_");

    const foundInMetalEncyclopedia = await fetch(
      `https://www.metal-archives.com/search/ajax-band-search/?field=name&query=${MetalEncFriendlyTitle}`
    )
      .then((result) => result.json())
      .then((parsedJson) => {
        return parsedJson.iTotalRecords > 0;
      });
    if (foundInMetalEncyclopedia) {
      return {
        event,
        success: true,
        reason: 'found in metal encyclopedia'
      };
    }

    const page = await this.browser.newPage();
    await page.goto(
      `https://en.wikipedia.org/wiki/${mainTitle.replace(/\s/g, "_")}`
    );
    const wikiRockt = await page.evaluate(() => {
      const isRock =
        !!document.querySelector(".infobox a[href*='rock']") &&
        !document.querySelector(".infobox a[href*='Indie_rock']");
      const isMetal = !!document.querySelector(".infobox a[href*='metal']");
      return isRock || isMetal;
    });
    !page.isClosed() && page.close();
    if (wikiRockt) {
      return {
        event,
        success: true,
        reason: `found on wikipedia`
      };
    }
    return {
      event,
      success: false,
      reason: 'nothing found'
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

    let singleEvent = useableEventsList.shift();
    parentPort.postMessage(this.qwm.todoNew(useableEventsList.length));

    // maak pagina
    let singleEventPage
    if (!this.puppeteerConfig.app.singlePage.useCustomScraper) {
      singleEventPage = await this.createSinglePage(
        singleEvent.venueEventUrl
      );
      if (!singleEventPage) {
        return useableEventsList.length
          ? this.processSingleMusicEvent(useableEventsList)
          : useableEventsList;
      }
    }

    // page info ophalen
    const pageInfo = await this.getPageInfo({
      page: singleEventPage,
      url: singleEvent.venueEventUrl, // @TODO overal weghalen vervangen met event
      event: singleEvent,
    });

    if (!pageInfo || !!pageInfo?.unavailable) {
      parentPort.postMessage(
        this.qwm.messageRoll(
          `SKIP ${pageInfo.pageInfo} ${pageInfo?.unavailable ?? ""}`
        )
      );
      return useableEventsList.length
        ? this.processSingleMusicEvent(useableEventsList)
        : useableEventsList;
    }

    // nabewerken page info
    pageInfo.price = this.getPrice(pageInfo?.priceTextcontent);
    pageInfo.longText = this.writeLongTextHTML(pageInfo?.longTextHTML);

    // als single event nog music event moet worden.
    if (!(singleEvent instanceof MusicEvent)) {
      singleEvent = new MusicEvent(singleEvent)
    } 

    // samenvoegen & naar EventsList sturen
    singleEvent.merge(pageInfo);
    singleEvent.isValid
      ? singleEvent.register()
      : singleEvent.registerINVALID(this.workerData);

    singleEventPage && !singleEventPage.isClosed() && (await singleEventPage.close());

    return useableEventsList.length
      ? this.processSingleMusicEvent(useableEventsList)
      : useableEventsList;
  }

  getPrice(priceTextcontent) {
    if (!priceTextcontent) return;
    return this.getPriceFromHTML(priceTextcontent);
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
  async getPageInfo() {
    // abstract function getPageInfo
    throw Error("abstact function getPAgeInfo called");
  }

  /**
   * step 3.6
   * Vervangt generieke code aan begin getPageInfo
   * start stopFunctie op
   * @returns {timeout} stopFunctie
   * @memberof AbstractScraper
   */
  async getPageInfoStart(){
    const stopFunctie = setTimeout(() => {
      throw new Error(
        `getPageInfo is de max tijd voor zn functie ${this.maxExecutionTime} voorbij `
      );
    }, this.maxExecutionTime);
    return {
      stopFunctie
    }
  }

  /**
   * step 3.9
   * Vervangt generieke code aan eind getPageInfo
   * stopt stopFunctie
   * verwijderd overbodige witruimte
   * kijkt naar evt fouten in pageInfo.errors
   * @returns {*} pageInfo
   * @memberof AbstractScraper
   */  
  async getPageInfoEnd({pageInfo, stopFunctie, page}){
    
    pageInfo.errors.forEach((errorWrapper) => {
      _t.handleError(
        errorWrapper.error,
        workerData,
        errorWrapper?.remarks ?? null,
        errorWrapper?.errorLevel
      );
    });
  
    if (pageInfo.longTextHTML) {
      pageInfo.longTextHTML = _t.killWhitespaceExcess(pageInfo.longTextHTML)
    }
    if (pageInfo.priceTextcontent) {
      pageInfo.priceTextcontent = _t.killWhitespaceExcess(pageInfo.priceTextcontent)
    }

    if (!pageInfo) {
      return {
        unavailable: `Geen resultaat van pageInfo`, //TODO samen met musicEvent.unavailable
      };
    }
  
    page && !page.isClosed() && page.close();
    clearTimeout(stopFunctie);
    return pageInfo;    
  }

  getPriceFromHTML(testText = null, contextText = null) {
    if (!testText) {
      return this.getPriceFromHTML(contextText);
    }
  
    const priceMatch = testText.match(/((\d{1,3})[,.]+(\d\d|-))/);
  
    if (
      !priceMatch &&
      (testText.includes("gratis") || testText.includes("free"))
    ) {
      return 0;
    }
  
    if (priceMatch && priceMatch.length >= 4) {
      const integers = Number(priceMatch[2]) * 100;
      let cents;
      if (priceMatch[3].includes("-")) {
        cents = 0;
      } else {
        cents = Number(priceMatch[3]);
      }
  
      return (integers + cents) / 100;
    }
  
    const onlyIntegers = testText.match(/\d{1,3}/);
    if (onlyIntegers && onlyIntegers.length) {
      return Number(onlyIntegers[0]);
    }
  
    if (contextText) {
      const searchresultInBroaderContext = this.getPriceFromHTML(contextText);
      if (searchresultInBroaderContext) {
        return searchresultInBroaderContext;
      }
    }
  
    return null;
  }  

  postPageInfoProcessing(pageInfo = null) {
    const pageInfoCopy = { ...pageInfo };
    if (!pageInfo) return {};
  
    if (pageInfo.priceTextcontent || pageInfo.priceContexttext) {
      const context = pageInfo?.priceContexttext ?? null;
      pageInfoCopy.price = Number(this.getPriceFromHTML(pageInfo.priceTextcontent, context));
    }
  
    pageInfoCopy.longText = this.saveLongTextHTML(pageInfo);
    return pageInfoCopy;
  }  

  saveLongTextHTML(pageInfo) {
    if (
      !Object.prototype.hasOwnProperty.call(pageInfo, "longTextHTML") ||
      !pageInfo.longTextHTML
    ) {
      return null;
    }
    let uuid = crypto.randomUUID();
    const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;
  
    fs.writeFile(longTextPath, pageInfo.longTextHTML, "utf-8", () => {});
    return longTextPath;
  }  

  // step 4
  async announceToMonitorDone() {
    parentPort.postMessage(this.qwm.workerDone(EventsList.amountOfEvents));
    return true;
  }

  // step 4.5
  async closeBrowser() {
    this.browser &&
      Object.prototype.hasOwnProperty.call(this.browser, "close") &&
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
      await page.goto(url, this.puppeteerConfig.singlePage);
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

