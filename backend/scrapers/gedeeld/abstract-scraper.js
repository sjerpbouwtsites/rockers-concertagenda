//#region                                                 IMPORTS
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
import ErrorWrapper from "../../mods/error-wrapper.js";
import makeLongHTML from "./longHTML.js";
import https from 'https';
import sharp from 'sharp';
//#endregion                                              IMPORTS

export default class AbstractScraper {

  completedMainPage = false
  workingOnSinglePages = false;
  rockAllowList = '';
  rockRefuseList = '';
  rockAllowListNew = '';
  rockRefuseListNew = '';  

  eventImagesFolder = fsDirections.publicEventImages;

  static unavailabiltyTerms = [
    'uitgesteld', 'verplaatst', 'locatie gewijzigd', 'besloten', 'afgelast', 'geannuleerd'
  ]

  //#region [rgba(0, 0, 30, 0.30)]                             DEBUGSETTINGS
  debugCorruptedUnavailable = false;
  debugSingleMergedEventCheck = false;
  debugRawEventAsyncCheck = false;
  debugBaseEvents = false;
  debugPageInfo = false;
  debugPrice = false;
  //#endregion                                                DEBUGSETTINGS

  //#region [rgba(0, 0, 60, 0.30)]                             ISROCKSETTINGS  
  /**
   * Gebruikt in singleRawEventChecks' hasForbiddenTerms
   *
   * @static
   * @memberof AbstractScraper
   */
  static forbiddenTerms = [
    'clubnacht',
    'VERBODENGENRE',
    "alternatieve rock",
    "americana",
    "americana",
    "countryrock",
    "dromerig",
    "fan event",
    "filmvertoning",
    "indie",
    "interactieve lezing",
    "karaoke",
    "london calling",
    "shoegaze",
    `art rock`,
    `blaasrock`,
    `dream pop`,
    `Dream Punk`,
    'uptempo',
    `experi-metal`,
    `folkpunk`,
    `jazz-core`,
    `neofolk`,
    `poetry`,
    `pubquiz`,  
    `punk-hop`,
    `quiz'm`,
    `schaakinstuif`,
    `afrobeats`
  ];

  static wikipediaGoodGenres = [
    `[href$=metal]`,
    `[href$=metal_music]`,
    `[href=Hard_rock]`,
    `[href=Acid_rock]`,
    `[href=Death_rock]`,
    `[href=Experimental_rock]`,
    `[href=Garage_rock]`,
    `[href=Hard_rock]`,
    `[href=Post-rock]`,
    `[href=Punk_rock]`,
    `[href=Stoner_rock]`,
    `[href=Hardcore_punk]`,
    `[href=Skate_punk]`,
    `[href=Street_punk]`,
    `[href=Ska_punk]`,
    `[href=Avant-garde_metal]`,
    `[href=Extreme_metal]`,
    `[href=Black_metal]`,
    `[href=Death_metal]`,
    `[href=Doom_metal]`,
    `[href=Speed_metal]`,
    `[href=Thrash_metal]`,
    `[href=Glam_metal]`,
    `[href=Groove_metal]`,
    `[href=Power_metal]`,
    `[href=Symphonic_metal]`,
    `[href=Funk_metal]`,
    `[href=Rap_metal]`,
    `[href=Nu_metal]`,
    `[href=Drone_metal]`,
    `[href=Folk_metal]`,
    `[href=Gothic_metal]`,
    `[href=Post-metal]`,
    `[href=Industrial_metal]`,
    `[href=Neoclassical_metal]`,
    `[href=Progressive_metal]`,
    `[href=Sludge_metal]`,
    `[href=Viking_metal]`,

  ];

  static goodCategories = [
    'heavy rock', 
    `death metal`,
    `doom`,
    `grindcore`,
    `hard rock`,
    `hardcore punk`,
    `hardcore`,
    `heavy metal`,
    `heavy psych`,
    `heavy rock 'n roll`,
    `stoner`,
    `garage`,
    `industrial`,
    `metal`,
    `math rock`,
    `metalcore`,
    `neue deutsche haerte`,
    `neue deutsche harte`,
    `new wave`,
    `noise`,
    `post-punk`,
    `postpunk`,
    `power metal`,
    `psychobilly`,
    `punk`,
    `punx`,
    `rockabilly, surf`,
    `surfpunkabilly`,
    `symphonic metal`,
    `thrash`,
  ]
  //#endregion                                                ISROCKSETTINGS

  //#region [rgba(0, 0, 120, 0.30)]                            CONSTRUCTOR & INSTALL  
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
    this.rockAllowList = fs.readFileSync(fsDirections.isRockAllow, 'utf-8')
    this.rockRefuseList = fs.readFileSync(fsDirections.isRockRefuse, 'utf-8')
  }
  //#endregion                                                CONSTRUCTOR & INSTALL 

  /**
   * Checks in workerData if this family is forced.
   *
   * @readonly
   * @memberof AbstractScraper
   */
  get isForced(){
    const forced = workerData?.shellArguments?.force ?? '';
    return forced.includes(workerData.family)
  }

  //#region [rgba(0, 0, 180, 0.30)]                            DIRTYLOG, TALK, DEBUG
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
  //#endregion                                                DIRTYLOG, TALK, DEBUG

  //#region [rgba(0, 0, 240, 0.30)]                            SCRAPE INIT & SCRAPE DIE
  async scrapeInit() {

    if (!this.puppeteerConfig.app.mainPage.useCustomScraper || !this.puppeteerConfig.app.singlePage.useCustomScraper) {
      this.browser = await puppeteer.launch();
    } else {
      this.browser = 'disabled';
    }

    this.emptyImageFolder();

    const baseMusicEvents = await this.mainPage().catch(
      this.handleOuterScrapeCatch
    );
    if (!baseMusicEvents) return false;
    const checkedEvents = await this.announceAndCheck(baseMusicEvents).catch(
      this.handleOuterScrapeCatch
    );
    this.dirtyLog({
      title: 'checkedEvents',
      checkedEvents
    })
    this.completedMainPage = true;
    if (!checkedEvents) return false;
    await this.processSingleMusicEvent(checkedEvents).catch(
      this.handleOuterScrapeCatch
    );

    await this.saveRockRefusedAllowedToFile()

    await this.announceToMonitorDone();
    if (!this.puppeteerConfig.app.mainPage.useCustomScraper || !this.puppeteerConfig.app.singlePage.useCustomScraper) {
      await this.closeBrowser();
    }
    await this.saveEvents();
    // overige catch in om init heen
  }

  async scrapeDie(){
    this.dirtyTalk('DIEING!')
    await this.closeBrowser();
    await this.saveEvents();
    await this.announceToMonitorDone()
    this.dirtyTalk('DEAD')
    await _t.waitFor(50);
    process.exit()
  }
  //#endregion                                                 SCRAPE INIT & SCRAPE DIE  

  //#region [rgba(60, 0, 60, 0.30)]                            MAIN PAGE
  async mainPage() {
    throw Error("abstract method used thx ");
  }

  baseEventDate(){
    const ddd = new Date();
    const thisMonth =((new Date()).getMonth() + 1).toString().padStart(2,'0');
    const thisDay =((new Date()).getDate()).toString().padStart(2,'0');
    return `${ddd.getFullYear()}${thisMonth}${thisDay}`;    
  }

  async checkBaseEventAvailable(searching){
    const baseEventFiles = fs.readdirSync(fsDirections.baseEventlists);
    const theseBaseEvents = baseEventFiles.filter(filenames => filenames.includes(searching));
    if (!theseBaseEvents || (theseBaseEvents.length < 1)) {
      return false;
    }
    const thisBaseEvent = theseBaseEvents[0];
    // 20231201
    const baseEventDate = thisBaseEvent.split('T')[1].split('.json')[0];
    const refDate = this.baseEventDate();
    if (refDate !== baseEventDate) {
      return false;
    }
    return JSON.parse(fs.readFileSync(`${fsDirections.baseEventlists}/${thisBaseEvent}`));
  }

  async saveBaseEventlist(key, data){

    if (!data){
      const err = new Error(`No data in saveBaseEventList ${key}`);
      _t.wrappedHandleError(new ErrorWrapper({
        error:err,
        remarks: `saveBaseEventList`,
        errorLevel: 'close-thread',
        workerData,
        // toDebug: {
        //   //
        // }
      }))
      return;
    }

    //verwijder oude
    const baseEventFiles = fs.readdirSync(fsDirections.baseEventlists);
    const theseBaseEvents = baseEventFiles.filter(filenames => filenames.includes(key));
    if (theseBaseEvents && theseBaseEvents.length) {
      theseBaseEvents.forEach(file => {
        fs.unlinkSync(`${fsDirections.baseEventlists}/${file}`);
      })
    }    
    //sla nieuwe op
    const refDate = this.baseEventDate();    
    const fileName = `${fsDirections.baseEventlists}/${key}T${refDate}.json`;
    fs.writeFileSync(fileName, JSON.stringify(data), 'utf8')
    return true;
  }

  /**
   * // stap 1.2
   * Initieert stopFunctie; 
   * indien puppeteer niet uitgezet, initieert pagina & navigeert naar main
   * @returns {stopFunctie timeout, page puppeteer.Page}
   */
  async mainPageStart(){

    // @TODO 3 stopfuncties maken: 1 base events; 1 single; 1 totaal.
    const stopFunctie = setTimeout(() => {
      _t.wrappedHandleError(new ErrorWrapper({
        error: new Error('Timeout baseEvent'),
        remarks: `baseEvent ${workerData.name} overtijd. Max: ${this.puppeteerConfig.mainPage.timeout}`,
        workerData,
        errorLevel: 'close-thread',
      }
      ))
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

    // zet ErrorWrapper class in puppeteer document.
    await page.evaluate(({ErrorWrapperString}) => {
      const newScriptContent = ErrorWrapperString;
      const scriptTag = document.createElement('script');
      scriptTag.id = 'rockagenda-extra-code';
      scriptTag.innerHTML = newScriptContent;
      document.body.appendChild(scriptTag);
    }, {ErrorWrapperString: ErrorWrapper.toString()});
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
   * haalt rawEvents door isMusicEventCorruptedMapper en returned
   *
   * @param {stopFunctie timeout, page Puppeteer.Page, rawEvents {}<>} 
   * @return {MusicEvent[]}
   * @memberof AbstractScraper
   */
  async mainPageEnd({stopFunctie, page, rawEvents}){

    this.isForced && this.debugBaseEvents && this.dirtyLog(rawEvents)

    if (stopFunctie) {
      clearTimeout(stopFunctie);
    }
    
    page && !page.isClosed() && page.close();

    const eventsWithLongHTMLShortText = rawEvents.map(event => {
      if (event.longTextHTML) {
        event.longTextHTML = _t.killWhitespaceExcess(event.longTextHTML);
      } 
      if (event.shortText) {
        event.shortText = _t.killWhitespaceExcess(event.shortText);
      } 
      return event;
    })

    eventsWithLongHTMLShortText.forEach((event) => {
      const errorVerz = Object.prototype.hasOwnProperty.call(event, 'errors') 
        ? event.errors 
        : [];
      errorVerz.forEach((errorData) => {
        errorData.workerData = workerData;
        if (!errorData.error){
          errorData.error = new Error(errorData?.remarks ?? '');
        }
        const wrappedError = new ErrorWrapper(errorData);
        _t.wrappedHandleError(wrappedError);
      });
    });

    const r = rawEvents
      .map(rawEvent => {
        rawEvent.location = workerData.family;
        rawEvent.origin = workerData.family;
        return rawEvent
      })
    ;
    if (this.puppeteerConfig.app.mainPage.enforceMusicEventType){
      return r.map((event) => new MusicEvent(event));
    } else {
      return r;
    }
      
  }

  //#endregion                                                MAIN PAGE

  //#region [rgba(120, 0, 120, 0.30)]                          MAIN PAGE CHECK AND ANNOUNCE  
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
  isMusicEventCorruptedMapper = (musicEvent) => {

    const requiredProperties = !this.completedMainPage 
      ? this.puppeteerConfig?.app?.mainPage?.requiredProperties
      : this.puppeteerConfig?.app?.singlePage?.requiredProperties

    const missingProperties = requiredProperties
      .map((property)=>{
        if (property === 'price') {
          if (musicEvent?.price === null || musicEvent?.price === 'undefined'){
            return `<span class='corrupted-prop'>price: ${musicEvent?.price}</span>`;
          } else {
            return null;
          }
        }
        if (property === 'start' || property === 'door' || property === 'end') {
          if (musicEvent[property]?.match(/\d\d\d\d-\d\d-\d\dT\d\d:\d\d/)) {
            return null;
          } else {
            return `<span class='corrupted-prop'>${property}: ${musicEvent[property]}</span>`;
          }
        } 
        if ([null, undefined].includes(musicEvent[property])){
          return `<span class='corrupted-prop'>${property}: ${musicEvent[property]}</span>`;
        } else {
          return null;
        }
      }).filter(a => a)

    if (missingProperties.length > 0) {
      const page = !this.completedMainPage ? 'main:' : 'single:';
      const mis = missingProperties.join(', ');
      musicEvent.corrupted = `${page} ${mis}`
    }
   
    return musicEvent;
     
  }

  // step 2
  /**
   * take base events announce and check
   * Kondigt begin taak aan aan monitor
   * Initeert de generator check op events
   *
   * @param {[MusicEvents]} baseMusicEvents uitgedraaid door mainPage
   * @return {checkedEvents [MusicEvent]}  Want geeft werk van rawEventsAsyncCheck door.
   * @memberof AbstractScraper
   *
   * checkedEvents
   */
  async announceAndCheck(baseMusicEvents) {
    parentPort.postMessage(this.qwm.workerStarted());
    const eventGen = this.eventGenerator(baseMusicEvents);
    const checkedEvents = [];
    return await this.rawEventsAsyncCheck({
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
  async rawEventsAsyncCheck({ eventGen, checkedEvents }) {
    let generatedEvent;
    try {
      const useableEventsCheckedArray = checkedEvents.map((a) => a);

      const generatedEvent = eventGen.next();
      if (generatedEvent.done) return useableEventsCheckedArray;

      const eventToCheck = generatedEvent.value;
      const checkResult = await this.singleRawEventCheck(eventToCheck);
      let workingTitle = checkResult.workingTitle || this.cleanupEventTitle(eventToCheck.title);
      if (checkResult.success) {
        useableEventsCheckedArray.push(eventToCheck);

        if (this.debugRawEventAsyncCheck && checkResult.reason){
          parentPort.postMessage(
            this.qwm.debugger(
              {
                title: 'Raw event async check',
                event: `<a class='single-event-check-notice single-event-check-notice--success' href='${eventToCheck.venueEventUrl}'>${workingTitle}<a/>`,              
                reason: checkResult.reason,
              },
            )
          );        
        }
      } else {
        if (this.debugRawEventAsyncCheck){
          parentPort.postMessage(
            this.qwm.debugger(
              {
                title: 'Raw event async check',
                event: `<a class='single-event-check-notice single-event-check-notice--failure' href='${eventToCheck.venueEventUrl}'>${workingTitle}<a/>`,              
                reason: checkResult.reason,
              },
            )
          );
        }
      }

      return await this.rawEventsAsyncCheck({
        eventGen,
        checkedEvents: useableEventsCheckedArray,
      });
    } catch (error) {
      _t.handleError(
        error,
        workerData,
        `rawEventsAsyncCheck faal met ${generatedEvent?.value?.title}`,
        'close-thread',
        {
          generatedEvent,          
        }
      );
    }
  }

  /**
   * abstracte methode, te overschrijve in de kindWorkers.
   *
   * @param {MusicEvent} event om te controleren
   * @return {event {MusicEvent, success bool}}
   * @memberof AbstractScraper
   */
  async singleRawEventCheck(event) {
    // abstracte methode, over te schrijven
    return {
      event,
      success: true,
      reason: null,
    };
  }

  //#endregion                                                 MAIN PAGE CHECK

  //#region [rgba(60, 0, 60, 0.30)]                            SINGLE PAGE  
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
        singleEvent.corrupted = 'niet gelukt page te maken';
        return useableEventsList.length
          ? this.processSingleMusicEvent(useableEventsList)
          : useableEventsList;
      }
    }

    // corruptie check afkomstig nog van baseEvent. niet door naar pageInfo
    if (singleEvent.corrupted){
      singleEvent.registerINVALID();
      parentPort.postMessage(
        this.qwm.messageRoll(
          `<a href='${singleEvent.venueEventUrl}'>😵 Corrupted ${singleEvent.title}</a> ${singleEvent.corrupted}`
        )
      );
      return useableEventsList.length
        ? this.processSingleMusicEvent(useableEventsList)
        : useableEventsList;      
    }

    // page info ophalen
    const pageInfo = await this.singlePage({
      page: singleEventPage,
      url: singleEvent.venueEventUrl, // @TODO overal weghalen vervangen met event
      event: singleEvent,
    });

    // als single event nog music event moet worden.
    if (!(singleEvent instanceof MusicEvent)) {
      singleEvent = new MusicEvent(singleEvent)
    } 

    // samenvoegen & naar EventsList sturen
    singleEvent.merge(pageInfo);

    //titel / shortext postfix
    singleEvent = this.titelShorttextPostfix(singleEvent);

    // check op properties vanuit single page
    singleEvent = this.isMusicEventCorruptedMapper(singleEvent);

    if (singleEvent.corrupted || singleEvent.unavailable){
      singleEvent.registerINVALID(this.workerData);
      if (singleEvent.corrupted) {
        this.dirtyDebug({
          title: `💀 ${singleEvent.corrupted}`,
          event: `<a class='single-event-check-notice single-event-check-notice--failure' href='${singleEvent.venueEventUrl}'>${singleEvent.title}</a> Corr.`,
        })   
      }
      if (singleEvent.unavailable) {
        this.dirtyDebug({
          title: `😣 ${singleEvent.unavailable}`,
          event: `<a class='single-event-check-notice single-event-check-notice--failure' href='${singleEvent.venueEventUrl}'>${singleEvent.title}</a> Unav.`,
        })   
      }
      
      singleEventPage && !singleEventPage.isClosed() && (await singleEventPage.close());
      return useableEventsList.length
        ? this.processSingleMusicEvent(useableEventsList)
        : useableEventsList;      
    }
    
    singleEvent.longText = this.writeLongTextHTML(singleEvent);

    const mergedEventCheckRes = await this.singleMergedEventCheck(singleEvent, pageInfo);
    if (mergedEventCheckRes.success) {
      if (this.debugSingleMergedEventCheck && mergedEventCheckRes.reason) {
        this.dirtyDebug({
          title: 'Merged async check 👍',
          event: `<a class='single-event-check-notice single-event-check-notice--success' href='${mergedEventCheckRes.event.venueEventUrl}'>${mergedEventCheckRes.event.title}</a>`,
          reason: mergedEventCheckRes.reason,
        })      
      }
      singleEvent.isValid
        ? singleEvent.register() // TODO hier lopen dingen echt dwars door elkaar. integreren in soort van singleMergedEventCheckBase en dan anderen reducen erop of weet ik veel wat een gehack vandaag
        : singleEvent.registerINVALID(this.workerData);
    } else {
      if (this.debugSingleMergedEventCheck && mergedEventCheckRes.reason){
        this.dirtyDebug({
          title: 'Merged async check 👎',        
          event: `<a class='single-event-check-notice single-event-check-notice--failure' href='${mergedEventCheckRes.event.venueEventUrl}'>${mergedEventCheckRes.event.title}</a>`,
          reason: mergedEventCheckRes.reason,
        })
      }
      singleEvent.registerINVALID(this.workerData);
    }

    singleEventPage && !singleEventPage.isClosed() && (await singleEventPage.close());

    return useableEventsList.length
      ? this.processSingleMusicEvent(useableEventsList)
      : useableEventsList;
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
      try {
        await page.goto(url, this.puppeteerConfig.singlePage);
      } catch (error) {
        _t.handleError(
          error,
          workerData,
          `Mislukken aanmaken <a class='single-page-failure error-link' href='${url}'>single pagina</a>`,
          'notice',
          url
        );        
      }
      
      // zet ErrorWrapper class in puppeteer document.
      await page.evaluate(({ErrorWrapperString}) => {
        const newScriptContent = ErrorWrapperString;
        const scriptTag = document.createElement('script');
        scriptTag.id = 'rockagenda-extra-code';
        scriptTag.innerHTML = newScriptContent;
        document.body.appendChild(scriptTag);
      }, {ErrorWrapperString: ErrorWrapper.toString()});      
      return page;
    } catch (error) {
      _t.handleError(
        error,
        workerData,
        `Mislukken aanmaken <a class='single-page-failure error-link' href='${url}'>single pagina</a> wss duurt te lang`,
        'notice',
        null,
      );
    }
    
  }

  titelShorttextPostfix(musicEvent){
    const titleIsCapsArr = musicEvent.title
      .split('')
      .map(char => char === char.toUpperCase());
    const noOfCapsInTitle = titleIsCapsArr.filter(a => a).length;
    const toManyCapsInTitle = ((musicEvent.title.length - noOfCapsInTitle) / musicEvent.title.length) < .5;
    if (toManyCapsInTitle){
      musicEvent.title = musicEvent.title.substring(0,1).toUpperCase()+musicEvent.title.substring(1,500).toLowerCase()
    }

    if (musicEvent.title.length > 45){
      const splittingCandidates = ['+', '&', ':', '>', '•'];
      let i = 0;
      do {
        const splitted = musicEvent.title.split(splittingCandidates[i]);
        musicEvent.title = splitted[0];
        const titleRest = splitted.splice(1, 45).join(' ');
        musicEvent.shortText = titleRest + ' ' + musicEvent.shortText;              
        i = i + 1;
      } while (musicEvent.title.length > 45 && i < splittingCandidates.length);
    }

    // if (musicEvent.title.length > 45){
    //   musicEvent.title = musicEvent.title.replace(/\(.*\)/,'').replace(/\s{2,25}/,' ');
    // }    

    musicEvent.shortText = musicEvent?.shortText?.replace(/<\/?\w+>/g, "");

    return musicEvent
  }

  // step 3.5
  async singlePage() {
    // abstract function singlePage
    throw Error("abstact function singlePage called");
  }

  /**
   * step 3.6
   * Vervangt generieke code aan begin singlePage
   * start stopFunctie op
   * @returns {timeout} stopFunctie
   * @memberof AbstractScraper
   */
  async singlePageStart(event){
    const stopFunctie = setTimeout(() => {
      _t.wrappedHandleError(new ErrorWrapper({
        error: new Error('Timeout baseEvent'),
        remarks: `<a href='${event?.venueEventUrl}' class='error-link get-page-info-timeout'>singlePage ${workerData.name} overtijd</a>.\nMax: ${this.puppeteerConfig.singlePage.timeout}`,
        workerData,
        errorLevel: 'notice',
      }
      ))
    }, this.puppeteerConfig.singlePage.timeout);
    return {
      stopFunctie
    }
  }

  /**
   * step 3.9
   * Vervangt generieke code aan eind singlePage
   * stopt stopFunctie
   * verwijderd overbodige witruimte
   * kijkt naar evt fouten in pageInfo.errors
   * @returns {*} pageInfo
   * @memberof AbstractScraper
   */  
  async singlePageEnd({pageInfo, stopFunctie, page, event}){

    this.isForced && this.debugPageInfo && this.dirtyLog({
      event,
      pageInfo
    })

    if (!pageInfo){
      page && !page.isClosed() && page.close();
      throw new Error('page info ontbreekt.')
    }

    if (!Array.isArray(pageInfo?.errors)) {
      
      const wrappedError = new ErrorWrapper({
        error: new Error(`pageInfo object incompleet; geen errors`),
        remarks: `pageInfo object incompleet; geen errors`,
        workerData,
        errorLevel: 'notice',
        toDebug: {
          title: 'failed page info',
          pageInfoData: pageInfo,
        }
      });
      _t.wrappedHandleError(wrappedError);
      
      page && !page.isClosed() && page.close();
      clearTimeout(stopFunctie);
      return {
        corrupted: `Geen resultaat van pageInfo`,
      };      
    }
    
    
    pageInfo?.errors?.forEach((errorData) => {
      try {
        if (!errorData?.workerData){
          errorData.workerData = workerData;
        }
        if (!errorData?.remarks){
          errorData.remarks = 'geen remarks';
        }        
        if (!errorData.error?.message){
          const initRemarks = errorData?.remarks ?? '';
          errorData.error = new Error(!errorData?.remarks);
          const url = event.venueEventUrl ?? pageInfo.venueEventUrl;
          const title = event?.title ?? pageInfo.title;
          errorData.remarks = `Mislukte error van:\n\n${initRemarks}\n<a href='${url}'>${title}</a>`;
        }
        const wrappedError = new ErrorWrapper(errorData);
        _t.wrappedHandleError(wrappedError);        
      } catch (errorOfErrors) {
        const cp = {...pageInfo};
        delete cp.longTextHTML;
        _t.handleError(
          errorOfErrors, 
          workerData,
          'mislukte error',
          'close-thread',
          cp
        )
         
        
      }

    });
    
    page && !page.isClosed() && page.close();
    clearTimeout(stopFunctie);
    return pageInfo;    
  }

  /**
   * abstracte methode, te overschrijve in de kindWorkers.
   *
   * @param {MusicEvent} event om te controleren
   * @return {event {MusicEvent, success bool}}
   * @memberof AbstractScraper
   */
  async singleMergedEventCheck(event, pageInfo = null) {
    // abstracte methode, over te schrijven
    return {
      event,
      success: true,
      reason: null,
    };
  }  
  //#endregion                                                 SINGLE PAGE

  //#region [rgba(90, 0, 90, 0.30)]                            ASYNC CHECKERS
  
  /**
   * Loopt over AbstractScraper.goodCategories en kijkt of ze in 
   * een bepaalde text voorkomen, standaard bestaande uit de titel en de shorttext van 
   * de event.
   *
   * @param {*} event 
   * @param {string} [keysToCheck=['title', 'shortText']] 
   * @return {event, {bool} succes, {string} reason}
   * @memberof AbstractScraper
   */
  async hasGoodTerms(event, keysToCheck ){
    const keysToCheck2 = keysToCheck || ['title', 'shortText'];
    let combinedTextToCheck = '';
    for (let i = 0; i < keysToCheck2.length; i++){
      try {
        let v = event[keysToCheck2[i]];
        if (v){
          combinedTextToCheck += v.toLowerCase()
        }
      } catch (error) {
        this.dirtyDebug({
          fout: `fout maken controle text met keys, key${keysToCheck2[i]}`,
          toDebug: {
            event
          }
        }, 'hasGoodTerms')        
      }
    }

    const hasGoodTerm = AbstractScraper.goodCategories.find(goodTerm=> combinedTextToCheck.includes(goodTerm))
    const workingTitle = this.cleanupEventTitle(event.title);
    if (hasGoodTerm) {
      return {
        workingTitle,
        event,
        success: true,
        reason: `Goed in `+keysToCheck2.join(''),
      };    
    }
    
    return {
      workingTitle,
      event,
      success: false,
      reason: `Geen bevestiging gekregen uit ${keysToCheck2.join(';')} ${combinedTextToCheck}`,
    };
  }  
  
  /**
   * Loopt over AbstractScraper.forbiddenTerms en kijkt of ze in 
   * een bepaalde text voorkomen, standaard bestaande uit de titel en de shorttext van 
   * de event.
   *
   * @param {*} event 
   * @param {string} [keysToCheck=['title', 'shortText']] 
   * @return {event, {bool} succes, {string} reason}
   * @memberof AbstractScraper
   */
  async hasForbiddenTerms(event, keysToCheck){
    const workingTitle = this.cleanupEventTitle(event.title);
    const keysToCheck2 = Array.isArray(keysToCheck) ? keysToCheck : ['title', 'shortText'];
    let combinedTextToCheck = '';
    for (let i = 0; i < keysToCheck2.length; i++){
      let v = event[keysToCheck2[i]];
      if (v){
        combinedTextToCheck += v + ' ';
      }
    }
    combinedTextToCheck = combinedTextToCheck.toLowerCase();
    const hasForbiddenTerm = AbstractScraper.forbiddenTerms.find(forbiddenTerm=> combinedTextToCheck.includes(forbiddenTerm))
    if (hasForbiddenTerm) {
      return {
        workingTitle,
        event,
        success: true,
        reason: `verboden genres gevonden in ${keysToCheck2.join('; ')}`,
      };
    }
    
    return {
      workingTitle,
      event,
      success: false,
      reason: `verboden genres niet gevonden in ${keysToCheck2.join('; ')}.`,
    };    
  }

  saveRefusedTitle(title){
    this.rockRefuseList = `${title}\n${this.rockRefuseList}`;
    this.rockRefuseListNew = `${title}\n${this.rockRefuseListNew}`;
  }

  saveAllowedTitle(title){
    this.rockAllowList = `${title}\n${this.rockAllowList}`;    
    this.rockAllowListNew = `${title}\n${this.rockAllowListNew}`;
  }

  async saveRockRefusedAllowedToFile(){
    if (this.rockAllowListNew){
      const huiLijst = fs.readFileSync(fsDirections.isRockAllow, 'utf-8');
      fs.writeFileSync(fsDirections.isRockAllow, `${this.rockAllowListNew}\n${huiLijst}`, 'utf-8')
    }
    if (this.rockRefuseListNew){
      const huiLijst = fs.readFileSync(fsDirections.isRockRefuse, 'utf-8');
      fs.writeFileSync(fsDirections.isRockRefuse, `${this.rockRefuseListNew}\n${huiLijst}`, 'utf-8')
    }    
    return true;
  }

  async rockAllowListCheck(event, title){
    let workingTitle = title || this.cleanupEventTitle(event.title);
    const tt = this.rockAllowList.includes(workingTitle);
    return {
      event,
      success: tt,
      workingTitle,
      reason: `${workingTitle} ${tt ? 'in' : 'NOT in'} allowed 🛴 list`,
    };
  }

  async rockRefuseListCheck(event, title){
    let workingTitle = title || this.cleanupEventTitle(event.title);
    const tt = this.rockRefuseList.includes(workingTitle);
    return {
      event,
      success: tt,
      workingTitle,
      reason: `${workingTitle} ${tt ? 'in' : 'NOT in'} refuse 🚮 list`,
    };
  }

  async metalEncyclopedia(event, title){

    let workingTitle = title || this.cleanupEventTitle(event.title);

    const MetalEncFriendlyTitle = workingTitle.replace(/\s/g, "_");
    const metalEncUrl = `https://www.metal-archives.com/search/ajax-band-search/?field=name&query=${MetalEncFriendlyTitle}`;
    const foundInMetalEncyclopedia = await fetch(metalEncUrl)
      .then((result) => result.json())
      .then((parsedJson) => {
        if (parsedJson.iTotalRecords < 1) return false
        const bandNamesAreMainTitle = parsedJson.aaData.some(bandData => {
          let match;
          try {
            match = bandData[0].match(/>(.*)<\//);
            if (Array.isArray(match) && match.length > 1){
              return match[1].toLowerCase() === workingTitle;
            } 
          } catch (error) {
            return false
          }
          return false;
        });
        return bandNamesAreMainTitle
      }).catch(metalEncError => {
        _t.wrappedHandleError(new ErrorWrapper({
          error: metalEncError,
          remarks: `<a href='${event?.venueEventUrl}' class='error-link get-page-info-timeout'>singlePage ${workerData.name} metal enc. error</a>`,
          workerData,
          errorLevel: 'notice',
        }
        ))
        return {
          event,
          success: false,
          url: metalEncUrl,
          workingTitle,
          reason: metalEncError.message
        };
      });
    if (foundInMetalEncyclopedia) {
      return {
        event,
        success: true,
        workingTitle,
        url: metalEncUrl,
        reason: `found in <a class='single-event-check-reason metal-encyclopedie metal-encyclopedie--success' href='${metalEncUrl}'>metal encyclopedia</a>`
      };
    }
    return {
      success: false,
      url: metalEncUrl,
      workingTitle,
      reason: 'no result metal enc',
      event
    };
  }

  async wikipedia(event, title){

    let workingTitle = title || this.cleanupEventTitle(event.title);

    const page = await this.browser.newPage();
    let wikiPage
    try {
      const wikifiedTitled = workingTitle.split(' ')
        .filter(a => a)
        .map(word => {
          return word[0].toUpperCase() + word.substring(1,word.length)
        }).join('_').replace(/\W/g,'')
      wikiPage = `https://en.wikipedia.org/wiki/${wikifiedTitled}`;
      await page.goto(wikiPage);
    } catch (error) {
      _t.wrappedHandleError(new ErrorWrapper({
        error,
        remarks: `<a href='${event?.venueEventUrl}' class='error-link get-page-info-timeout'>wikititel maken fout ${workerData.name}</a> ${workingTitle}`,
        workerData,
        errorLevel: 'notice',
      }
      ))            
    }

    const pageDoesNotExist = await page.evaluate(()=>{
      return document.getElementById('noarticletext');
    });

    if (pageDoesNotExist){
      const searchPage =  await page.evaluate(()=>{
        return document.getElementById('noarticletext').querySelector('[href*=search]')?.href ?? '';
      })
      await page.goto(searchPage);
      if (!searchPage) {
        return {
          event,
          workingTitle,
          reason: 'wiki page not found, als no search page',
          success: false,
        }
      }
      const matchingResults = await page.evaluate(({title})=>{
        return Array.from(document.querySelectorAll('.mw-search-results [href*=wiki]'))
          .filter(anker => anker.textContent.toLowerCase().includes(title.toLowerCase()))
          .map(anker => anker.href)
      }, {title})
      if (!matchingResults || !Array.isArray(matchingResults) || !matchingResults.length) {
        return {
          event,
          workingTitle,
          reason: 'Not found title of event on wiki search page',
          success: false,
        }
      }
      await page.goto(matchingResults[0])
    }

    const wikiRockt = await page.evaluate(({wikipediaGoodGenres}) => {

      let found = false
      let i = 0;
      while (found === false && i < wikipediaGoodGenres.length){
        const thisSelector = wikipediaGoodGenres[i];
        if (document.querySelector(`.infobox ${thisSelector}`)) {
          found = true;
        }
        i++;
      }
      return found;

    }, {wikipediaGoodGenres: AbstractScraper.wikipediaGoodGenres});
    !page.isClosed() && page.close();
    if (wikiRockt) {
      return {
        event,
        workingTitle,
        success: true,
        url: wikiPage,
        reason: `found on <a class='single-event-check-reason wikipedia wikipedia--success' href='${wikiPage}'>wikipedia</a>`
      };
    }  
    !page.isClosed() && page.close();
    return {
      event,
      workingTitle,
      success: false,
      reason: `wiki catch return`      
    }
  } 
  /**
   * methode waarmee singleRawEventCheck vervangen kan worden.
   * kijkt naar 'voornaamste titel', dwz de event.title tot aan een '&'.
   *
   * @param {*} event
   * @return {event: MusicEvent, success: boolean}
   * @memberof AbstractScraper
   */
  async isRock(event, overloadTitles = null, recursiveTitle = null) {

    let workingTitle = recursiveTitle || this.cleanupEventTitle(event.title);

    const metalEncyclopediaRes = await this.metalEncyclopedia(event, workingTitle);
    if (metalEncyclopediaRes.success) {
      return metalEncyclopediaRes;
    }

    const wikipediaRes = await this.wikipedia(event, workingTitle);
    if (wikipediaRes.success) {
      return wikipediaRes;
    }

    if (Array.isArray(overloadTitles)){
      const overloadTitlesCopy = [...overloadTitles];
      const thisOverloadTitle = overloadTitlesCopy.shift();
      const extraRes = await this.isRock(event, null, thisOverloadTitle);
      if (extraRes.success) {
        return extraRes
      }
      if (overloadTitles.length){
        return await this.isRock(event, overloadTitlesCopy);
      }
    }

    return {
      event,
      workingTitle,
      success: false,
      reason: `<a class='single-event-check-reason wikipedia wikipedia--failure metal-encyclopedie metal-encyclopedie--failure' href='${wikipediaRes.url}'>wikipedia</a> + <a href='${metalEncyclopediaRes.url}'>metal encyclopedia</a> 👎`};
  }

  cleanupEventTitle(workingTitle = ''){
    try {
    
      if (workingTitle.match(/\s?-\s?\d\d:\d\d/)){
        workingTitle = workingTitle.replace(/\s?-\s?\d\d:\d\d/, '');
      }
    
      if (workingTitle.includes('&')) {
        workingTitle = workingTitle.replace(/&.*$/,'');
      }

      if (workingTitle.includes('|')) {
        workingTitle = workingTitle.replace(/|.*$/,'');
      }

      if (workingTitle.includes('•')) {
        workingTitle = workingTitle.replace(/•.*$/,'');
      }

      if (workingTitle.includes('+')) {
        workingTitle = workingTitle.replace(/\+.*$/,'');
      }    

      if (workingTitle.includes(':')) {
        workingTitle = workingTitle.replace(/^[\w\s]+:/,'');
      }
    } catch (error) {
      _t.wrappedHandleError(new ErrorWrapper({
        error,
        workerData,
        remarks: `fout schoonmaken titel`,
        errorLevel: 'notice',
      }));
      return 'TITEL SCHOONMAKEN MISLUKT';
    }
    
    return workingTitle.toLowerCase().trim()
  }
  *eventGenerator(events) {
    while (events.length) {
      yield events.shift();
    }
  }
  //#endregion                                                 ASYNC CHECKERS

  //#region [rgba(120, 0, 120, 0.30)]                          PRICE

  async getPriceFromHTML({page, event, pageInfo, selectors}) {

    let priceRes = {
      price: null,
      errors: [],
    };
    const workingEventObj = {...event, ...pageInfo};
    const pi = workingEventObj.pageInfo + '';

    if (!page || !workingEventObj || !selectors.length){
      priceRes.errors.push({
        remarks: `geen page, workingEventObj, selectors`
      })
      this.debugPrice && this.dirtyTalk(`price €${priceRes.price} ${workingEventObj.title + ''}`)      
      return priceRes;
    }
    
    const selectorsCopy = [...selectors];
    const firstSelector = selectorsCopy.shift();

    const testText = await page.evaluate((selector)=>{
      if (!document.querySelector(selector)) return false;
      return Array.from(document.querySelectorAll(selector)).map(el=>el?.textContent).join('');
      
    },firstSelector)

    if (!testText && selectorsCopy.length){
      return await this.getPriceFromHTML({page, event, pageInfo, selectors:selectorsCopy})
    }

    if (!testText) {
      if(testText === false) {
        if (workingEventObj.soldOut){
          priceRes.price = 0;
          if (this.debugPrice) priceRes.errors.push({remarks: `uitverkocht. vergeef geen price ${pi}`});
        } else {
          priceRes.errors.push({remarks: `geen el in ${firstSelector} ${pi}`});
        }
      } else {
        priceRes.errors.push({remarks: `lege tc in ${firstSelector} ${pi}`});
      }
      return priceRes
    } 

    if (testText.match(/start/i)) {
      priceRes.price = null;
      this.debugPrice && this.dirtyDebug({
        title: workingEventObj.title + '',
        price:priceRes.price,
        type: 'NOG ONBEKEND',
      })      
      return priceRes
    }

    if (testText.match(/gratis|free/i)) {
      priceRes.price = 0;
      this.debugPrice && this.dirtyDebug({
        title: workingEventObj.title + '',
        price:priceRes.price,
        type: 'GRATIS',
      })      
      return priceRes
    }

    const priceMatch = testText
      .replaceAll(/[\s\r\t ]/g,'')
      .match(/(?<euros>\d+)(?<scheiding>[,.]?)(?<centen>\d\d|-)/);

    const priceMatchEuros = testText
      .replaceAll(/[\s\r\t ]/g,'')
      .match(/\d+/);

    if (!Array.isArray(priceMatch) && !Array.isArray(priceMatchEuros)) {
      if (selectorsCopy.length){
        return await this.getPriceFromHTML({page, event,pageInfo, selectors:selectorsCopy})
      } else {
        if (testText.match(/uitverkocht|sold\sout/i)) {
          priceRes.price = null;
          this.debugPrice && this.dirtyDebug({
            title: workingEventObj.title + '',
            price: priceRes.price,
            type: 'UITVERKOCHT',
          })      
          return priceRes
        } else {
          priceRes.errors.push({
            remarks: `geen match met ${firstSelector} ${pi}`, 
            toDebug: {testText, priceMatch}
          });
          return priceRes
        }
      }
    }

    if (!Array.isArray(priceMatch) && Array.isArray(priceMatchEuros)){
      priceRes.price = Number(priceMatchEuros[0]);
      this.checkIsNumber(priceRes, pi)
      this.debugPrice && this.dirtyDebug({
        title: workingEventObj.title + '',
        price:priceRes.price,
      })      
      return priceRes;
    }

    if (priceMatch.groups?.centen && priceMatch.groups?.centen.includes('-')){
      priceMatch.groups.centen = '00';
    }

    try {
      if (priceMatch.groups.scheiding){
        if (priceMatch.groups.euros && priceMatch.groups.centen){
          priceRes.price = (Number(priceMatch.groups.euros) * 100 + Number(priceMatch.groups.centen)) / 100;
        }
        if (priceMatch.groups.euros){
          priceRes.price = Number(priceMatch.groups.euros)
        }
      } else {
        priceRes.price = Number(priceMatch.groups.euros)
      }
      this.checkIsNumber(priceRes, pi)
      this.debugPrice && this.dirtyDebug({
        title: workingEventObj.title + '',
        price: priceRes.price
      })      
      return priceRes;

    } catch (priceCalcErr) {

      if (selectorsCopy.length) {
        return await this.getPriceFromHTML({page, event,pageInfo, selectors:selectorsCopy})
      } else {

        if (testText.match(/uitverkocht|sold\sout/i)) {
          priceRes.price = null;
          this.debugPrice && this.dirtyDebug({
            title: workingEventObj.title + '',
            price: priceRes.price,
            type: 'UITVERKOCHT',
          })      
          return priceRes
        } else{
          priceRes.push({
            error: priceCalcErr,
            remarks: `price calc err ${pi}`, 
            toDebug: {testText, priceMatch, priceRes}
          });
          return priceRes          
        }

 
      }
    }
  
    return priceRes;

  }  

  checkIsNumber(priceRes, pi){
    if (isNaN(priceRes.price)){
      priceRes.errors.push({
        remarks: `NaN: ${priceRes.price} ${pi}`, 
      });
      return false;
    }
    return true;
  }
  //#endregion                                                 PRICE  

  //#region [rgba(150, 0, 150, 0.30)]                          LONG HTML  
  writeLongTextHTML(mergedEvent) {
    if (!mergedEvent) return null;
    let uuid = crypto.randomUUID();
    const toPrint = makeLongHTML(mergedEvent)
 
    try {
      const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;
      fs.writeFileSync(longTextPath, toPrint, "utf-8");
      return longTextPath;
    } catch (err) {
      _t.handleError(err, workerData, `write long text fail`, 'notice', {
        path: `${fsDirections.publicTexts}/${uuid}.html`,
        text: toPrint
      });
    }
    return '';
  }
  //#endregion                                                 LONG HTML

  //#region [rgba(180, 0, 180, 0.30)]                          IMAGE    

  async emptyImageFolder(){

    const location = workerData.family;

    if (fs.existsSync(`${this.eventImagesFolder}/${location}`)){
      fs.rmSync(`${this.eventImagesFolder}/${location}`, { recursive: true, force: true });
    } 
    fs.mkdirSync(`${this.eventImagesFolder}/${location}`)
    return true;
       
  }

  async getImage({page, event, pageInfo, selectors, mode}){
    
    const res = {
      errors: []
    }
    const title = event?.title ? event?.title : pageInfo.title 
    const pi = pageInfo?.pageInfo ? pageInfo?.pageInfo : event?.pageInfo
    let image = null
    let selectorsCopy = [...selectors];
    if (mode === 'image-src'){
      while (!image && selectorsCopy.length > 0){
        const selector = selectorsCopy.shift();
        image = await page.evaluate(({selector})=>{
          const el = document.querySelector(selector);
          let src = null;
          if (!el?.src && el?.hasAttribute('data-src')) {
            src = el.getAttribute('data-src');
          } else if (!el?.src && el?.hasAttribute('srcset')){
            src = el.getAttribute('srcset').split(/\s/)[0];
          } else {
            src = el?.src ?? null
          }

          if (!src.includes('https')){
            src = document.location.protocol + '//' + document.location.hostname + src
          }
          
          return src;
        }, {selector})
      }
    } else if (mode === 'background-src'){
      while (!image && selectorsCopy.length > 0){
        const selector = selectorsCopy.shift();
        image = await page.evaluate(({selector})=>{
          const mmm = document.querySelector(selector)?.style.backgroundImage.match(/https.*.jpg|https.*.jpeg|https.*.png|https.*.webp/) ?? null;
          if (!Array.isArray(mmm)) return null;
          let src= mmm[0]
          if (!src.includes('https')){
            src = document.location.protocol + '//' + document.location.hostname + src
          }
          return src;
        }, {selector})
      }
    } else if (mode === 'weird-attr'){
      while (!image && selectorsCopy.length > 0){
        const selector = selectorsCopy.shift();
        image = await page.evaluate(({selector})=>{
          const el = document.querySelector(selector);
          let src = null;
          if (!el?.href && el?.hasAttribute('content')) {
            src = el.getAttribute('content');
          } else {
            src = el?.href ?? null
          }

          if (!src.includes('https')){
            src = document.location.protocol + '//' + document.location.hostname + src
          }
          
          return src;
        }, {selector})
      }
    }
    
    if (!image){
      res.errors.push({
        remarks: `image missing ${pi}`
      })
      return res;
    }

    const imageCrypto = crypto.randomUUID();
    const imagePath = `${this.eventImagesFolder}/${workerData.family}/${imageCrypto}`;
    this.downloadImageCompress(event, image, imagePath)

    res.image = imagePath;
    return res;

  }

  async downloadImageCompress(event, image, imagePath){

    if (!fs.existsSync(`${this.eventImagesFolder}/${workerData.family}`)){
      fs.mkdirSync(`${this.eventImagesFolder}/${workerData.family}`)
    }
    https.get(image, (res)=>{
      res.pipe(
        sharp()
          .resize(440, 225)
          .webp()
      ).pipe(fs.createWriteStream(`${imagePath}-w440.webp`))
      res.pipe(
        sharp()
          .resize(750, 360)
          .webp()
      ).pipe(fs.createWriteStream(`${imagePath}-w750.webp`))
      res.pipe(
        sharp()
          .webp()
      ).pipe(fs.createWriteStream(`${imagePath}-vol.webp`))
      ;
    })
  }

  //#endregion                                                 IMAGE


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
      `outer catch scrape ${workerData.family}`,
      'close-thread',
      null
    );
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
      if (pm?.type === "process" && pm?.subtype === "command-die") {
        this.scrapeDie(pm?.messageData).catch(this.handleOuterScrapeCatch);
      }      
    });
  }
}

