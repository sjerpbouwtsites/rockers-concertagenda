/* global document */
// #region                                                 IMPORTS
import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
// eslint-disable-next-line import/no-extraneous-dependencies
import puppeteer from 'puppeteer';
import { QuickWorkerMessage } from '../../mods/rock-worker.js';
import fsDirections from '../../mods/fs-directions.js';
import * as _t from '../../mods/tools.js';
import EventsList from '../../mods/events-list.js';
import MusicEvent from '../../mods/music-event.js';
import getVenueMonths from '../../mods/months.js';
import ErrorWrapper from '../../mods/error-wrapper.js';
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
  // #endregion                                                DIRTYLOG, TALK, DEBUG

  // #region [rgba(0, 0, 240, 0.10)]                            SCRAPE INIT & SCRAPE DIE
  async scrapeInit() {
    if (!this._s.app.mainPage.useCustomScraper || !this._s.app.singlePage.useCustomScraper) {
      this.browser = await puppeteer.launch({});
    } else {
      this.browser = 'disabled';
    }

    const baseMusicEvents = await this.mainPage().catch(this.handleOuterScrapeCatch);
    this.dirtyLog(baseMusicEvents, `baseMusicEvents`);

    if (!baseMusicEvents) return false;
    const checkedEvents = await this.announceAndCheck(baseMusicEvents).catch(
      this.handleOuterScrapeCatch,
    );
    this.dirtyLog(checkedEvents, `checkedEvents`);
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
    this.dirtyTalk('DIEING!');
    await this.closeBrowser();
    await this.saveEvents();
    await this.announceToMonitorDone();
    this.dirtyTalk('DEAD');
    await _t.waitTime(50);
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
      const err = new Error(`No data in saveBaseEventList ${key}`);
      _t.wrappedHandleError(
        new ErrorWrapper({
          error: err,
          remarks: 'saveBaseEventList',
          errorLevel: 'close-thread',
          workerData,
          // toDebug: {
          //   //
          // }
        }),
      );
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
    // @TODO 3 stopfuncties maken: 1 base events; 1 single; 1 totaal.

    const stopFunctie = setTimeout(() => {
      _t.wrappedHandleError(
        new ErrorWrapper({
          error: new Error('Timeout baseEvent'),
          remarks: `baseEvent ${workerData.name} overtijd. Max: ${this._s.mainPage.timeout}`,
          workerData,
          errorLevel: 'close-thread',
        }),
      );
    }, this._s.mainPage.timeout);

    if (this._s.app.mainPage.useCustomScraper) {
      parentPort.postMessage(this.qwm.messageRoll('customScraper'));
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
   * @return {MusicEvent[]}
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
        event.longTextHTML = _t.killWhitespaceExcess(event.longTextHTML);
      }
      if (event.shortText) {
        // eslint-disable-next-line no-param-reassign
        event.shortText = _t.killWhitespaceExcess(event.shortText);
      }
      return event;
    });

    eventsWithLongHTMLShortText.forEach((event) => {
      const errorVerz = Object.prototype.hasOwnProperty.call(event, 'errors') ? event.errors : [];
      errorVerz.forEach((errorData) => {
        const refE = new Error();
        const wrappedError = new ErrorWrapper({
          // eslint-disable-next-line no-nested-ternary
          message: (errorData?.message ?? null) ? errorData.message : (errorData?.remarks ?? null) ? errorData.remarks : 'geen message',
          stack: errorData?.stack ?? refE.stack,
          remarks: errorData?.remarks ?? 'geen remarks',
          workerData,
        });
        _t.wrappedHandleError(wrappedError);
      });
    });

    this.dirtyLog(rawEvents, `mainPageEnd1`);
    const r = rawEvents.map((rawEvent) => ({
      ...rawEvent,
      location: workerData.family,
      origin: workerData.family,
    }));
    this.dirtyLog(r, `mainPageEnd2`);
    if (this._s.app.mainPage.enforceMusicEventType) {
      return r.map((event) => new MusicEvent(event));
    }
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
   * @param {MusicEvent} musicEvent
   * @return {boolean}
   * @memberof AbstractScraper
   */
  isMusicEventCorruptedMapper = (musicEvent) => {
    const s = this._s;
    this.dirtyLog(s);
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
    return this.rawEventsAsyncCheck({
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

      generatedEvent = eventGen.next();
      if (generatedEvent.done) return useableEventsCheckedArray;

      const eventToCheck = generatedEvent.value;
      const checkResult = await this.mainPageAsyncCheck(eventToCheck);
      const workingTitle = checkResult.workingTitle || this.cleanupEventTitle(eventToCheck.title);
      if (checkResult.success) {
        useableEventsCheckedArray.push(eventToCheck);

        if (debugSettings.debugRawEventAsyncCheck && checkResult.reason) {
          parentPort.postMessage(
            this.qwm.debugger({
              title: 'Raw event async check',
              event: `<a class='single-event-check-notice single-event-check-notice--success' href='${eventToCheck.venueEventUrl}'>${workingTitle}<a/>`,
              reason: checkResult.reason,
            }),
          );
        }
      } else if (debugSettings.debugRawEventAsyncCheck) {
        parentPort.postMessage(
          this.qwm.debugger({
            title: 'Raw event async check',
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
      _t.handleError(
        error,
        workerData,
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
   * @param {MusicEvent} event om te controleren
   * @return {event {MusicEvent, success bool}}
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

    // als single event nog music event moet worden.
    if (!(singleEvent instanceof MusicEvent)) {
      singleEvent = new MusicEvent(singleEvent);
    }

    // samenvoegen & naar EventsList sturen
    singleEvent.merge(pageInfo);

    // titel / shortext postfix
    singleEvent = this.titelShorttextPostfix(singleEvent);

    // check op properties vanuit single page
    singleEvent = this.isMusicEventCorruptedMapper(singleEvent);

    if (singleEvent.corrupted || singleEvent.unavailable) {
      singleEvent.registerINVALID(this.workerData);
      if (singleEvent.corrupted) {
        this.dirtyDebug({
          title: `💀 ${singleEvent.corrupted}`,
          event: `<a class='single-event-check-notice single-event-check-notice--failure' href='${singleEvent.venueEventUrl}'>${singleEvent.title}</a> Corr.`,
        });
      }
      if (singleEvent.unavailable) {
        this.dirtyDebug({
          title: `😣 ${singleEvent.unavailable}`,
          event: `<a class='single-event-check-notice single-event-check-notice--failure' href='${singleEvent.venueEventUrl}'>${singleEvent.title}</a> Unav.`,
        });
      }

      if (singleEventPage && !singleEventPage.isClosed()) {
        await singleEventPage.close();
      }

      return useableEventsList.length
        ? this.processSingleMusicEvent(useableEventsList)
        : useableEventsList;
    }

    singleEvent.longText = this.writeLongTextHTML(singleEvent);

    // this.dirtyLog(singleEvent, `singleEventBeforeMergedCheck`);

    const mergedEventCheckRes = await this.singlePageAsyncCheck(singleEvent, pageInfo);
    if (mergedEventCheckRes.success) {
      if (debugSettings.debugsinglePageAsyncCheck && mergedEventCheckRes.reason) {
        this.dirtyDebug({
          title: 'Merged async check 👍',
          event: `<a class='single-event-check-notice single-event-check-notice--success' href='${mergedEventCheckRes.event.venueEventUrl}'>${mergedEventCheckRes.event.title}</a>`,
          reason: mergedEventCheckRes.reason,
        });
      }

      // this.dirtyLog(singleEvent, `singleEventAfterMergedCheckSuccess`);
      
      let tryEnforceDate = false;
      try {
        tryEnforceDate = new Date(singleEvent.start).toISOString();
      } catch (error) { /* */ }

      if (tryEnforceDate && !singleEvent.unavailable && !singleEvent.corrupted) {
        const toRegister = {
          door: singleEvent.door,
          start: singleEvent.start,      
          end: singleEvent.end,      
          venueEventUrl: singleEvent.venueEventUrl,      
          title: singleEvent.title,      
          location: singleEvent.location,      
          price: singleEvent.price,      
          shortText: singleEvent.shortText,      
          longText: singleEvent.longText,      
          image: singleEvent.image,      
          soldOut: singleEvent.soldOut,      
          unavailable: singleEvent.unavailable,
          corrupted: singleEvent.corrupted,
          // ...workerData,
        };

        EventsList.addEvent(toRegister);
      } else {
        this.dirtyDebug('invalid maar geen register invalid');
      }
    } else {
      if (debugSettings.debugsinglePageAsyncCheck && mergedEventCheckRes.reason) {
        this.dirtyDebug({
          title: 'Merged async check 👎',
          event: `<a class='single-event-check-notice single-event-check-notice--failure' href='${mergedEventCheckRes.event.venueEventUrl}'>${mergedEventCheckRes.event.title}</a>`,
          reason: mergedEventCheckRes.reason,
        });
      }
      singleEvent.registerINVALID(this.workerData);
    }

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
        _t.handleError(
          error,
          workerData,
          `Mislukken aanmaken <a class='single-page-failure error-link' href='${url}'>single pagina</a>`,
          'notice',
          url,
        );
      }

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
      _t.wrappedHandleError(
        new ErrorWrapper({
          error: new Error('Timeout baseEvent'),
          remarks: `<a href='${event?.venueEventUrl}' class='error-link get-page-info-timeout'>singlePage ${workerData.name} overtijd</a>.\nMax: ${this._s.singlePage.timeout}`,
          workerData,
          errorLevel: 'notice',
        }),
      );
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
      const wrappedError = new ErrorWrapper({
        error: new Error('pageInfo object incompleet; geen errors'),
        remarks: 'pageInfo object incompleet; geen errors',
        workerData,
        errorLevel: 'notice',
        toDebug: {
          title: 'failed page info',
          pageInfoData: pageInfo,
        },
      });
      _t.wrappedHandleError(wrappedError);

      if (page && !page.isClosed()) page.close();
      clearTimeout(stopFunctie);
      return {
        corrupted: 'Geen resultaat van pageInfo',
      };
    }

    pageInfo?.errors?.forEach((errorData) => {
      _t.handleError(
        errorData?.error ?? (new Error('geen error')), 
        errorData?.workerData ?? null, 
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
   * @param {MusicEvent} event om te controleren
   * @return {event {MusicEvent, success bool}}
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
    const workingTitle = this.cleanupEventTitle(event.title);
    if (hasGoodTerm) {
      return {
        workingTitle,
        event,
        success: true,
        reason: `Goed in ${keysToCheck2.join('')}`,
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
    const workingTitle = this.cleanupEventTitle(event.title);
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
      workingTitle,
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
      workingTitle,
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
        _t.wrappedHandleError(
          new ErrorWrapper({
            error: metalEncError,
            remarks: `<a href='${event?.venueEventUrl}' class='error-link get-page-info-timeout'>singlePage ${workerData.name} metal enc. error</a>`,
            workerData,
            errorLevel: 'notice',
          }),
        );
        return {
          event,
          success: false,
          url: metalEncUrl,
          workingTitle,
          reason: metalEncError.message,
        };
      });
    if (foundInMetalEncyclopedia) {
      return {
        event,
        success: true,
        workingTitle,
        url: metalEncUrl,
        reason: `found in <a class='single-event-check-reason metal-encyclopedie metal-encyclopedie--success' href='${metalEncUrl}'>metal encyclopedia</a>`,
      };
    }
    return {
      success: false,
      url: metalEncUrl,
      workingTitle,
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
      _t.wrappedHandleError(
        new ErrorWrapper({
          error,
          remarks: `<a href='${event?.venueEventUrl}' class='error-link get-page-info-timeout'>wikititel maken fout ${workerData.name}</a> ${workingTitle}`,
          workerData,
          errorLevel: 'notice',
        }),
      );
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
          workingTitle,
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
          workingTitle,
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
        workingTitle,
        success: true,
        url: wikiPage,
        reason: `found on <a class='single-event-check-reason wikipedia wikipedia--success' href='${wikiPage}'>wikipedia</a>`,
      };
    }
    if (!page.isClosed()) page.close();
    return {
      event,
      workingTitle,
      success: false,
      reason: 'wiki catch return',
    };
  }

  /**
   * methode waarmee mainPageAsyncCheck vervangen kan worden.
   * kijkt naar 'voornaamste titel', dwz de event.title tot aan een '&'.
   *
   * @param {*} event
   * @return {event: MusicEvent, success: boolean}
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
      workingTitle,
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
      _t.wrappedHandleError(
        new ErrorWrapper({
          error,
          workerData,
          remarks: 'fout schoonmaken titel',
          errorLevel: 'notice',
        }),
      );
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
      _t.handleError(err, workerData, 'write long text fail', 'notice', {
        path: `${fsDirections.publicTexts}/${mergedEvent.location}/${base64String}.html`,
        text: toPrint,
      });
    }
    return '';
  }
  // #endregion                                                 LONG HTML

  // step 4
  async announceToMonitorDone() {
    parentPort.postMessage(this.qwm.workerDone(EventsList.amountOfEvents));
    return true;
  }

  // step 4.5
  async closeBrowser() {
    if (this.browser && Object.prototype.hasOwnProperty.call(this.browser, 'close')) {
      this.browser.close();
    }
    return true;
  }

  handleOuterScrapeCatch(catchError) {
    _t.handleError(
      catchError,
      workerData,
      `outer catch scrape ${workerData.family}`,
      'close-thread',
      null,
    );
  }

  // step 6
  async saveEvents() {
    EventsList.save(workerData.family, workerData.index);
  }

  listenToMasterThread() {
    parentPort.on('message', (message) => {
      const pm = JSON.parse(message);
      if (pm?.type === 'process' && pm?.subtype === 'command-start') {
        this.scrapeInit(pm?.messageData).catch(this.handleOuterScrapeCatch);
      }
      if (pm?.type === 'process' && pm?.subtype === 'command-die') {
        this.scrapeDie(pm?.messageData).catch(this.handleOuterScrapeCatch);
      }
    });
  }
}
