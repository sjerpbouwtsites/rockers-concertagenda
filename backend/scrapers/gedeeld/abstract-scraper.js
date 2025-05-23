/* global document */
// #region                                                 IMPORTS
import { parentPort, workerData } from "worker_threads";
import fs from "fs";
import puppeteer from "puppeteer";
import fsDirections from "../../mods/fs-directions.js";
// eslint-disable-next-line import/no-extraneous-dependencies
import QuickWorkerMessage from "../../mods/quick-worker-message.js";
import getVenueMonths from "../../mods/months.js";
import makeLongHTML from "./longHTML.js";
import WorkerStatus from "../../mods/WorkerStatus.js";
import ScraperConfig from "./scraper-config.js";
import debugSettings from "./debug-settings.js";
import _getPriceFromHTML from "./price.js";
import shell from "../../mods/shell.js";
import {
  asyncIsAllowedEvent,
  asyncIsRefused,
  asyncForbiddenTerms,
  asyncSaveAllowedEvent,
  asyncSaveRefused,
  asyncHarvestArtists,
  asyncScanEventForAllowedArtists,
  asyncSpotifyConfirmation,
  asyncGoodTerms,
  asyncExplicitEventCategories,
  asyncMetalEncyclopediaConfirmation,
  asyncHasAllowedArtist,
  asyncGoodCategoriesInLongHTML,
  asyncSuccess,
  asyncFailure,
} from "./artist-db-interface.js";
import DbInterFaceToScraper from "./db-interface-to-scraper.js";
import terms from "../../artist-db/store/terms.js";

// #endregion                                              IMPORTS

// DEZE FUNCTIES ZIJN BESCHIKBAAR VANUIT ARTIST-DB-INTERFACE MAAR WORDEN NU NOG NIET GEBRUIKT
// saveAllowedArtist: 'asyncSaveAllowedArtist',
// saveUnclearArtist: 'asyncSaveUnclearArtist',

export default class AbstractScraper extends ScraperConfig {
  // #region                              PROPERTIES
  qwm;

  browser;

  completedMainPage = false;

  workingOnSinglePages = false;

  rockAllowList = "";

  rockRefuseList = "";

  rockAllowListNew = "";

  rockRefuseListNew = "";

  eventImagesFolder = fsDirections.publicEventImages;

  _events = [];

  _invalidEvents = [];

  lastDBAnswer = null;

  dbAnswered = false;

  skipFurtherChecks = [];

  timesScrolled = 0;

  // #endregion                           PROPERTIES

  // #region                              CONSTR & INSTALL
  constructor(obj) {
    super(obj);
    this.install();
  }

  install() {
    this.qwm = new QuickWorkerMessage(workerData);
    this.months = getVenueMonths(workerData.family);

    this.asyncIsAllowedEvent = asyncIsAllowedEvent;
    this.asyncIsAllowedEvent.bind(this);

    this.asyncIsRefused = asyncIsRefused;
    this.asyncIsRefused.bind(this);

    this.asyncForbiddenTerms = asyncForbiddenTerms;
    this.asyncForbiddenTerms.bind(this);

    this.asyncSaveAllowedEvent = asyncSaveAllowedEvent;
    this.asyncSaveAllowedEvent.bind(this);

    this.asyncSaveRefused = asyncSaveRefused;
    this.asyncSaveRefused.bind(this);

    this.asyncScanEventForAllowedArtists = asyncScanEventForAllowedArtists;
    this.asyncScanEventForAllowedArtists.bind(this);

    this.asyncSpotifyConfirmation = asyncSpotifyConfirmation;
    this.asyncSpotifyConfirmation.bind(this);

    this.asyncGoodTerms = asyncGoodTerms;
    this.asyncGoodTerms.bind(this);

    this.asyncExplicitEventCategories = asyncExplicitEventCategories;
    this.asyncExplicitEventCategories.bind(this);

    this.asyncMetalEncyclopediaConfirmation =
      asyncMetalEncyclopediaConfirmation;
    this.asyncMetalEncyclopediaConfirmation.bind(this);

    this.asyncHasAllowedArtist = asyncHasAllowedArtist;
    this.asyncHasAllowedArtist.bind(this);

    this.asyncHarvestArtists = asyncHarvestArtists;
    this.asyncHarvestArtists.bind(this);

    this.asyncGoodCategoriesInLongHTML = asyncGoodCategoriesInLongHTML;
    this.asyncGoodCategoriesInLongHTML.bind(this);

    this.asyncSuccess = asyncSuccess;
    this.asyncSuccess.bind(this);

    this.asyncFailure = asyncFailure;
    this.asyncFailure.bind(this);
  }
  // #endregion                           CONSTR & INSTALL

  async getPriceFromHTML({ page, event, pageInfo, selectors }) {
    return _getPriceFromHTML({
      _this: this,
      page,
      event,
      pageInfo,
      selectors,
    });
  }

  // #region                             DIRTYLOG, TALK, DEBUG
  /**
   * Wrapper om parentPort.postMessage(qwm.toConsole(xx)) heen.
   *
   * @param {*} logSource wat dan ook.
   * @param {string} [key=null] hint voor in console.
   * @param {dir/log} dir of log
   * @memberof AbstractScraper
   */
  dirtyLog(logSource, key = null, type = "dir") {
    const logThis = key ? { [`${key}`]: logSource } : logSource;
    parentPort.postMessage(this.qwm.toConsole(logThis, type));
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
    if (this.dbAnswered) {
      this.dbAnswered = false;
      return this.lastDBAnswer;
    }
    await this.waitTime(10);
    return this.checkDBhasAnswered();
  }

  // #endregion                                                DIRTYLOG, TALK, DEBUG

  // #region                             SCRAPE INIT & SCRAPE DIE
  async scrapeInit() {
    if (
      !this._s.app.mainPage.useCustomScraper ||
      !this._s.app.singlePage.useCustomScraper
    ) {
      this.browser = await puppeteer.launch(this._s.launchOptions);
    } else {
      this.browser = "disabled";
    }

    const baseMusicEvents = await this.mainPage().catch(
      this.handleOuterScrapeCatch
    );

    if (debugSettings.debugBaseEvents) {
      this.dirtyLog(baseMusicEvents, "base Music Events", "log");
    }

    if (!baseMusicEvents) {
      return false;
    }
    const checkedEvents = await this.announceAndCheck(baseMusicEvents).catch(
      this.handleOuterScrapeCatch
    );

    this.completedMainPage = true;
    if (!checkedEvents) return false;
    await this.processSingleMusicEvent(checkedEvents).catch(
      this.handleOuterScrapeCatch
    );

    await this.announceToMonitorDone();

    if (
      !this._s.app.mainPage.useCustomScraper ||
      !this._s.app.singlePage.useCustomScraper
    ) {
      await this.closeBrowser();
    }

    await this.saveEvents();

    await this.debugScraperOutput();

    return true;
    // overige catch in om init heen
  }

  async scrapeDie() {
    await this.closeBrowser();
    await this.saveEvents();
    await this.announceToMonitorDone();

    await this.waitTime(25);
    process.exit();
  }
  // #endregion                                                 SCRAPE INIT & SCRAPE DIE

  // #region                             MAIN PAGE
  async mainPage() {
    throw Error("abstract method used thx ");
  }

  baseEventDate() {
    const ddd = new Date();
    const thisMonth = (new Date().getMonth() + 1).toString().padStart(2, "0");
    const thisDay = new Date().getDate().toString().padStart(2, "0");
    return `${ddd.getFullYear()}${thisMonth}${thisDay}`;
  }

  async checkBaseEventAvailable(searching) {
    const r = fs.readdirSync(fsDirections.baseEventlists);

    const baseEvent = r.find((bel) => bel.includes(searching));

    if (!baseEvent) return false;

    WorkerStatus.registerFamilyDoneWithBaseEvents(workerData.family);

    const baseEventList = fs.readFileSync(
      `${fsDirections.baseEventlists}/${baseEvent}`
    );
    return JSON.parse(baseEventList);
  }

  async saveBaseEventlist(key, data) {
    WorkerStatus.registerFamilyDoneWithBaseEvents(workerData.family);
    if (!data) {
      this.handleError(
        new Error(`No data in saveBaseEventList ${key}`),
        "saveBaseEventList",
        "close-thread"
      );
      return false;
    }

    // verwijder oude
    const baseEventFiles = fs.readdirSync(fsDirections.baseEventlists);
    const theseBaseEvents = baseEventFiles.filter((filenames) =>
      filenames.includes(key)
    );
    if (theseBaseEvents && theseBaseEvents.length) {
      theseBaseEvents.forEach((file) => {
        fs.existsSync(`${fsDirections.baseEventlists}/${file}`) &&
          fs.unlinkSync(`${fsDirections.baseEventlists}/${file}`);
      });
    }
    // sla nieuwe op
    const refDate = this.baseEventDate();
    const fileName = `${fsDirections.baseEventlists}/${key}T${refDate}.json`;
    fs.writeFileSync(fileName, JSON.stringify(data), "utf8");
    return true;
  }

  /**
   * // stap 1.2
   * Initieert stopFunctie;
   * indien puppeteer niet uitgezet, initieert pagina & navigeert naar main
   * @returns {stopFunctie timeout, page puppeteer.Page}
   */
  async mainPageStart() {
    if (debugSettings.debugDebug) this.dirtyLog(debugSettings);

    // @TODO 3 stopfuncties maken: 1 base events; 1 single; 1 totaal.

    const stopFunctie = setTimeout(() => {
      this.handleError(
        new Error("Timeout baseEvent"),
        `baseEvent ${workerData.name} overtijd. Max: ${this._s.mainPage.timeout}`,
        "close-thread"
      );
    }, this._s.mainPage.timeout);

    if (this._s.app.mainPage.useCustomScraper) {
      return {
        stopFunctie,
        page: null,
      };
    }
    if (!this._s.mainPage.url) {
      this.dirtyDebug(this._s);
      throw new Error("geen app.mainPage.url ingesteld");
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
    if (stopFunctie) {
      clearTimeout(stopFunctie);
    }

    if (page && !page.isClosed()) await page.close();

    const eventsWithLongHTMLShortText = rawEvents.map((event) => {
      if (event.longTextHTML) {
        // eslint-disable-next-line no-param-reassign
        event.longTextHTML = event.longTextHTML
          .replace(/\t{2,100}/g, "")
          .replace(/\n{2,100}/g, "\n")
          .replace(/\s{2,100}/g, " ")
          .trim();
      }
      if (event.shortText) {
        // eslint-disable-next-line no-param-reassign
        event.shortText = event.shortText
          .replace(/\t{2,100}/g, "")
          .replace(/\n{2,100}/g, "\n")
          .replace(/\s{2,100}/g, " ")
          .trim();
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

  // #region                           MAIN PAGE CHECK AND ANNOUNCE
  /**
   * verifieert requiredProperties uit app.mainPage.requiredProperties
   * waarschuwt naar monitor wie uitvalt
   * controleert op verboden woorden zoals 'verplaatst' etc.
   *
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
        if (property === "price") {
          if (musicEvent?.price === null || musicEvent?.price === "undefined") {
            return `<span class='corrupted-prop'>price: ${musicEvent?.price}</span>`;
          }
          return null;
        }
        if (property === "start" || property === "door" || property === "end") {
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
      const page = !this.completedMainPage ? "main:" : "single:";
      const mis = missingProperties.join(", ");
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
    const eventGen = this.eventGenerator(baseMusicEvents);
    const checkedEvents = [];
    try {
      return this.rawEventsAsyncCheck({
        eventGen,
        checkedEvents,
      });
    } catch (error) {
      this.handleError(
        error,
        "check error in abstract scraper announce and check",
        "close-thread",
        baseMusicEvents
      );
    }
    return [];
  }

  // step 2.5

  // RAW EVENTS
  // ASYNC
  // CHECK

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
      if (eventToCheck.corrupted) {
        this.dirtyTalk(
          `corrupt: ${eventToCheck.title} ${eventToCheck.corrupted}`
        );
        return await this.rawEventsAsyncCheck({
          eventGen,
          checkedEvents: useableEventsCheckedArray,
        });
      }
      const checkResult = await this.mainPageAsyncCheck(eventToCheck);
      eventToCheck.mainPageReasons = checkResult.reasons;
      eventToCheck.reasons = checkResult.reasons;

      if (debugSettings.debugRawEventAsyncCheck) {
        this.rawEventAsyncCheckDebugger(checkResult, eventToCheck);
      }

      if (checkResult.isError) {
        // artist-db-interface gooit al de thread dicht
        // maar dat je weet dat success ook error kan zijn.
        this.dirtyDebug({
          title: "rawEventsAsyncCheck checkresult isError",
          checkResult,
        });
        this.handleError(
          new Error("hier zou geen error moeten zijn?"),
          "error te veel in raw events async check",
          "close-thread"
        );
      }

      if (checkResult.isSuccess || checkResult.isNull) {
        useableEventsCheckedArray.push(eventToCheck);
      }

      if (checkResult.isFailed) {
        // this.dirtyDebug({
        //   title: `abstract is failed refuse opslaan. moet hebben: string, slug, eventDate`,
        //   eventToCheck,
        // });
        this.asyncSaveRefused(eventToCheck);
      }

      return await this.rawEventsAsyncCheck({
        eventGen,
        checkedEvents: useableEventsCheckedArray,
      });
    } catch (error) {
      this.handleError(
        error,
        `rawEventsAsyncCheck faal met ${generatedEvent?.value?.title}`,
        "close-thread"
      );
    }
    return true;
  }

  rawEventAsyncCheckDebugger(checkResult, eventToCheck) {
    const workingTitle = this.cleanupEventTitle(eventToCheck.title);
    if (!checkResult.isFailed) {
      parentPort.postMessage(
        this.qwm.debugger({
          title: "base check success",
          event: `<a class='single-event-check-notice single-event-check-notice--success' href='${eventToCheck.venueEventUrl}'>${workingTitle}<a/>`,
          reason: checkResult.reason,
        })
      );
      return;
    }
    parentPort.postMessage(
      this.qwm.debugger({
        title: "base check fail",
        event: `<a class='single-event-check-notice single-event-check-notice--failure' href='${eventToCheck.venueEventUrl}'>${workingTitle}<a/>`,
        reason: checkResult.reason,
      })
    );
  }

  /**
   *
   *
   * @param event om te controleren
   * @return {event {singes, success bool}}
   * @memberof AbstractScraper
   */
  async mainPageAsyncCheck(event) {
    const a = await this.recursiveAsyncChecker(
      this._s.app.mainPage.asyncCheckFuncs,
      event,
      []
    );
    a.event.mainPageReasons = a.reasons;
    a.event.mainPageReason = a.reason;
    return a;
  }

  // #endregion                                                 MAIN PAGE CHECK

  // #region                             SINGLE PAGE
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
    if (debugSettings.vertraagScraper) {
      await this.waitTime(125);
    }

    // verwerk events 1
    const useableEventsList = eventsList.map((a) => a);
    if (useableEventsList.length === 0) return useableEventsList;

    const singleEvent = useableEventsList.shift();

    parentPort.postMessage(this.qwm.todoNew(useableEventsList.length));

    // maak pagina
    let singleEventPage;
    if (!this._s.app.singlePage.useCustomScraper) {
      singleEventPage = await this.createSinglePage(singleEvent);
      if (!singleEventPage) {
        singleEvent.corrupted = "niet gelukt page te maken";
        return useableEventsList.length
          ? this.processSingleMusicEvent(useableEventsList)
          : useableEventsList;
      }
    }

    // corruptie check afkomstig nog van baseEvent. niet door naar pageInfo
    if (singleEvent.corrupted) {
      // singleEvent.registerINVALID(); TODO register invalid
      // this.dirtyDebug({
      //   title:'debug corrupt single event',
      //   toDebug:singleEvent,
      // });
      parentPort.postMessage(
        this.qwm.messageRoll(
          `<a href='${singleEvent.venueEventUrl}'>😵 Corrupted ${singleEvent.title}</a> ${singleEvent.corrupted}`
        )
      );
      this.asyncSaveRefused(singleEvent);
      return useableEventsList.length
        ? this.processSingleMusicEvent(useableEventsList)
        : useableEventsList;
    }

    // page info ophalen
    const { pageInfo, singlePageHTML } = await this.singlePage({
      page: singleEventPage,
      url: singleEvent.venueEventUrl, // @TODO overal weghalen vervangen met event
      event: singleEvent,
    });

    if (singlePageHTML && this._s.singlePage.useCache) {
      //save in cache if not there
      const u = singleEvent.venueEventUrl.replaceAll(/\W/g, "").toLowerCase();
      var b = u.substring(u.length - 25, u.length + 1);
      const singlePageCachePath = `${fsDirections.singlePagesCache}/${workerData.family}/${b}.html`;

      if (!fs.existsSync(singlePageCachePath)) {
        fs.writeFileSync(singlePageCachePath, singlePageHTML, "utf-8");
      }
    }

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
          title: `💀 corrupt ${mergedEvent.corrupted}`,
          event: `<a class='single-event-check-notice single-event-check-notice--failure' href='${mergedEvent.venueEventUrl}'>${mergedEvent.title}</a> Corr.`,
        });
        this.asyncSaveRefused(mergedEvent);
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

    // AFHANKELING
    // SINGLE PAGE
    // ASYNC CHECK

    const mergedEventCheckRes = await this.singlePageAsyncCheck(mergedEvent);
    mergedEventCheckRes.event = mergedEvent;

    if (
      !mergedEvent?.artists ||
      typeof mergedEvent?.artists !== "object" ||
      mergedEvent.artists === null
    )
      mergedEvent.artists = {};
    const harvestedArtists = await this.asyncHarvestArtists(mergedEvent);

    if (debugSettings.debugHarvestIntegratie) {
      this.dirtyLog({
        title: `harvested artists res voor ${mergedEvent.title}`,
        harvestedArtists,
      });
    }

    if (harvestedArtists && harvestedArtists.success) {
      const harvestedArtistsNames = Object.keys(harvestedArtists.data);
      const currentEventArtistNames = Object.keys(mergedEvent?.artists ?? {});
      if (debugSettings.debugHarvestIntegratie) {
        this.dirtyLog({
          title: `harvested artists data sp23`,
          data: harvestedArtists.data,
          harvestedArtistsNames,
          currentEventArtistNames,
        });
      }
      harvestedArtistsNames.forEach((han) => {
        if (currentEventArtistNames.includes(harvestedArtistsNames)) return;
        mergedEvent.artists[han] = {
          s: harvestedArtists.data[han][1],
          l: han,
          g: harvestedArtists.data[han][3],
        };
      });
    }

    // this.singlePageAsyncCheckDebugger(mergedEventCheckRes);

    if (mergedEventCheckRes.isError) {
      this.handleError(
        mergedEventCheckRes?.data?.error,
        mergedEventCheckRes?.reason,
        "notice"
      );
      await this.closePageAfterSingle(
        singleEventPage,
        useableEventsList.length > 0
      );
      return useableEventsList.length
        ? this.processSingleMusicEvent(useableEventsList)
        : useableEventsList;
    }

    if (!mergedEventCheckRes.isFailed) {
      const artistsRes = await this.asyncScanEventForAllowedArtists(
        mergedEvent
      );
      this.artistScanDebugger(mergedEventCheckRes, artistsRes);

      if (artistsRes.isSuccess) {
        mergedEvent.artists = Object.assign(
          mergedEvent.artists,
          artistsRes.data
        );
      } else if (artistsRes.isError) {
        this.handleError(
          artistsRes.data.error,
          `artist scan abs scraper single page post check err${mergedEvent.title}`,
          "notice",
          artistsRes
        );
      }
    }

    const toRegister = this.makeRegisterObj(mergedEvent);

    if (
      mergedEventCheckRes.isSuccess &&
      !mergedEvent.unavailable &&
      !mergedEvent.corrupted
    ) {
      toRegister.artists = mergedEvent.artists;
      this._events.push(toRegister);
      this.asyncSaveAllowedEvent(mergedEvent, mergedEvent);
    } else if (mergedEventCheckRes.isFailed || mergedEvent.corrupted) {
      this.asyncSaveRefused(mergedEvent);
    } else if (mergedEvent.unavailable) {
      this.asyncSaveAllowedEvent(mergedEvent, mergedEvent);
    }

    await this.closePageAfterSingle(
      singleEventPage,
      useableEventsList.length > 0
    );

    return useableEventsList.length
      ? this.processSingleMusicEvent(useableEventsList)
      : useableEventsList;
  }

  async closePageAfterSingle(singleEventPage, nogEventsOver) {
    if (this._s?.launchOptions?.headless) {
      if (singleEventPage && !singleEventPage.isClosed())
        await singleEventPage.close();
    } else if (this._s?.launchOptions?.headless === false && nogEventsOver) {
      this.closeBrowser();
    }
  }

  makeRegisterObj(mergedEvent) {
    return {
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
      eventGenres: mergedEvent?.eventGenres ?? null,
    };
  }

  artistScanDebugger(mergedEventCheckRes, artistsRes) {
    if (!debugSettings.debugArtistScan) return;
    this.dirtyDebug({
      title: `🟩  artist scan`,
      event: `<a class='single-event-check-notice single-event-check-notice--success' href='${mergedEventCheckRes.event.venueEventUrl}'>${mergedEventCheckRes.event.title}</a>`,
      reason: artistsRes.reason,
    });
  }

  // singlePageAsyncCheckDebugger(mergedEventCheckRes) {
  //   if (!debugSettings.debugsinglePageAsyncCheck) return;

  //   const s = !mergedEventCheckRes.isFailed ? `success` : `failure`;

  //   this.dirtyDebug({
  //     title: `single check ${s}`,
  //     event: `<a class='single-event-check-notice single-event-check-notice--${s}' href='${mergedEventCheckRes.event.venueEventUrl}'>${mergedEventCheckRes.event.title}</a>`,
  //     reason: mergedEventCheckRes.reason,
  //   });
  // }

  /**
   *
   *
   * @param {event} event obj
   * @return {page|null} reeds genavigeerde pagina
   * @memberof AbstractScraper
   */
  async createSinglePage(event) {
    const page = await this.browser.newPage();

    //check if in cache
    const u = event.venueEventUrl.replaceAll(/\W/g, "").toLowerCase();
    var b = u.substring(u.length - 25, u.length + 1);
    const singlePageCachePath = `${fsDirections.singlePagesCache}/${workerData.family}/${b}.html`;

    if (fs.existsSync(singlePageCachePath)) {
      await page.goto(`file://${singlePageCachePath}`).catch((err) => {
        this.handleError(
          err,
          `cache single err titel ${event.title} \n cache path ${singlePageCachePath}`,
          "close-app"
        );
      });
      return page;
    }

    let err1 = null;
    let err2 = null;
    await page.goto(event.venueEventUrl, this.singlePage).catch((err) => {
      err1 = err;
    });
    if (!err1) return page;

    this.handleError(
      err2,
      `Eerste keer mislukt single <a class='single-page-failure error-link' href='${event.venueEventUrl}'>${event.title}</a>`,
      "notice",
      event
    );

    await this.waitTime(500);

    await page.goto(event.venueEventUrl, this.singlePage).catch((err) => {
      err2 = err;
    });
    if (!err2) return page;

    this.handleError(
      err2,
      `Tweede keer mislukt single <a class='single-page-failure error-link' href='${event.venueEventUrl}'>${event.title}</a>`,
      "notice",
      event
    );
  }

  titelShorttextPostfix(musicEvent) {
    let { title, shortText } = musicEvent;

    const titleIsCapsArr = title
      .split("")
      .map((char) => char === char.toUpperCase());
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
      const splittingCandidates = this._s.app.harvest.dividers;
      let i = 0;
      do {
        const splitted = title.split(splittingCandidates[i]);
        title = splitted[0];
        const titleRest = splitted
          .splice(1, 45)
          .join(` ${splittingCandidates[i]} `);
        shortText = `${titleRest} ${shortText}`;
        i += 1;
      } while (title.length > 45 && i < splittingCandidates.length);
    }

    if (shortText) shortText = shortText.replace(/<\/?\w+>/g, "");

    return {
      ...musicEvent,
      title,
      shortText,
    };
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
  async singlePageStart(event) {
    const stopFunctie = setTimeout(() => {
      this.handleError(
        new Error("Timeout baseEvent in single page start"),
        `<a href='${event?.venueEventUrl}' class='error-link get-page-info-timeout'>singlePage ${workerData.name} overtijd</a>.\nMax: ${this._s.singlePage.timeout}`,
        "close-thread"
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
   * @params singlePageHTML volledige HTML van pagina
   */
  async singlePageEnd({
    pageInfo,
    stopFunctie,
    page,
    event,
    singlePageHTML = null,
  }) {
    if (this.isForced && debugSettings.debugPageInfo) {
      this.dirtyLog({
        event,
        pageInfo,
      });
    }

    if (!pageInfo) {
      if (page && !page.isClosed()) await page.close();
      throw new Error("page info ontbreekt.");
    }

    pageInfo.goodTermsInLongHTML = [];
    if (pageInfo?.textForHTML ?? null) {
      pageInfo.goodTermsInLongHTML = terms.goodCategories.filter(
        (goodCategory) => {
          return pageInfo.textForHTML.includes(goodCategory);
        }
      );
    }

    if (!Array.isArray(pageInfo?.errors)) {
      pageInfo.errors = [
        {
          error: new Error("pageInfo object incompleet; geen errors"),
          remarks: "pageInfo object incompleet; geen errors",
          workerData,
          toDebug: {
            title: "failed page info",
            pageInfoData: pageInfo,
          },
        },
      ];
    }

    pageInfo?.errors?.forEach((errorData) => {
      if (!(errorData?.error instanceof Error)) {
        const msg = errorData?.error.message || "geen message in error";
        errorData.error = new Error(msg);
      }

      this.handleError(
        errorData.error,
        errorData?.remarks ?? "geen remarks",
        errorData?.errorLevel ?? "notice",
        errorData?.toDebug ?? null
      );
    });

    if (page && !page.isClosed()) await page.close();
    clearTimeout(stopFunctie);
    return { pageInfo, singlePageHTML };
  }

  /**
   *
   * @memberof AbstractScraper
   */
  async singlePageAsyncCheck(event) {
    const rr = await this.recursiveAsyncChecker(
      this._s.app.singlePage.asyncCheckFuncs,
      event,
      event.mainPageReasons
    );
    if (debugSettings.debugsinglePageAsyncCheck) {
      const s = !rr.isFailed ? `success` : `failure`;
      this.dirtyDebug({
        title: `single check ${s}`,
        event: `<a class='single-event-check-notice single-event-check-notice--${s}' href='${event.venueEventUrl}'>${event.title}</a>`,
        reason: rr.reason,
      });
      this.dirtyLog(rr, `single page async check`);
      this.dirtyLog(event);
    }
    return rr;
  }
  // #endregion                                                 SINGLE PAGE

  // #region                             ASYNC CHECKERS

  cleanupEventTitle(workingTitle = "") {
    try {
      if (workingTitle.match(/\s?-\s?\d\d:\d\d/)) {
        // eslint-disable-next-line no-param-reassign
        workingTitle = workingTitle.replace(/\s?-\s?\d\d:\d\d/, "");
      }

      if (workingTitle.includes("&")) {
        // eslint-disable-next-line no-param-reassign
        workingTitle = workingTitle.replace(/&.*$/, "");
      }

      if (workingTitle.includes("|")) {
        // eslint-disable-next-line no-param-reassign
        workingTitle = workingTitle.replace(/|.*$/, "");
      }

      if (workingTitle.includes("•")) {
        // eslint-disable-next-line no-param-reassign
        workingTitle = workingTitle.replace(/•.*$/, "");
      }

      if (workingTitle.includes("+")) {
        // eslint-disable-next-line no-param-reassign
        workingTitle = workingTitle.replace(/\+.*$/, "");
      }

      if (workingTitle.includes(":")) {
        // eslint-disable-next-line no-param-reassign
        workingTitle = workingTitle.replace(/^[\w\s]+:/, "");
      }
    } catch (error) {
      this.handleError(error, "fout schoonmaken titel");
      return "TITEL SCHOONMAKEN MISLUKT";
    }

    return workingTitle.toLowerCase().trim();
  }

  *eventGenerator(events) {
    while (events.length) {
      yield events.shift();
    }
  }
  // #endregion                                                 ASYNC CHECKERS

  // #region                           LONG HTML
  writeLongTextHTML(mergedEvent) {
    if (!mergedEvent) return null;
    const base64String = Buffer.from(
      mergedEvent.venueEventUrl.substring(
        mergedEvent.venueEventUrl.length - 30,
        mergedEvent.venueEventUrl.length
      )
    ).toString("base64");
    const toPrint = makeLongHTML(mergedEvent);

    if (
      !fs.existsSync(`${fsDirections.publicTexts}/${mergedEvent.location}/`)
    ) {
      fs.mkdirSync(`${fsDirections.publicTexts}/${mergedEvent.location}/`);
    }

    try {
      const longTextPath = `${fsDirections.publicTexts}/${mergedEvent.location}/${base64String}.html`;
      fs.writeFileSync(longTextPath, toPrint, "utf-8");

      return longTextPath;
    } catch (err) {
      this.handleError(err, "write long text fail", "notice", {
        path: `${fsDirections.publicTexts}/${mergedEvent.location}/${base64String}.html`,
        text: toPrint,
      });
    }
    return "";
  }
  // #endregion                                                 LONG HTML

  // step 4
  async announceToMonitorDone() {
    parentPort.postMessage(this.qwm.workerDone(this._events.length));
    return true;
  }

  // step 4.5
  async closeBrowser() {
    try {
      if (
        this.browser &&
        Object.prototype.hasOwnProperty.call(this.browser, "close")
      ) {
        await this.browser.close();
      }
    } catch (error) {
      this.handleError(error, `mislukt browser sluiten ${workerData.name}`);
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
  handleError(error, remarks = null, errorLevel = "notify", toDebug = null) {
    // TODO link errors aan debugger
    const updateErrorMsg = {
      type: "update",
      subtype: "error",
      messageData: {
        workerData,
        remarks,
        status: "error",
        errorLevel,
        text: `${error?.message}\n${error?.stack}\nlevel:${errorLevel}`,
      },
    };

    const clientsLogMsg = {
      type: "clients-log",
      subtype: "error",
      messageData: { error, workerData },
    };
    let debuggerMsg;
    if (toDebug) {
      debuggerMsg = {
        type: "update",
        subtype: "debugger",
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
      const curErrorLog = fs.readFileSync(fsDirections.errorLog) || "";
      const newErrorLog = `
      ${workerData?.name} Error - ${time.toLocaleTimeString()}
      ${error?.stack ?? "geen stack"} 
      ${error?.message ?? "geen message"}
      ${curErrorLog}`;
      fs.writeFileSync(fsDirections.errorLog, newErrorLog, "utf-8");
    }
  }

  async autoScroll(page) {
    this.timesScrolled += 1;
    const startHeight = await page.evaluate(() => {
      return document.body.scrollHeight;
    });
    const endHeight = await page.evaluate(async () => {
      return await new Promise((resolve) => {
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
      }).then(() => {
        return document.body.scrollHeight;
      });
    });
    this.dirtyTalk(
      `${workerData.family} ${workerData.index} scrolled #${this.timesScrolled} from ${startHeight} to ${endHeight}`
    );
  }

  handleOuterScrapeCatch(catchError) {
    const updateErrorMsg = {
      type: "update",
      subtype: "error",
      messageData: {
        workerData,
        status: "error",
        errorLevel: "close-thread",
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
    if (wait > 100) {
      this.dirtyTalk(
        `${workerData.family} ${workerData.index} waiting ${wait}`
      );
    }

    return new Promise((res) => {
      setTimeout(res, wait);
    });
  }

  // step 6
  async saveEvents() {
    const pathToEventList = fsDirections.eventLists;
    const inbetweenFix =
      workerData.index !== null ? `${workerData.index}` : "0";
    const pathToEventListFile = `${pathToEventList}/${workerData.family}/${inbetweenFix}.json`;
    fs.writeFileSync(
      pathToEventListFile,
      JSON.stringify(this._events, null, "  ")
    );

    return true;
  }

  // step 7
  async debugScraperOutput() {
    if (!debugSettings.debugScraperOutput) return true;
    if (workerData.index != "0") return;
    const eventListFileName = `${fsDirections.eventLists}/${workerData.family}/0.json`;
    const fsRes = JSON.parse(fs.readFileSync(eventListFileName, "utf-8"));

    const eerste5 = [fsRes[0], fsRes[1], fsRes[2], fsRes[3], fsRes[4]];
    const eerste5Kort = eerste5.map((r) => {
      if (!r) return r;
      const longTextURL = r.longText.replace("../public/texts/", "");
      const n = {
        title: r.title,
        start: r.start,
        anker: `<a href='${r.venueEventUrl}'>${r.title}</a>`,
        link: `<a class='links-naar-longtext-html' style="font-weight: bold; font-size: 18px" target='_blank' href='${`http://localhost/rockagenda/public/texts/${longTextURL}`}'>LongText</a>`,
      };
      return n;
    });
    this.dirtyDebug({
      title: `event list res ${workerData.family}`,
      eerste5Kort,
    });
    this.dirtyLog({
      title: `event list res ${workerData.family}`,
      eerste5Kort,
    });

    return true;
  }

  listenToMasterThread() {
    parentPort.on("message", (message) => {
      const pm = JSON.parse(message);
      const pmt = pm?.type ?? "";
      if (pmt !== "db-answer" && pmt !== "process") {
        console.log("ERROR IN COMMUNICATIE UIT DB IN ROCKWORKER");
        console.log(workerData);
        console.log(pm);
      }
      if (pmt === "db-answer") {
        this.getAnswerFromDB(pm.messageData);
      }
      if (pmt === "process" && pm?.subtype === "command-start") {
        this.scrapeInit(pm?.messageData).catch(this.handleOuterScrapeCatch);
      }
      if (pmt === "process" && pm?.subtype === "command-die") {
        this.scrapeDie(pm?.messageData).catch(this.handleOuterScrapeCatch);
      }
    });
  }

  // #region       MAIN PAGE EVENT CHECK

  async recursiveAsyncChecker(listOfFuncs, event, olderReasons = []) {
    if (!listOfFuncs.length) {
      const r = new DbInterFaceToScraper(
        {
          success: null,
          reason: "⬜ geen check funcs",
          reasons: [...olderReasons],
          event,
        },
        [...olderReasons],
        "geen recursieve funcs"
      );
      r.setBreak(true).setReason();
      return r;
    }

    const funcNamesMap = {
      allowedEvent: "asyncIsAllowedEvent",
      refused: "asyncIsRefused",
      forbiddenTerms: "asyncForbiddenTerms",
      hasGoodTerms: "asyncGoodTerms",
      saveAllowedEvent: "asyncSaveAllowedEvent",
      harvestArtists: "asyncHarvestArtists",
      spotifyConfirmation: "asyncSpotifyConfirmation",
      getMetalEncyclopediaConfirmation: "asyncMetalEncyclopediaConfirmation",
      explicitEventGenres: "asyncExplicitEventCategories",
      hasAllowedArtist: "asyncHasAllowedArtist",
      goodCategoriesInLongHTML: "asyncGoodCategoriesInLongHTML",
      success: "asyncSuccess",
      failure: "asyncFailure",

      // refused: 'asyncCheckIsRefused',
      // emptySuccess: 'asyncCheckEmptySuccess',
      // emptyFailure: 'asyncCheckEmptyFailure',
      // event: 'asyncCheckIsEvent',
      // goodTerms: 'asyncCheckGoodTerms',
      // isRock: 'asyncCheckIsRock',
      // saveAllowed: 'asyncSaveAllowed',
      // saveRefused: 'asyncSaveRefused',
      // custom1: 'asyncCustomCheck1',
      // getArtists: 'asyncGetArtists',
      // allowed: `asyncNoLongerExists`,
    };

    const listOfFuncsCopy = [...listOfFuncs];
    const curFunc = listOfFuncsCopy.shift();
    const curFuncName = funcNamesMap[curFunc];

    if (typeof this[curFuncName] !== "undefined") {
      const result = await this[curFuncName](event, olderReasons);

      if (result?.break) return result;

      if (listOfFuncsCopy.length < 1) return result;

      // eslint-disable-next-line no-param-reassign
      // event.reasonsSingle = [...result.reasons]; // TODO DIT IS EEN HACK WANT OM EEN OF ANDERE REDEN VALLEN ANDERS DE REASONS ERAF
      // this.dirtyLog(`reasons Ar: ${(result?.reasons ?? 'geen reasons').join('; ')}`);
      return this.recursiveAsyncChecker(listOfFuncsCopy, event, [
        ...result.reasons,
      ]);
    }
    this.handleError(
      new Error(`${curFunc} niet in funcnames`),
      null,
      "close-thread",
      funcNamesMap
    );
    return this.recursiveAsyncChecker(listOfFuncsCopy, event, [
      "error failure",
    ]);
  }

  // #endregion       MAIN PAGE EVENT CHECK
}
