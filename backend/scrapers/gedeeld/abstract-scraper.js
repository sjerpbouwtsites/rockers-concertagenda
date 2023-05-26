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


/**
 * @method eventGenerator<Generator>
 *
 * @export
 * @class AbstractScraper
 */
export default class AbstractScraper {

  /**
   * Gebruikt in singleRawEventChecks' hasForbiddenTerms
   *
   * @static
   * @memberof AbstractScraper
   */
  static forbiddenTerms = [
    "fan event",
    'clubnacht',
    `pubquiz`, 
    `schaakinstuif`,
    `jazz-core`,
    `experi-metal`,
    `Dream Punk`,
    `poetry`,
    "interactieve lezing",
    "karaoke",
    "london calling",
    "filmvertoning",
    "indie",
    "dromerig",
    "shoegaze",
    "countryrock",
    "americana",
    "alternatieve rock",
    `dream pop`
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
    `neue deutsche harte`,
    `neue deutsche haerte`,
    `punx`,
    `death metal`,
    `doom`,
    `hardcore`,
    `new wave`,
    `punk`,
    `hardcore punk`,
    `heavy rock 'n roll`,
    `symphonic metal`,
    `thrash`,
    `metalcore`,
    `grindcore`,
    `industrial`,
    `noise`,
    `postpunk`,
    `post-punk`,
    `heavy metal`,
    `power metal`,
    `heavy psych`,
    `metal`,
    `surfpunkabilly`,
    `psychobilly`]

  rockAllowList = '';
  rockRefuseList = '';

  constructor(obj) {
    this.qwm;
    this.browser;
    this.install(obj);
  }

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

  install(obj) {
    this.qwm = new QuickWorkerMessage(workerData);
    this.maxExecutionTime = obj.maxExecutionTime ?? 30000;
    this.puppeteerConfig = obj.puppeteerConfig ?? {};
    this.months = getVenueMonths(workerData.family)
    this.rockAllowList = fs.readFileSync(fsDirections.isRockAllow, 'utf-8')
    this.rockRefuseList = fs.readFileSync(fsDirections.isRockRefuse, 'utf-8')
    this.dirtyLog(this.rockRefuseList)
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

  async scrapeDie(){
    this.dirtyTalk('DIEING!')
    await this.closeBrowser();
    await this.saveEvents();
    await this.announceToMonitorDone()
    this.dirtyTalk('DEAD')
    await _t.waitFor(50);
    process.exit()
  }

  // step 1
  async makeBaseEventList() {
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
  async makeBaseEventListStart(){

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
   * haalt rawEvents door basicMusicEventsFilter en returned
   *
   * @param {stopFunctie timeout, page Puppeteer.Page, rawEvents {}<>} 
   * @return {MusicEvent[]}
   * @memberof AbstractScraper
   */
  async makeBaseEventListEnd({stopFunctie, page, rawEvents}){

    this.isForced && this.dirtyLog(rawEvents)

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

    let missingProperties = []
    const meetsRequiredProperties = this.puppeteerConfig.app.mainPage.requiredProperties.reduce((prev, next)=>{
      if (!musicEvent[next]){
        missingProperties.push(next)
      }
      return prev && musicEvent[next]
    }, true)        
    if (!meetsRequiredProperties) {
      musicEvent.corrupted = missingProperties.join(',')
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
      parentPort.postMessage(this.qwm.messageRoll(`<a class='forbidden-term' href='${musicEvent.venueEventUrl}'>${musicEvent.title}</a> is ${forbiddenTermUsed}/`));
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
      if (checkResult.success) {
        useableEventsCheckedArray.push(eventToCheck);
        parentPort.postMessage(
          this.qwm.debugger(
            {
              event: `<a class='single-event-check-notice' href='${eventToCheck.venueEventUrl}'>ja: ${eventToCheck.title}<a/>`,              
              reason: checkResult.reason,
            },
          )
        );        
      } else {
        parentPort.postMessage(
          this.qwm.debugger(
            {
              event: `<a class='single-event-check-notice' href='${eventToCheck.venueEventUrl}'>nee: ${eventToCheck.title}<a/>`,              
              reason: checkResult.reason,
            },
          )
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
        }
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
  async singleRawEventCheck(event) {
    // abstracte methode, over te schrijven
    return {
      event,
      success: true,
      reason: null,
    };
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
      // if (keysToCheck2[i] === 'longTextHTML'){
      //   const longTextHTML = fs.readFileSync(event.longTextHTML, 'utf-8');
      //   combinedTextToCheck += longTextHTML
      // } else {
      combinedTextToCheck += event[keysToCheck2[1]]
      //}
    }

    const hasGoodTerm = AbstractScraper.goodCategories.find(goodTerm=> combinedTextToCheck.includes(goodTerm))
    if (hasGoodTerm) {
      return {
        event,
        success: true,
        reason: `Goed in `+keysToCheck2.join(''),
      };    
    }
    
    return {
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
    const keysToCheck2 = Array.isArray(keysToCheck) ? keysToCheck : ['title', 'shortText'];
    let combinedTextToCheck = '';
    for (let i = 0; i < keysToCheck2.length; i++){
      combinedTextToCheck += event[keysToCheck2[i]].toLowerCase() + ' ';
    }
    const hasForbiddenTerm = AbstractScraper.forbiddenTerms.find(forbiddenTerm=> combinedTextToCheck.includes(forbiddenTerm))
    if (hasForbiddenTerm) {
      return {
        event,
        success: true,
        reason: "verboden genres gevonden in title+shortText",
      };
    }
    
    return {
      event,
      success: false,
      reason: "verboden genres niet gevonden.",
    };    
  }

  async saveRefusedTitle(title){
    const curForbiddenList = fs.readFileSync(fsDirections.isRockRefuse, 'utf-8');
    fs.writeFileSync(fsDirections.isRockRefuse, `${title.toLowerCase()}\n${curForbiddenList}`, 'utf-8')
  }

  async saveAllowedTitle(title){
    const curAllowList = fs.readFileSync(fsDirections.isRockAllow, 'utf-8');
    fs.writeFileSync(fsDirections.isRockAllow, `${title.toLowerCase()}\n${curAllowList}`, 'utf-8')
  }

  async rockAllowListCheck(event, title){
    const t = title.toLowerCase();
    const tt = this.rockAllowList.includes(t);
    return {
      event,
      success: tt,
      reason: `${tt ? 'in' : 'not in'} allowed list`,
    };
  }

  async rockRefuseListCheck(event, title){
    const t = title.toLowerCase();
    const tt = this.rockRefuseList.includes(t);
    return {
      event,
      success: tt,
      reason: `${tt ? 'in' : 'not in'} refuse list`,
    };
  }

  async metalEncyclopedia(event, title){
    const MetalEncFriendlyTitle = title.replace(/\s/g, "_");
    this.dirtyTalk(`${event.title} asks https://www.metal-archives.com/search/ajax-band-search/?field=name&query=${MetalEncFriendlyTitle}`)
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
              return match[1].toLowerCase() === title;
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
          remarks: `<a href='${event?.venueEventUrl}' class='error-link get-page-info-timeout'>getPageInfo ${workerData.name} metal enc. error</a>`,
          workerData,
          errorLevel: 'notice',
        }
        ))
        return {
          event,
          success: false,
          url: metalEncUrl,
          reason: metalEncError.message
        };
      });
    if (foundInMetalEncyclopedia) {
      return {
        event,
        success: true,
        url: metalEncUrl,
        reason: `found in <a class='single-event-check-reason metal-encyclopedie metal-encyclopedie--success' href='${metalEncUrl}'>metal encyclopedia</a>`
      };
    }
    return {
      success: false,
      url: metalEncUrl,
      reason: 'no result metal enc',
      event
    };
  }

  async wikipedia(event, title){

    const page = await this.browser.newPage();
    let wikiPage
    try {
      const wikifiedTitled = title.split(' ')
        .filter(a => a)
        .map(word => {
          return word[0].toUpperCase() + word.substring(1,word.length)
        }).join('_').replace(/\W/g,'')
      wikiPage = `https://en.wikipedia.org/wiki/${wikifiedTitled}`;
      await page.goto(wikiPage);
    } catch (error) {
      _t.wrappedHandleError(new ErrorWrapper({
        error,
        remarks: `<a href='${event?.venueEventUrl}' class='error-link get-page-info-timeout'>wikititel maken fout ${workerData.name}</a> ${title}`,
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


      // const isRock =
      //   !!document.querySelector(".infobox a[href*='rock']") &&
      //   !document.querySelector(".infobox a[href*='Indie_rock']");
      // const isMetal = !!document.querySelector(".infobox a[href*='metal']");
      // const isPunk = !!document.querySelector(".infobox a[href*='punk']");
      // const isStoner = !!document.querySelector(".infobox a[href*='stoner']");
      // return isRock || isMetal || isPunk || isStoner;
    }, {wikipediaGoodGenres: AbstractScraper.wikipediaGoodGenres});
    !page.isClosed() && page.close();
    if (wikiRockt) {
      return {
        event,
        success: true,
        url: wikiPage,
        reason: `found on <a class='single-event-check-reason wikipedia wikipedia--success' href='${wikiPage}'>wikipedia</a>`
      };
    }  
    !page.isClosed() && page.close();
    return {
      event,
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

    const workingTitle = recursiveTitle || event.title.replace(/&.*/, "").trim().toLowerCase();

    const rockRefuseListRes = await this.rockRefuseListCheck(event, workingTitle);
    if (rockRefuseListRes.succes) {
      return {
        reason: rockRefuseListRes.reason,
        event,
        success: false,
      }
    }

    const rockAllowListRes = await this.rockAllowListCheck(event, workingTitle);
    if (rockAllowListRes.succes) {
      rockAllowListRes
    }

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
      success: false,
      reason: `<a class='single-event-check-reason wikipedia wikipedia--failure metal-encyclopedie metal-encyclopedie--failure' href='${wikipediaRes.url}'>wikipedia</a> + <a href='${metalEncyclopediaRes.url}'>metal encyclopedia</a>nope`};
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

    if (!pageInfo || !!pageInfo?.unavailable || !!pageInfo?.corrupted) {
      parentPort.postMessage(
        this.qwm.messageRoll(
          `SKIP ${pageInfo.pageInfo} ${pageInfo?.unavailable ?? ""} ${pageInfo?.corrupted ?? ""}`
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

    // check op properties vanuit single page
    let missingProperties = []
    const meetsRequiredProperties = this.puppeteerConfig.app?.singlePage?.requiredProperties?.reduce((prev, next)=>{
      if (!singleEvent[next]){
        missingProperties.push(next)
      }
      return prev && singleEvent[next]
    }, true) ?? true
    if (!meetsRequiredProperties) {
      singleEvent.corrupted += missingProperties.join(',')
    }

    const mergedEventCheckRes = await this.singleMergedEventCheck(singleEvent, pageInfo);
    if (mergedEventCheckRes.success) {
      singleEvent.isValid
        ? singleEvent.register() // TODO hier lopen dingen echt dwars door elkaar. integreren in soort van singleMergedEventCheckBase en dan anderen reducen erop of weet ik veel wat een gehack vandaag
        : singleEvent.registerINVALID(this.workerData);
    } else {
      this.dirtyDebug({
        title: mergedEventCheckRes.event.title + ' afwezen',
        reason: mergedEventCheckRes.reason,
      })
      singleEvent.registerINVALID(this.workerData);
    }

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
    let uuid = crypto.randomUUID();
    try {
      if (!longTextHTML) return null;
      const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;
      fs.writeFileSync(longTextPath, longTextHTML, "utf-8");
      return longTextPath;
    } catch (err) {
      _t.handleError(err, workerData, `write long text fail`, 'notice', {
        path: `${fsDirections.publicTexts}/${uuid}.html`,
        text: longTextHTML
      });
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
  async getPageInfoStart(event){
    const stopFunctie = setTimeout(() => {
      _t.wrappedHandleError(new ErrorWrapper({
        error: new Error('Timeout baseEvent'),
        remarks: `<a href='${event?.venueEventUrl}' class='error-link get-page-info-timeout'>getPageInfo ${workerData.name} overtijd</a>.\nMax: ${this.puppeteerConfig.singlePage.timeout}`,
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
   * Vervangt generieke code aan eind getPageInfo
   * stopt stopFunctie
   * verwijderd overbodige witruimte
   * kijkt naar evt fouten in pageInfo.errors
   * @returns {*} pageInfo
   * @memberof AbstractScraper
   */  
  async getPageInfoEnd({pageInfo, stopFunctie, page}){

    this.isForced && this.dirtyLog(pageInfo)

    if (!pageInfo || !Array.isArray(pageInfo?.errors)) {
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
        corrupted: `Geen resultaat van pageInfo`, //TODO samen met musicEvent.unavailable
      };      
    }
    
    pageInfo?.errors?.forEach((errorData) => {
      try {
        errorData.workerData = workerData;
        if (!errorData?.error){
          let errorTekst = errorData?.remarks ?? 'geen remarks'
          errorData.error = new Error(!errorTekst ? 'geen tekst' : errorTekst);
        }
        const wrappedError = new ErrorWrapper(errorData);
        _t.wrappedHandleError(wrappedError);        
      } catch (error) {
        const wrappedError = new ErrorWrapper(error);
        _t.wrappedHandleError(wrappedError);        
      }

    });
  
    if (pageInfo?.longTextHTML) {
      pageInfo.longTextHTML = _t.killWhitespaceExcess(pageInfo.longTextHTML)
    }
    if (pageInfo?.priceTextcontent) {
      pageInfo.priceTextcontent = _t.killWhitespaceExcess(pageInfo.priceTextcontent)
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
      `outer catch scrape ${workerData.family}`,
      'close-thread',
      null
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

