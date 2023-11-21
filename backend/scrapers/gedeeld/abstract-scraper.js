/* global document */
// #region                                                 IMPORTS
import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
import puppeteer from 'puppeteer';
import fsDirections from '../../mods/fs-directions.js';
// eslint-disable-next-line import/no-extraneous-dependencies
import QuickWorkerMessage from "../../mods/quick-worker-message.js";
import getVenueMonths from '../../mods/months.js';
import makeLongHTML from './longHTML.js';
import WorkerStatus from '../../mods/WorkerStatus.js';
import ScraperConfig from './scraper-config.js';
import debugSettings from './debug-settings.js';
import terms from './terms.js';
import _getPriceFromHTML from './price.js';
import shell from '../../mods/shell.js';
// #endregion                                              IMPORTS

export default class AbstractScraper extends ScraperConfig {
  qwm;

  browser;

  completedMainPage = false;

  workingOnSinglePages = false;

  rockAllowList = '';

  rockRefuseList = '';

  rockAllowListNew = '';

  rockRefuseListNew = '';

  eventImagesFolder = fsDirections.publicEventImages;

  _events = [];

  _invalidEvents = [];

  lastDBAnswer = null;

  dbAnswered = false;

  skipFurtherChecks = [];

  // #region [rgba(0, 0, 120, 0.10)]                            CONSTRUCTOR & INSTALL
  constructor(obj) {
    super(obj);

    this.install();
  }

  install() {
    this.qwm = new QuickWorkerMessage(workerData);
    this.months = getVenueMonths(workerData.family);
    this.rockAllowList = fs.readFileSync(fsDirections.isRockAllow, 'utf-8');
    this.rockRefuseList = fs.readFileSync(fsDirections.isRockRefuse, 'utf-8');
  }
  // #endregion                                                CONSTRUCTOR & INSTALL

  async getPriceFromHTML({
    page, event, pageInfo, selectors,
  }) {
    return _getPriceFromHTML({
      _this: this, page, event, pageInfo, selectors, 
    });
  }

  // #region [rgba(0, 0, 180, 0.10)]                            DIRTYLOG, TALK, DEBUG
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

  talkToDB(messageForDB) {
    this.dbAnswered = false;
    parentPort.postMessage(JSON.stringify(messageForDB));
  }

  getAnswerFromDB(parsedMessageFromDB) {
    this.lastDBAnswer = parsedMessageFromDB;
    this.dbAnswered = true;
    return parsedMessageFromDB;
  }

  async checkDBhasAnswered() {
    if (this.dbAnswered) return true;
    await this.waitTime(5);
    return this.checkDBhasAnswered();
  }

  // #endregion                                                DIRTYLOG, TALK, DEBUG

  // #region [rgba(0, 0, 240, 0.10)]                            SCRAPE INIT & SCRAPE DIE
  async scrapeInit() {
    if (!this._s.app.mainPage.useCustomScraper || !this._s.app.singlePage.useCustomScraper) {
      this.browser = await puppeteer.launch(this._s.launchOptions);
    } else {
      this.browser = 'disabled';
    }
    
    const baseMusicEvents = await this.mainPage().catch(this.handleOuterScrapeCatch);
    
    if (!baseMusicEvents) {
      return false;
    }
    const checkedEvents = await this.announceAndCheck(baseMusicEvents).catch(
      this.handleOuterScrapeCatch,
    );
    
    this.completedMainPage = true;
    if (!checkedEvents) return false;
    await this.processSingleMusicEvent(checkedEvents).catch(this.handleOuterScrapeCatch);
    
    await this.saveRockRefusedAllowedToFile();
    
    await this.announceToMonitorDone();
    
    if (!this._s.app.mainPage.useCustomScraper || !this._s.app.singlePage.useCustomScraper) {
      await this.closeBrowser();
    }
    
    await this.saveEvents();
    
    return true;
    // overige catch in om init heen
  }

  async scrapeDie() {
    await this.closeBrowser();
    await this.saveEvents();
    await this.announceToMonitorDone();
    
    await this.waitTime(50);
    process.exit();
  }
  // #endregion                                                 SCRAPE INIT & SCRAPE DIE

  // #region [rgba(60, 0, 60, 0.10)]                            MAIN PAGE
  async mainPage() {
    throw Error('abstract method used thx ');
  }

  baseEventDate() {
    const ddd = new Date();
    const thisMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const thisDay = new Date().getDate().toString().padStart(2, '0');
    return `${ddd.getFullYear()}${thisMonth}${thisDay}`;
  }

  async checkBaseEventAvailable(searching) {
    const baseEventFiles = fs.readdirSync(fsDirections.baseEventlists);
    const theseBaseEvents = baseEventFiles.filter((filenames) => filenames.includes(searching));
    if (!theseBaseEvents || theseBaseEvents.length < 1) {
      return false;
    }
    const thisBaseEvent = theseBaseEvents[0];
    // 20231201
    const baseEventDate = thisBaseEvent.split('T')[1].split('.json')[0];
    const refDate = this.baseEventDate();
    if (refDate !== baseEventDate) {
      return false;
    }
    WorkerStatus.registerFamilyDoneWithBaseEvents(workerData.family);
    return JSON.parse(fs.readFileSync(`${fsDirections.baseEventlists}/${thisBaseEvent}`));
  }

  async saveBaseEventlist(key, data) {
    WorkerStatus.registerFamilyDoneWithBaseEvents(workerData.family);
    if (!data) {
      this.handleError(new Error(`No data in saveBaseEventList ${key}`), 'saveBaseEventList', 'close-thread');
      return false;
    }

    // verwijder oude
    const baseEventFiles = fs.readdirSync(fsDirections.baseEventlists);
    const theseBaseEvents = baseEventFiles.filter((filenames) => filenames.includes(key));
    if (theseBaseEvents && theseBaseEvents.length) {
      theseBaseEvents.forEach((file) => {
        fs.unlinkSync(`${fsDirections.baseEventlists}/${file}`);
      });
    }
    // sla nieuwe op
    const refDate = this.baseEventDate();
    const fileName = `${fsDirections.baseEventlists}/${key}T${refDate}.json`;
    fs.writeFileSync(fileName, JSON.stringify(data), 'utf8');
    return true;
  }

  /**
   * // stap 1.2
   * Initieert stopFunctie;
   * indien puppeteer niet uitgezet, initieert pagina & navigeert naar main
   * @returns {stopFunctie timeout, page puppeteer.Page}
   */
  async mainPageStart() {
    this.dirtyLog(debugSettings);

    // @TODO 3 stopfuncties maken: 1 base events; 1 single; 1 totaal.

    const stopFunctie = setTimeout(() => {
      this.handleError(new Error('Timeout baseEvent'), `baseEvent ${workerData.name} overtijd. Max: ${this._s.mainPage.timeout}`, 'close-thread');
    }, this._s.mainPage.timeout);

    if (this._s.app.mainPage.useCustomScraper) {
      return {
        stopFunctie,
        page: null,
      };
    }
    if (!this._s.mainPage.url) {
      this.dirtyDebug(this._s);
      throw new Error('geen app.mainPage.url ingesteld');
    }
    if (this._s.app.mainPage.useCustomScraper) {
      return { stopFunctie };
    }

    const page = await this.browser.newPage();
    await page.goto(this._s.mainPage.url, this._s.mainPage);

    return {
      stopFunctie,
      page,
    };
  }

  /**
   * beeindigt stopFunctie timeout
   * sluit page
   * verwerkt mogelijke witruimte weg
   * verwerkt fouten van raw make base events
   * haalt rawEvents door isMusicEventCorruptedMapper en returned
   *
   * @param {stopFunctie timeout, page Puppeteer.Page, rawEvents {}<>}
   * @memberof AbstractScraper
   */
  async mainPageEnd({ stopFunctie, page, rawEvents }) {
    if (shell.force && shell.force.includes(workerData.family)) {
      this.dirtyLog(rawEvents);
    }

    if (stopFunctie) {
      clearTimeout(stopFunctie);
    }

    if (page && !page.isClosed()) page.close();

    const eventsWithLongHTMLShortText = rawEvents.map((event) => {
      if (event.longTextHTML) {
        // eslint-disable-next-line no-param-reassign
        event.longTextHTML = event.longTextHTML.replace(/\t{2,100}/g, '').replace(/\n{2,100}/g, '\n').replace(/\s{2,100}/g, ' ').trim();
      }
      if (event.shortText) {
        // eslint-disable-next-line no-param-reassign
        event.shortText = event.shortText.replace(/\t{2,100}/g, '').replace(/\n{2,100}/g, '\n').replace(/\s{2,100}/g, ' ').trim();
      }
      return event;
    });
   
    const r = eventsWithLongHTMLShortText.map((rawEvent) => ({
      ...rawEvent,
      location: workerData.family,
      origin: workerData.family,
    }));
    
    return r;
  }

  // #endregion                                                MAIN PAGE

  // #region [rgba(120, 0, 120, 0.10)]                          MAIN PAGE CHECK AND ANNOUNCE
  /**
   * verifieert requiredProperties uit app.mainPage.requiredProperties
   * waarschuwt naar monitor wie uitvalt
   * controleert op verboden woorden zoals 'verplaatst' etc.
   *
   * // TODO maak aparte property 'check for afgelastetc'. Bij https://gebrdenobel.nl/programma/nazareth-14-dec-2022/
   * // bv staat 'afgelast' in de soort van titelbalk maar niet helemaal.
   *
   * @return {boolean}
   * @memberof AbstractScraper
   */
  isMusicEventCorruptedMapper = (musicEvent) => {
    const s = this._s;
    const requiredProperties = !this.completedMainPage
      ? s.app.mainPage?.requiredProperties
      : s.app.singlePage?.requiredProperties;

    const missingProperties = requiredProperties
      .map((property) => {
        if (property === 'price') {
          if (musicEvent?.price === null || musicEvent?.price === 'undefined') {
            return `<span class='corrupted-prop'>price: ${musicEvent?.price}</span>`;
          }
          return null;
        }
        if (property === 'start' || property === 'door' || property === 'end') {
          if (musicEvent[property]?.match(/\d\d\d\d-\d\d-\d\dT\d\d:\d\d/)) {
            return null;
          }
          return `<span class='corrupted-prop'>${property}: ${musicEvent[property]}</span>`;
        }
        if ([null, undefined].includes(musicEvent[property])) {
          return `<span class='corrupted-prop'>${property}: ${musicEvent[property]}</span>`;
        }
        return null;
      })
      .filter((a) => a);

    if (missingProperties.length > 0) {
      const page = !this.completedMainPage ? 'main:' : 'single:';
      const mis = missingProperties.join(', ');
      // eslint-disable-next-line no-param-reassign
      musicEvent.corrupted = `${page} ${mis}`;
    }

    return musicEvent;
  };

  // step 2
  /**
   * take base events announce and check
   * Kondigt begin taak aan aan monitor
   * Initeert de generator check op events
   *
   * @return {checkedEvents [events]}  Want geeft werk van rawEventsAsyncCheck door.
   * @memberof AbstractScraper
   *
   * checkedEvents
   */
  async announceAndCheck(baseMusicEvents) {
    parentPort.postMessage(this.qwm.workerStarted());
    return baseMusicEvents; // TODO was announce en check, nu alleen nog annoucne 
    // const eventGen = this.eventGenerator(baseMusicEvents);
    // const checkedEvents = [];
    // try {
    //   return this.rawEventsAsyncCheck({
    //     eventGen,
    //     checkedEvents,
    //   });
    // } catch (error) {
    //   this.handleError(error, 'check error in abstract scraper announce and check', 'close-thread', baseMusicEvents);      
    // }
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

      generatedEvent = eventGen.next();
      if (generatedEvent.done) return useableEventsCheckedArray;

      const eventToCheck = generatedEvent.value;
      const checkResult = await this.mainPageAsyncCheck(eventToCheck);
      const workingTitle = this.cleanupEventTitle(eventToCheck.title);

      if (!checkResult.reason) {
        this.dirtyLog(checkResult, 'geen reason meegegeven');
      }

      if (checkResult.success) {
        useableEventsCheckedArray.push(eventToCheck);

        if (debugSettings.debugRawEventAsyncCheck && checkResult.reason) {
          parentPort.postMessage(
            this.qwm.debugger({
              title: 'base check success',
              event: `<a class='single-event-check-notice single-event-check-notice--success' href='${eventToCheck.venueEventUrl}'>${workingTitle}<a/>`,
              reason: checkResult.reason,
            }),
          );
        }
      } else if (debugSettings.debugRawEventAsyncCheck) {
        parentPort.postMessage(
          this.qwm.debugger({
            title: 'base check fail',
            event: `<a class='single-event-check-notice single-event-check-notice--failure' href='${eventToCheck.venueEventUrl}'>${workingTitle}<a/>`,
            reason: checkResult.reason,
          }),
        );
      }

      return await this.rawEventsAsyncCheck({
        eventGen,
        checkedEvents: useableEventsCheckedArray,
      });
    } catch (error) {
      this.handleError(
        error,
        `rawEventsAsyncCheck faal met ${generatedEvent?.value?.title}`,
        'close-thread',
        {
          generatedEvent,
        },
      );
    }
    return true;
  }

  /**
   * abstracte methode, te overschrijve in de kindWorkers.
   *
   * @param event om te controleren
   * @return {event {singes, success bool}}
   * @memberof AbstractScraper
   */
  async mainPageAsyncCheck(event) {
    // abstracte methode, over te schrijven
    return {
      event,
      success: true,
      reason: null,
    };
  }

  // #endregion                                                 MAIN PAGE CHECK

  // #region [rgba(60, 0, 60, 0.10)]                            SINGLE PAGE
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
   * @memberof AbstractScraper
   */
  async processSingleMusicEvent(eventsList = []) {
    // verwerk events 1
    const useableEventsList = eventsList.map((a) => a);
    if (useableEventsList.length === 0) return useableEventsList;

    const singleEvent = useableEventsList.shift();

    parentPort.postMessage(this.qwm.todoNew(useableEventsList.length));

    // maak pagina
    let singleEventPage;
    if (!this._s.app.singlePage.useCustomScraper) {
      singleEventPage = await this.createSinglePage(singleEvent.venueEventUrl);
      if (!singleEventPage) {
        singleEvent.corrupted = 'niet gelukt page te maken';
        return useableEventsList.length
          ? this.processSingleMusicEvent(useableEventsList)
          : useableEventsList;
      }
    }

    // corruptie check afkomstig nog van baseEvent. niet door naar pageInfo
    if (singleEvent.corrupted) {
      // singleEvent.registerINVALID(); TODO register invalid
      parentPort.postMessage(
        this.qwm.messageRoll(
          `<a href='${singleEvent.venueEventUrl}'>😵 Corrupted ${singleEvent.title}</a> ${singleEvent.corrupted}`,
        ),
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

    // samenvoegen & naar EventsList sturen
    let mergedEvent = {
      ...singleEvent,
      ...pageInfo,
    };

    // titel / shortext postfix
    mergedEvent = this.titelShorttextPostfix(mergedEvent);

    // check op properties vanuit single page
    mergedEvent = this.isMusicEventCorruptedMapper(mergedEvent);

    if (mergedEvent.corrupted || mergedEvent.unavailable) {
      // mergedEvent.registerINVALID(this.workerData); TODO HERACTIVIEREN
      if (mergedEvent.corrupted) {
        this.dirtyDebug({
          title: `💀 ${mergedEvent.corrupted}`,
          event: `<a class='single-event-check-notice single-event-check-notice--failure' href='${mergedEvent.venueEventUrl}'>${mergedEvent.title}</a> Corr.`,
        });
      }
      if (mergedEvent.unavailable) {
        this.dirtyDebug({
          title: `😣 ${mergedEvent.unavailable}`,
          event: `<a class='single-event-check-notice single-event-check-notice--failure' href='${mergedEvent.venueEventUrl}'>${mergedEvent.title}</a> Unav.`,
        });
      }

      if (singleEventPage && !singleEventPage.isClosed()) {
        await singleEventPage.close();
      }

      return useableEventsList.length
        ? this.processSingleMusicEvent(useableEventsList)
        : useableEventsList;
    }

    mergedEvent.longText = this.writeLongTextHTML(mergedEvent);

    const mergedEventCheckRes = await this.singlePageAsyncCheck(mergedEvent, pageInfo);
    if (mergedEventCheckRes.success) {
      if (debugSettings.debugsinglePageAsyncCheck && mergedEventCheckRes.reason) {
        this.dirtyDebug({
          title: 'Merged async check 👍',
          event: `<a class='single-event-check-notice single-event-check-notice--success' href='${mergedEventCheckRes.event.venueEventUrl}'>${mergedEventCheckRes.event.title}</a>`,
          reason: mergedEventCheckRes.reason,
        });
      }

      let tryEnforceDate = false;
      try {
        tryEnforceDate = new Date(mergedEvent.start).toISOString();
      } catch (error) { /* */ }

      if (tryEnforceDate && !mergedEvent.unavailable && !mergedEvent.corrupted) {
        const toRegister = {
          door: mergedEvent.door,
          start: mergedEvent.start,      
          end: mergedEvent.end,      
          venueEventUrl: mergedEvent.venueEventUrl,      
          title: mergedEvent.title,      
          location: mergedEvent.location,      
          price: mergedEvent.price,      
          shortText: mergedEvent.shortText,      
          longText: mergedEvent.longText,      
          image: mergedEvent.image,      
          soldOut: mergedEvent.soldOut,      
          unavailable: mergedEvent.unavailable,
          corrupted: mergedEvent.corrupted,
          // ...workerData,
        };
        this._events.push(toRegister);
      } else {
        this.dirtyDebug('invalid maar geen register invalid');
      }
    } else if (debugSettings.debugsinglePageAsyncCheck && mergedEventCheckRes.reason) {
      this.dirtyDebug({
        title: 'Merged async check 👎',
        event: `<a class='single-event-check-notice single-event-check-notice--failure' href='${mergedEventCheckRes.event.venueEventUrl}'>${mergedEventCheckRes.event.title}</a>`,
        reason: mergedEventCheckRes.reason,
      });
    }
    const toRegister = {
      door: mergedEvent.door,
      start: mergedEvent.start,      
      end: mergedEvent.end,      
      venueEventUrl: mergedEvent.venueEventUrl,      
      title: mergedEvent.title,      
      location: mergedEvent.location,      
      price: mergedEvent.price,      
      shortText: mergedEvent.shortText,      
      longText: mergedEvent.longText,      
      image: mergedEvent.image,      
      soldOut: mergedEvent.soldOut,      
      unavailable: mergedEvent.unavailable,
      corrupted: mergedEvent.corrupted,
      // ...workerData,
    };
    this._invalidEvents.push(toRegister);

    if (singleEventPage && !singleEventPage.isClosed()) await singleEventPage.close();

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
        await page.goto(url, this.singlePage);
      } catch (error) {
        this.handleError(
          error,
          `Mislukken aanmaken <a class='single-page-failure error-link' href='${url}'>single pagina</a>`,
          'notice',
          url,
        );
      }

      return page;
    } catch (error) {
      this.handleError(
        error,
        `Mislukken aanmaken <a class='single-page-failure error-link' href='${url}'>single pagina</a> wss duurt te lang`,
        'notice',
        null,
      );
    }
    return null;
  }

  titelShorttextPostfix(musicEvent) {
    let { title, shortText } = musicEvent;
    
    const titleIsCapsArr = title.split('').map((char) => char === char.toUpperCase());
    const noOfCapsInTitle = titleIsCapsArr.filter((a) => a).length;
    const toManyCapsInTitle =
      (title.length - noOfCapsInTitle) / title.length < 0.5;
    if (toManyCapsInTitle) {
      // eslint-disable-next-line no-param-reassign
      title =
        title.substring(0, 1).toUpperCase() +
        title.substring(1, 500).toLowerCase();
    }

    if (title.length > 45) {
      const splittingCandidates = ['+', '&', ':', '>', '•'];
      let i = 0;
      do {
        const splitted = title.split(splittingCandidates[i]);
        title = splitted[0];
        const titleRest = splitted.splice(1, 45).join(' ');
        shortText = `${titleRest} ${shortText}`;
        i += 1;
      } while (title.length > 45 && i < splittingCandidates.length);
    }

    if (shortText) shortText = shortText.replace(/<\/?\w+>/g, '');

    return {
      ...musicEvent,
      title,
      shortText,
    };
  }

  // step 3.5
  async singlePage() {
    // abstract function singlePage
    throw Error('abstact function singlePage called');
  }

  /**
   * step 3.6
   * Vervangt generieke code aan begin singlePage
   * start stopFunctie op
   * @returns {timeout} stopFunctie
   * @memberof AbstractScraper
   */
  async singlePageStart(event) {
    const stopFunctie = setTimeout(() => {
      this.handleError(new Error('Timeout baseEvent in single page start'), `<a href='${event?.venueEventUrl}' class='error-link get-page-info-timeout'>singlePage ${workerData.name} overtijd</a>.\nMax: ${this._s.singlePage.timeout}`, 'close-thread');
    }, this._s.singlePage.timeout);
    return {
      stopFunctie,
    };
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
  async singlePageEnd({
    pageInfo, stopFunctie, page, event, 
  }) {
    if (this.isForced && debugSettings.debugPageInfo) {
      this.dirtyLog({
        event,
        pageInfo,
      });
    } 

    if (!pageInfo) {
      if (page && !page.isClosed()) page.close();
      throw new Error('page info ontbreekt.');
    }

    if (!Array.isArray(pageInfo?.errors)) {
      pageInfo.errors = [{
        error: new Error('pageInfo object incompleet; geen errors'),
        remarks: 'pageInfo object incompleet; geen errors',
        workerData,
        toDebug: {
          title: 'failed page info',
          pageInfoData: pageInfo,
        },        
      }];
    }

    pageInfo?.errors?.forEach((errorData) => {
      if (!(errorData?.error instanceof Error)) {
        const msg = errorData?.error.message || 'geen message in error';
        errorData.error = new Error(msg);
      }

      this.handleError(
        errorData.error, 
        errorData?.remarks ?? 'geen remarks', 
        errorData?.errorLevel ?? 'notice',
        errorData?.toDebug ?? null,
      );
    });

    if (page && !page.isClosed()) page.close();
    clearTimeout(stopFunctie);
    return pageInfo;
  }

  /**
   * abstracte methode, te overschrijve in de kindWorkers.
   *
   * @memberof AbstractScraper
   */
  async singlePageAsyncCheck(event) {
    // abstracte methode, over te schrijven
    return {
      event,
      success: true,
      reason: null,
    };
  }
  // #endregion                                                 SINGLE PAGE

  // #region [rgba(90, 0, 90, 0.10)]                            ASYNC CHECKERS

  /**
   * Loopt over terms.goodCategories en kijkt of ze in
   * een bepaalde text voorkomen, standaard bestaande uit de titel en de shorttext van
   * de event.
   *
   * @param {*} event
   * @param {string} [keysToCheck=['title', 'shortText']]
   * @return {event, {bool} succes, {string} reason}
   * @memberof AbstractScraper
   */
  async hasGoodTerms(event, keysToCheck) {
    const keysToCheck2 = keysToCheck || ['title', 'shortText'];
    let combinedTextToCheck = '';
    for (let i = 0; i < keysToCheck2.length; i += 1) {
      try {
        const v = event[keysToCheck2[i]];
        if (v) {
          combinedTextToCheck += v.toLowerCase();
        }
      } catch (error) {
        this.dirtyDebug(
          {
            fout: `fout maken controle text met keys, key${keysToCheck2[i]}`,
            toDebug: {
              event,
            },
          },
          'hasGoodTerms',
        );
      }
    }

    const hasGoodTerm = terms.goodCategories.find((goodTerm) =>
      combinedTextToCheck.includes(goodTerm),
    );

    if (hasGoodTerm) {
      return {
        event,
        success: true,
        reason: `Goed in ${keysToCheck2.join('')}`,
      };
    }

    return {
      event,
      success: false,
      reason: `Geen bevestiging gekregen uit ${keysToCheck2.join(';')} ${combinedTextToCheck}`,
    };
  }

  /**
   * Loopt over terms.forbiddenTerms en kijkt of ze in
   * een bepaalde text voorkomen, standaard bestaande uit de titel en de shorttext van
   * de event.
   *
   * @param {*} event
   * @param {string} [keysToCheck=['title', 'shortText']]
   * @return {event, {bool} succes, {string} reason}
   * @memberof AbstractScraper
   */
  async hasForbiddenTerms(event, keysToCheck) {
    const keysToCheck2 = Array.isArray(keysToCheck) ? keysToCheck : ['title', 'shortText'];
    let combinedTextToCheck = '';
    for (let i = 0; i < keysToCheck2.length; i += 1) {
      const v = event[keysToCheck2[i]];
      if (v) {
        combinedTextToCheck += `${v} `;
      }
    }
    combinedTextToCheck = combinedTextToCheck.toLowerCase();
    const hasForbiddenTerm = terms.forbidden.find((forbiddenTerm) =>
      combinedTextToCheck.includes(forbiddenTerm),
    );
    if (hasForbiddenTerm) {
      return {
        event,
        success: true,
        reason: `verboden genres gevonden in ${keysToCheck2.join('; ')}`,
      };
    }

    return {
      event,
      success: false,
      reason: `verboden genres niet gevonden in ${keysToCheck2.join('; ')}.`,
    };
  }

  saveRefusedTitle(title) {
    this.rockRefuseList = `${title}\n${this.rockRefuseList}`;
    this.rockRefuseListNew = `${title}\n${this.rockRefuseListNew}`;
  }

  saveAllowedTitle(title) {
    this.rockAllowList = `${title}\n${this.rockAllowList}`;
    this.rockAllowListNew = `${title}\n${this.rockAllowListNew}`;
  }

  async saveRockRefusedAllowedToFile() {
    if (this.rockAllowListNew) {
      const huiLijst = fs.readFileSync(fsDirections.isRockAllow, 'utf-8');
      fs.writeFileSync(fsDirections.isRockAllow, `${this.rockAllowListNew}\n${huiLijst}`, 'utf-8');
    }
    if (this.rockRefuseListNew) {
      const huiLijst = fs.readFileSync(fsDirections.isRockRefuse, 'utf-8');
      fs.writeFileSync(
        fsDirections.isRockRefuse,
        `${this.rockRefuseListNew}\n${huiLijst}`,
        'utf-8',
      );
    }
    return true;
  }

  async rockAllowListCheck(event, title) {
    const workingTitle = title || this.cleanupEventTitle(event.title);
    const workingTitleInRockAllowList = this.rockAllowList.includes(workingTitle);
    const fullTitleInRockAllowList = this.rockAllowList.includes(event.title);
    const success = workingTitleInRockAllowList || fullTitleInRockAllowList;
    return {
      event,
      success,
      reason: `${workingTitle} ${success ? 'in' : 'NOT in'} allowed 🛴 list`,
    };
  }

  async rockRefuseListCheck(event, title) {
    const workingTitle = title || this.cleanupEventTitle(event.title);
    const workingTitleInRockRefuseList = this.rockRefuseList.includes(workingTitle);
    const fullTitleInRockRefuseList = this.rockRefuseList.includes(event.title);
    const success = workingTitleInRockRefuseList || fullTitleInRockRefuseList;
    return {
      event,
      success,
      reason: `${workingTitle} ${success ? 'in' : 'NOT in'} refuse 🚮 list`,
    };
  }

  async metalEncyclopedia(event, title) {
    const workingTitle = title || this.cleanupEventTitle(event.title);

    const MetalEncFriendlyTitle = workingTitle.replace(/\s/g, '_');
    const metalEncUrl = `https://www.metal-archives.com/search/ajax-band-search/?field=name&query=${MetalEncFriendlyTitle}`;
    const foundInMetalEncyclopedia = await fetch(metalEncUrl)
      .then((result) => result.json())
      .then((parsedJson) => {
        if (parsedJson.iTotalRecords < 1) return false;
        const bandNamesAreMainTitle = parsedJson.aaData.some((bandData) => {
          let match;
          try {
            match = bandData[0].match(/>(.*)<\//);
            if (Array.isArray(match) && match.length > 1) {
              return match[1].toLowerCase() === workingTitle;
            }
          } catch (error) {
            return false;
          }
          return false;
        });
        return bandNamesAreMainTitle;
      })
      .catch((metalEncError) => {
        this.handleError(metalEncError, `<a href='${event?.venueEventUrl}' class='error-link get-page-info-timeout'>singlePage ${workerData.name} metal enc. error</a>`);
        return {
          event,
          success: false,
          url: metalEncUrl,
          reason: metalEncError.message,
        };
      });
    if (foundInMetalEncyclopedia) {
      return {
        event,
        success: true,
        url: metalEncUrl,
        reason: `found in <a class='single-event-check-reason metal-encyclopedie metal-encyclopedie--success' href='${metalEncUrl}'>metal encyclopedia</a>`,
      };
    }
    return {
      success: false,
      url: metalEncUrl,
      reason: 'no result metal enc',
      event,
    };
  }

  async wikipedia(event, title) {
    const workingTitle = title || this.cleanupEventTitle(event.title);

    const page = await this.browser.newPage();
    let wikiPage;
    try {
      const wikifiedTitled = workingTitle
        .split(' ')
        .filter((a) => a)
        .map((word) => word[0].toUpperCase() + word.substring(1, word.length))
        .join('_')
        .replace(/\W/g, '');
      wikiPage = `https://en.wikipedia.org/wiki/${wikifiedTitled}`;
      await page.goto(wikiPage);
    } catch (error) {
      this.handleError(error, `<a href='${event?.venueEventUrl}' class='error-link get-page-info-timeout'>wikititel maken fout ${workerData.name}</a> ${workingTitle}`);
    }

    const pageDoesNotExist = await page.evaluate(() => document.getElementById('noarticletext'));

    if (pageDoesNotExist) {
      const searchPage = await page.evaluate(
        () => document.getElementById('noarticletext').querySelector('[href*=search]')?.href ?? '',
      );
      await page.goto(searchPage);
      if (!searchPage) {
        return {
          event,
          reason: 'wiki page not found, als no search page',
          success: false,
        };
      }
      const matchingResults = await page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ title }) =>
          Array.from(document.querySelectorAll('.mw-search-results [href*=wiki]'))
            .filter((anker) => anker.textContent.toLowerCase().includes(title.toLowerCase()))
            .map((anker) => anker.href),
        { title },
      );
      if (!matchingResults || !Array.isArray(matchingResults) || !matchingResults.length) {
        return {
          event,
          reason: 'Not found title of event on wiki search page',
          success: false,
        };
      }
      await page.goto(matchingResults[0]);
    }

    const wikiRockt = await page.evaluate(
      ({ wikipediaGoodGenres }) => {
        let found = false;
        let i = 0;
        while (found === false && i < wikipediaGoodGenres.length) {
          const thisSelector = wikipediaGoodGenres[i];
          if (document.querySelector(`.infobox ${thisSelector}`)) {
            found = true;
          }
          i += 1;
        }
        return found;
      },
      { wikipediaGoodGenres: terms.wikipediaGoodGenres },
    );
    if (!page.isClosed()) page.close();
    if (wikiRockt) {
      return {
        event,
        success: true,
        url: wikiPage,
        reason: `found on <a class='single-event-check-reason wikipedia wikipedia--success' href='${wikiPage}'>wikipedia</a>`,
      };
    }
    if (!page.isClosed()) page.close();
    return {
      event,
      success: false,
      reason: 'wiki catch return',
    };
  }

  /**
   * methode waarmee mainPageAsyncCheck vervangen kan worden.
   * kijkt naar 'voornaamste titel', dwz de event.title tot aan een '&'.
   *
   * @param {*} event
   * @memberof AbstractScraper
   */
  async isRock(event, overloadTitles = null, recursiveTitle = null) {
    const workingTitle = recursiveTitle || this.cleanupEventTitle(event.title);

    const metalEncyclopediaRes = await this.metalEncyclopedia(event, workingTitle);
    if (metalEncyclopediaRes.success) {
      return metalEncyclopediaRes;
    }

    const wikipediaRes = await this.wikipedia(event, workingTitle);
    if (wikipediaRes.success) {
      return wikipediaRes;
    }

    if (Array.isArray(overloadTitles)) {
      const overloadTitlesCopy = [...overloadTitles];
      const thisOverloadTitle = overloadTitlesCopy.shift();
      const extraRes = await this.isRock(event, null, thisOverloadTitle);
      if (extraRes.success) {
        return extraRes;
      }
      if (overloadTitles.length) {
        return this.isRock(event, overloadTitlesCopy);
      }
    }

    return {
      event,
      success: false,
      reason: `<a class='single-event-check-reason wikipedia wikipedia--failure metal-encyclopedie metal-encyclopedie--failure' href='${wikipediaRes.url}'>wikipedia</a> + <a href='${metalEncyclopediaRes.url}'>metal encyclopedia</a> 👎`,
    };
  }

  cleanupEventTitle(workingTitle = '') {
    try {
      if (workingTitle.match(/\s?-\s?\d\d:\d\d/)) {
        // eslint-disable-next-line no-param-reassign
        workingTitle = workingTitle.replace(/\s?-\s?\d\d:\d\d/, '');
      }

      if (workingTitle.includes('&')) {
        // eslint-disable-next-line no-param-reassign
        workingTitle = workingTitle.replace(/&.*$/, '');
      }

      if (workingTitle.includes('|')) {
        // eslint-disable-next-line no-param-reassign
        workingTitle = workingTitle.replace(/|.*$/, '');
      }

      if (workingTitle.includes('•')) {
        // eslint-disable-next-line no-param-reassign
        workingTitle = workingTitle.replace(/•.*$/, '');
      }

      if (workingTitle.includes('+')) {
        // eslint-disable-next-line no-param-reassign
        workingTitle = workingTitle.replace(/\+.*$/, '');
      }

      if (workingTitle.includes(':')) {
        // eslint-disable-next-line no-param-reassign
        workingTitle = workingTitle.replace(/^[\w\s]+:/, '');
      }
    } catch (error) {
      this.handleError(error, 'fout schoonmaken titel');
      return 'TITEL SCHOONMAKEN MISLUKT';
    }

    return workingTitle.toLowerCase().trim();
  }

  * eventGenerator(events) {
    while (events.length) {
      yield events.shift();
    }
  }
  // #endregion                                                 ASYNC CHECKERS

  // #region [rgba(150, 0, 150, 0.10)]                          LONG HTML
  writeLongTextHTML(mergedEvent) {
    if (!mergedEvent) return null;
    const base64String = Buffer.from(
      mergedEvent.venueEventUrl.substring(
        mergedEvent.venueEventUrl.length - 30,
        mergedEvent.venueEventUrl.length,
      ),
    ).toString('base64');
    const toPrint = makeLongHTML(mergedEvent);
    
    if (!fs.existsSync(`${fsDirections.publicTexts}/${mergedEvent.location}/`)) {
      fs.mkdirSync(`${fsDirections.publicTexts}/${mergedEvent.location}/`);
    }
    
    try {
      const longTextPath = `${fsDirections.publicTexts}/${mergedEvent.location}/${base64String}.html`;
      fs.writeFileSync(longTextPath, toPrint, 'utf-8');

      return longTextPath;
    } catch (err) {
      this.handleError(err, 'write long text fail', 'notice', {
        path: `${fsDirections.publicTexts}/${mergedEvent.location}/${base64String}.html`,
        text: toPrint,
      });
    }
    return '';
  }
  // #endregion                                                 LONG HTML

  // step 4
  async announceToMonitorDone() {
    parentPort.postMessage(this.qwm.workerDone(this._events.length));
    return true;
  }

  // step 4.5
  async closeBrowser() {
    if (this.browser && Object.prototype.hasOwnProperty.call(this.browser, 'close')) {
      this.browser.close();
    }
    return true;
  }

  /**
 * handleError, generic error handling for all scrapers
 * passes a marked up error to the monitor
 * adds error to the errorLog in temp.
 * @param {Error} error
 * @param {string} remarks Add some remarks to help you find back the origin of the error.
 * @param {string} errorLevel notify, close-thread, close-app
 * @param {*} toDebug gaat naar debugger.
 */
  handleError(error, remarks = null, errorLevel = 'notify', toDebug = null) {
    // TODO link errors aan debugger
    const updateErrorMsg = {
      type: 'update',
      subtype: 'error',
      messageData: {
        workerData,
        remarks,
        status: 'error',
        errorLevel,
        text: `${error?.message}\n${error?.stack}\nlevel:${errorLevel}`,
      },
    }; 
    
    const clientsLogMsg = {
      type: 'clients-log',
      subtype: 'error',
      messageData: { error, workerData },
    };
    let debuggerMsg;
    if (toDebug) {
      debuggerMsg = {
        type: 'update',
        subtype: 'debugger',
        messageData: {
          workerData,
          debug: toDebug,
        },
      };
      debuggerMsg.messageData.workerName = workerData.name;
    }
    updateErrorMsg.messageData.workerName = workerData.name;
    clientsLogMsg.messageData.workerName = workerData.name;
    parentPort.postMessage(JSON.stringify(updateErrorMsg));
    parentPort.postMessage(JSON.stringify(clientsLogMsg));
    if (toDebug) parentPort.postMessage(JSON.stringify(debuggerMsg));
    if (debugSettings.debugWithTempFile) {
      const time = new Date();
      const curErrorLog = fs.readFileSync(fsDirections.errorLog) || '';
      const newErrorLog = `
      ${workerData?.name} Error - ${time.toLocaleTimeString()}
      ${error?.stack ?? 'geen stack'} 
      ${error?.message ?? 'geen message'}
      ${curErrorLog}`;
      fs.writeFileSync(fsDirections.errorLog, newErrorLog, 'utf-8');
    }
  }  

  async autoScroll(page) {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 500;
        const timer = setInterval(() => {
          const { scrollHeight } = document.body;
          // eslint-disable-next-line no-undef
          window.scrollBy(0, distance);
          totalHeight += distance;
  
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 150);
      });
    });
  }

  handleOuterScrapeCatch(catchError) {
    const updateErrorMsg = {
      type: 'update',
      subtype: 'error',
      messageData: {
        workerData,
        status: 'error',
        errorLevel: 'close-thread',
        text: `${catchError?.message}\n${catchError?.stack}\nlevel: close-thread`,
      },
    }; 

    parentPort.postMessage(updateErrorMsg);

    // this.handleError(
    //   catchError,
    //   `outer catch scrape ${workerData.family}`,
    //   'close-thread',
    //   null,
    // );
  }

  async waitTime(wait = 500) {
    return new Promise((res) => {
      setTimeout(res, wait);
    });
  }

  // step 6
  async saveEvents() {
    const pathToEventList = fsDirections.eventLists;
    const pathToINVALIDEventList = fsDirections.invalidEventLists;
    const inbetweenFix = workerData.index !== null ? `${workerData.index}` : '0';
    const pathToEventListFile = `${pathToEventList}/${workerData.family}/${inbetweenFix}.json`;
    const pathToINVALIDEventListFile = `${pathToINVALIDEventList}/${workerData.family}/invalid-${inbetweenFix}.json`;
    fs.writeFile(pathToEventListFile, JSON.stringify(this._events, null, '  '), () => {});
    fs.writeFile(
      pathToINVALIDEventListFile,
      JSON.stringify(this._invalidEvents, null, '  '),
      () => {},
    );
    
    return true;    
  }

  listenToMasterThread() {
    parentPort.on('message', (message) => {
      const pm = JSON.parse(message);
      if (pm?.type === 'db-answer') {
        this.getAnswerFromDB(pm.messageData);
      }      
      if (pm?.type === 'process' && pm?.subtype === 'command-start') {
        this.scrapeInit(pm?.messageData).catch(this.handleOuterScrapeCatch);
      }
      if (pm?.type === 'process' && pm?.subtype === 'command-die') {
        this.scrapeDie(pm?.messageData).catch(this.handleOuterScrapeCatch);
      }
    });
  }
}
