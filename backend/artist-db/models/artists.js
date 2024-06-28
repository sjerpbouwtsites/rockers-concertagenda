/* eslint-disable no-console */
import fs from 'fs';
import terms from '../store/terms.js';
import { slugify } from "../../scrapers/gedeeld/slug.js";
import shell from '../../mods/shell.js';
import { harvestArtists } from './harvest.js';
import consoleKleuren from "../../mods/consoleKleurenRef.js";

// console.log(util.inspect(na, 
//   { showHidden: false, depth: null, colors: true })); 

export default class Artists {
  // #region PROPERTIES
  typeCheckInputFromScrapers = true;

  minLengthLang = 7;

  minLengthKort = 4;

  /**
   * dir path van artist-db models
   */
  modelPath = null;

  /**
   * dit path van artist-db store
   */
  storePath = null;

  /**
   * een store. 
   * @external Object ../store/allowed-artists.json
   * @see README.md
   */
  allowedArtists;
  
  /**
   * een store.
   * @external Object ../store/allowed-events.json
   * @see README.md
   */
  allowedEvents;

  /**
   * een store.
   * @external Object ../store/refused.json
   * @see README.md
   */  
  refused;
  
  /**
   * een store voor onduidelijke genre artiesiten..
   * @external Object ../store/unclear-artists.json
   * @see README.md
   */  
  unclearArtists;

  /**
   * tijdelijke houder om later mogelijk in refused op te slaan.
   */
  refusedTemp = {};
  
  /**
   * tijdelijke houder om later mogelijk in allowedEvents op te slaan.
   */
  allowedEventTemp = {};

  /**
   * tijdelijke houder om later mogelijk in allowedArtists op te slaan.
   */
  allowedArtistsTemp = {};

  /**
   * tijdelijke houder om later mogelijk in unclearArtists op te slaan.
   */
  unclearArtistsTemp = {};

  /**
   * Twee weg referentie zoals {USA: US, US: USA}
   * tbv country info uit titels halen
   */
  landcodesMap;

  terms = terms;

  /**
   * datum vandaag kort YYMMDD
   */
  today = null;

  spotifyAccessToken = null;

  funcsToDebug = {
    harvestArtists: true,
    scanTextForAllowedArtists: false,
    getSpotifyArtistSearch: false,
    persistNewRefusedAndRockArtists: true,
    checkExplicitEventCategories: false,
  };

  // #endregion
  /**
   * of in die persistentie functie fs write file
   */
  storeWritePermission = false || shell.artistDBWrite;

  constructor(conf) {
    this.modelPath = conf.modelPath;
    this.storePath = conf.storePath;
    this.refused = JSON.parse(fs.readFileSync(`${this.storePath}/refused.json`));
    this.allowedArtists = JSON.parse(fs.readFileSync(`${this.storePath}/allowed-artists.json`));
    this.allowedEvents = JSON.parse(fs.readFileSync(`${this.storePath}/allowed-events.json`));
    this.unclearArtists = JSON.parse(fs.readFileSync(`${this.storePath}/unclear-artists.json`));
    this.landcodesMap = JSON.parse(fs.readFileSync(`${this.storePath}/landcodes-map.json`));
    this.today = (new Date()).toISOString().replaceAll('-', '').substring(2, 8);

    this.getSpotifyAccessToken();
    this.installDeps();
  }

  installDeps() {
    this.harvestArtists = harvestArtists;
    this.harvestArtists.bind(this);
  }

  // #region MESSAGING

  /**
   * Hack functie. Indien de 'message' een string is, wordt die geJSONparsed en komt object terug.
   * Indien message niet een string is, wordt de message zelf teruggegeven - het zal elders
   * al zijn geparsed?
   * @param {string|any} message een JSONString
   * @returns {object} 
   */
  parseMessage(message) {
    if (typeof message === 'string') {
      return JSON.parse(message);
    }
    return message;
  }

  /**
   * 'type' controle op de inkomende messages.
   * @param {object} parsedMessage JSON parsed message door this.parseMessage
   * @returns {bool} of de message wel de juiste 'type' heeft: {request:string, data:object}
   */
  checkMessage(parsedMessage) {
    const hasRequest = Object.prototype.hasOwnProperty.call(parsedMessage, 'request');
    const hasData = Object.prototype.hasOwnProperty.call(parsedMessage, 'data');
    return hasRequest && hasData;
  }

  // #endregion

  /**
   * wrapper van do tbv erroring
   */  
  async do(message) {
    try {
      return this._do(message);
    } catch (error) {
      console.log('error de perorr');
      return this.error(error);      
    }
  }

  // #region DO (VOORMAN)

  /**
   * Voorman van de class. message.request heeft de naam van een functie hier
   * 'do' stuurt die functie aan en returned het resultaat. Controleert ook of 
   * message.data wel de voor die functie vereiste 'type' heeft.
   * @param {request:string, data:object} message  
   * @returns {success:boolean|string,reason:string,data:object} -> ALS JSON!
   */
  async _do(message) {
    // parse
    
    const parsedMessage = this.parseMessage(message);

    // check
    if (!this.checkMessage(parsedMessage)) {
      return this.error(new Error('message niet check'));
    }

    if (message.request === 'getStoredArtist') {
      if (this.typeCheckInputFromScrapers) {
        const hasArtistName = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'artistName');
        const hasSlug = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'slug');
        if (!hasArtistName || !hasSlug) {
          return this.error(Error(`geen artist name of slug. artistName: ${hasArtistName}; slug: ${hasSlug}`));
        }
      }
      return this.getStoredArtist(message.data.artistName, message.data.slug);
    }

    if (message.request === 'getAllowedEvent') {
      if (this.typeCheckInputFromScrapers) {
        const hasTitle = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'title');
        const hasSlug = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'slug');
        if (!hasTitle || !hasSlug) {
          return this.error(Error('geen title of slug om te doorzoeken'));
        } 
      }
      return this.getAllowedEvent(message.data.title, message.data.slug);
    }

    if (message.request === 'getRefused') {
      if (this.typeCheckInputFromScrapers) {
        const hasTitle = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'title');
        const hasSlug = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'slug');
        const hasEventDate = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'eventDate');
        if (!hasTitle || !hasSlug) {
          return this.error(Error('geen title of slug om te doorzoeken'));
        } if (!hasEventDate) {
          return this.error(Error('geen event date'));
        } 
      }
      return this.getRefused(message.data.title, message.data.slug, message.data.eventDate);
    }

    if (message.request === 'hasForbidden') {
      if (this.typeCheckInputFromScrapers) {
        const hasString = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'string');
        if (!hasString) {
          return this.error(Error('geen string om te doorzoeken'));
        } 
      }
      return this.hasForbidden(message.data.string);
    }

    if (message.request === 'hasGood') {
      if (this.typeCheckInputFromScrapers) {
        const hasString = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'string');
        if (!hasString) {
          return this.error(Error('geen string om te doorzoeken'));
        } 
      }
      return this.hasGood(message.data.string);
    }
    
    if (message.request === 'checkExplicitEventCategories') {
      if (this.typeCheckInputFromScrapers) {
        const hasGenres = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'genres');
        if (!hasGenres) {
          return this.error(Error('geen genres om te doorzoeken'));
        } 
      }
      return this.checkExplicitEventCategories(message.data.genres);
    }

    if (message.request === 'getSpotifyConfirmation') {
      if (this.typeCheckInputFromScrapers) {
        const hasTitle = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'title');
        const hasSlug = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'slug');
        const hasEventDate = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'eventDate');
        if (!hasTitle || !hasSlug) {
          return this.error(Error('geen title of slug om te doorzoeken'));
        }  
        if (!hasEventDate) {
          return this.error(Error('geen event date'));
        } 
      }
      const d = message.data;
      return this.getSpotifyConfirmation(d.title, d.slug, d.eventDate);
    }

    if (message.request === 'getMetalEncyclopediaConfirmation') {
      if (this.typeCheckInputFromScrapers) {
        const hasTitle = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'title');
        if (!hasTitle) {
          return this.error(Error('geen title om te doorzoeken'));
        }  
      }
      return this.getMetalEncyclopediaConfirmation(message.data.title);
    }

    if (message.request === 'scanTextForAllowedArtists') {
      if (this.typeCheckInputFromScrapers) {
        const hasTitle = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'title');
        const hasSlug = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'slug');
        if (!hasTitle || !hasSlug) {
          return this.error(Error('geen title of slug om te doorzoeken'));
        } 
      }
      return this.scanTextForAllowedArtists(message.data.title, message.data.slug);
    }

    if (message.request === 'scanTextForRefusedArtists') {
      if (this.typeCheckInputFromScrapers) {
        const hasTitle = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'title');
        const hasSlug = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'slug');
        if (!hasTitle || !hasSlug) {
          return this.error(Error('geen title of slug om te doorzoeken'));
        } 
      }
      return this.scanTextForRefusedArtists(message.data.title, message.data.slug);
    }

    if (message.request === 'scanEventForAllowedArtistsAsync') {
      if (this.typeCheckInputFromScrapers) {
        const hasTitle = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'title');
        const hasSlug = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'slug');
        const hasSettings = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'settings');
        if (!hasTitle || !hasSlug) {
          return this.error(Error('geen title of slug om te doorzoeken'));
        } 
        if (!hasSettings) {
          return this.error(Error('geen settings'));
        } 
      }
      return this.scanEventForAllowedArtistsAsync(
        message.data.title, message.data.slug, message.data?.shortText, message.data.settings);
    }
    
    if (message.request === 'harvestArtists') {
      if (this.typeCheckInputFromScrapers) {
        const hasTitle = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'title');
        const hasSlug = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'slug');
        const hasSettings = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'settings');
        const hasURL = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'venueEventUrl');
        const hasEventDate = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'eventDate');
        if (!hasTitle || !hasSlug) {
          return this.error(Error('geen title of slug om te doorzoeken'));
        } 
        if (!hasSettings) {
          return this.error(Error('geen settings'));
        }
        if (!hasEventDate) {
          return this.error(Error('geen event date'));
        } 
        if (!hasURL) {
          return this.error(Error('geen event url'));
        } 
      }
      const d = message.data;
      return this.harvestArtists(
        d.title, d.slug, d?.shortText, d.settings, d.eventDate, d.venueEventUrl, d?.eventGenres);
    }

    if (message.request === 'APICallsForGenre') {
      if (this.typeCheckInputFromScrapers) {
        const hasTitle = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'title');
        const hasSlug = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'slug');
        if (!hasTitle || !hasSlug) {
          console.log('message:');
          console.log(message);
          return this.error(Error('geen title of slug om te doorzoeken'));
        } 
      }
      return this.APICallsForGenre(message.data.title, message.data.slug);
    }

    if (message.request === 'saveRefusedEventTemp') {
      if (this.typeCheckInputFromScrapers) {
        const hasString = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'string');
        const hasSlug = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'slug');
        const hasEventDate = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'eventDate');
        if (!hasString) {
          return this.error(Error('geen string om op te slaan'));
        }
        if (!hasSlug) {
          return this.error(Error('geen slug om op te slaan'));
        }
        if (!hasEventDate) {
          return this.error(Error('geen eventDate om op te slaan'));
        } 
      }
      return this.saveRefusedEventTemp(
        message.data.string, message.data.slug, message.data.eventDate);
    }    

    if (message.request === 'saveAllowedEventTemp') {
      if (this.typeCheckInputFromScrapers) {
        const hasTitle = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'title');
        const hasSlug = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'slug');
        const hasEventDate = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'eventDate');
        if (!hasTitle) {
          return this.error(Error('geen title om op te slaan'));
        }
        if (!hasSlug) {
          return this.error(Error('geen slug om op te slaan'));
        }
        if (!hasEventDate) {
          return this.error(Error('geen eventDate om op te slaan'));
        } 
      }
      
      return this.saveAllowedEventTemp(message.data.title,
        message.data.slug,
        message.data.eventDate);
    }    

    if (message.request === 'makeSuccess') {
      return this.post({
        success: true,
        data: null,
        reason: `🟩 Gen. success`,
      });
    }

    if (message.request === 'makeFailure') {
      return this.post({
        success: false,
        data: null,
        reason: `🟥 Gen. failure`,
      });
    }

    console.group(`artist db request error`);
    console.log('onbekende request. message:');
    console.log(message);
    console.groupEnd();

    return this.error(new Error(`request ${message.request} onbekend`));
  }
  // #endregion

  // #region GET STORED ARTIST
  /**
   * Kijkt in allowed-artists of daarin letterlijk de artistName of slug als key in voorkomen.
   * @param {*} artistName 
   * @param {*} slug 
   * @returns successMessage met evt. artistData
   */
  getStoredArtist(artistName, slug) {
    const _a = Object.prototype.hasOwnProperty.call(this.allowedArtists, artistName);
    const _b = Object.prototype.hasOwnProperty.call(this.allowedArtists, slug);
    
    if (!_a && !_b) {
      const __a = Object.prototype.hasOwnProperty.call(this.allowedArtistsTemp, artistName);
      const __b = Object.prototype.hasOwnProperty.call(this.allowedArtistsTemp, slug);      
      if (!__a && !__b) {
        return this.post({
          success: false,
          data: null,
          reason: `${artistName} and ${slug} not in allowedArtists aa1`,
        }); 
      }
    }

    const artistData = _a ? this.allowedArtists[artistName] : this.allowedArtists[slug];
    return this.post({
      success: true,
      data: artistData,
      reason: `${_a ? `artistName ${artistName}` : `slug ${slug}`} found aa2`,
    });
  }
  // #endregion

  // #region GET ALLOWED EVENT
  /**
   * kijkt in allowed-events of daarin letterlijk de artistName of slug als key in voorkomen
   * @param {*} eventName 
   * @param {*} slug 
   * @returns successMessage met evt. artistData
   */
  getAllowedEvent(eventName, slug) {
    const _a = Object.prototype.hasOwnProperty.call(this.allowedEvents, eventName);
    const _b = Object.prototype.hasOwnProperty.call(this.allowedEvents, slug);
    
    if (!_a && !_b) {
      const __a = Object.prototype.hasOwnProperty.call(this.allowedEventTemp, eventName);
      const __b = Object.prototype.hasOwnProperty.call(this.allowedEventTemp, slug);
      if (!__a && !__b) {
        return this.post({
          success: null,
          data: null,
          reason: `⬜ ${eventName} and ${slug} not allowed event aa3`,
        }); 
      }
    }

    const eventData = _a ? this.allowedEvents[eventName] : this.allowedEvents[slug];
    return this.post({
      success: true,
      data: eventData,
      reason: `🟩 ${_a ? `eventName ${eventName}` : `slug ${slug}`} allowed event aa4`,
    });
  }  
  // #endregion

  // #region GET REFUSED
  /**
   * kijkt in refused of daarin letterlijk de artistName/title of slug als key in voorkomen
   * @param {*} eventNameOfTitle 
   * @param {*} slug 
   * @returns successMessage met evt. artistData
   */
  getRefused(eventNameOfTitle, slug, eventDate) {
    const tt = eventNameOfTitle.length < this.minLengthLang 
      ? eventNameOfTitle + eventDate : eventNameOfTitle;
    const ss = slug.length < this.minLengthLang ? slug + eventDate : slug;
    
    const _a = Object.prototype.hasOwnProperty.call(this.refused, tt);
    const _b = Object.prototype.hasOwnProperty.call(this.refused, ss);
    
    if (!_a && !_b) {
      const __a = Object.prototype.hasOwnProperty.call(this.refusedTemp, tt);
      const __b = Object.prototype.hasOwnProperty.call(this.refusedTemp, ss);
      if (!__a && !__b) {
        return this.post({
          success: null,
          data: null,
          reason: `⬜ ${tt} and ${ss} not refused aa5`,
        }); 
      }
    }

    const eventOfArtistData = _a ? this.refused[tt] : this.refused[ss];
    return this.post({
      success: true,
      data: eventOfArtistData,
      reason: `🟥 ${_a ? `eventNameOfTitle ${tt}` : `slug ${ss}`} refused aa6`,
    });
  }  
  // #endregion

  // #region HAS FORBIDDEN
  /**
   * vergelijkt string (title, slug, shorttext) met terms.forbidden
   * @param {string} titleslugshorttext 
   * @returns successMessage met evt. artistData
   */
  hasForbidden(stringtitleslugshorttext) {
    const isForbidden = this.terms.forbidden
      .find((forbidden) => stringtitleslugshorttext.includes(forbidden));
    
    if (isForbidden) {
      return this.post({
        success: !!isForbidden,
        data: isForbidden,
        reason: `🟥 ${isForbidden} is forbidden term aa7`,
      });
    }
    return this.post({
      success: null,
      data: isForbidden,
      reason: `⬜ no forbidden term aa8`,
    });
  }  
  // #endregion

  // #region HAS GOOD
  /**
   * vergelijkt string (title, slug, shorttext) met terms.goodCategories
   * @param {string} titleslugshorttext 
   * @returns successMessage met evt. artistData
   */
  hasGood(stringtitleslugshorttext) {
    const isGood = this.terms.goodCategories
      .find((goodCat) => stringtitleslugshorttext.includes(goodCat));
    
    if (isGood) {
      return this.post({
        success: !!isGood,
        data: isGood,
        reason: `🟩 ${isGood} is good term aa9`,
      });
    }
    return this.post({
      success: null,
      data: isGood,
      reason: `⬜ no good term ab1`,
    });
  }    
  // #endregion

  // #region CHECK EXPL. EV. CATS
  /**
   * vergelijkt genre array met terms.goodCategories en terms.forbiddenTerms
   */
  checkExplicitEventCategories(genres) {
    const joinedGenres = genres.join(', ');

    let isGoodFound;
    isGoodFound = this.terms.globalGoodCategories
      .find((goodCat) => joinedGenres.includes(goodCat));

    if (!isGoodFound) {
      isGoodFound = this.terms.goodCategories
        .find((goodCat) => joinedGenres.includes(goodCat));
    }

    if (isGoodFound) {
      const r = `🟩 ${isGoodFound} good in expl. cats. ab2`;
      return this.post({
        success: true,
        data: isGoodFound,
        reason: r,
        reasons:[r],
      });      
    }
    
    let isBadFound;

    isBadFound = this.terms.globalForbiddenGenres
      .find((badCat) => joinedGenres.includes(badCat));

    if (!isBadFound) {
      isBadFound = this.terms.forbidden
        .find((badCat) => joinedGenres.includes(badCat));
    }
    if (isBadFound) {
      this.consoleGroup('SLECHT expliciet genres', { genres, isGoodFound, isBadFound }, `checkExplicitEventCategories`);

      return this.post({
        success: false,
        data: isBadFound,
        reason: `🟥 ${isBadFound} bad in expl. cats. ab3`,
        reasons: [`🟥 ${isBadFound} bad in expl. cats. ab3`],
      });      
    }
    this.consoleGroup('niet gevonden expliciete genres', { genres, isGoodFound, isBadFound }, `checkExplicitEventCategories`);

    return this.post({
      success: null,
      data: null,
      reason: `⬜ No matches. ab4`,
      reasons:[`⬜ No matches. ab4`],
    });
  }    
  // #endregion

  // #region SPOTIFY
  async getSpotifyConfirmation(title, slug, eventDate) {
    if (!this.spotifyAccessToken) {
      await this.getSpotifyAccessToken();
    }
    
    const spotRes = await this.getSpotifyArtistSearch(title);
    
    if (!spotRes) {
      return this.post({
        success: null,
        data: null,
        reason: `⬜ no artists found ab5`,
      });  
    }

    const spotifyGenres = spotRes?.genres ?? [];
    // console.log();
    // console.log(`--------------`);
    // console.log(`gevonden genres om te controleren voor ${title}`);
    // console.log(spotifyGenres);

    const spotifyGenresInForbidden = spotifyGenres.find((sg) => this.terms.forbidden.includes(sg));

    if (spotifyGenresInForbidden) {
      return this.post({
        success: false,
        data: spotifyGenresInForbidden,
        reason: `🟥 spotify vond verboden genre ${spotifyGenresInForbidden} ab10`,
      });        
    }

    const spotifyGenresInGoodCategories = spotifyGenres
      .find((sg) => this.terms.goodCategories.includes(sg));
    
    if (spotifyGenresInGoodCategories) {
      return this.post({
        success: true,
        data: spotifyGenresInGoodCategories,
        reason: `🟩 spotify vond goed genre ${spotifyGenresInGoodCategories} ab11`,
      });        
    }

    // losser zoeken.
    const ietsHardstDan = spotifyGenres.find((sg) => sg.includes('metal'));

    if (ietsHardstDan) {
      return this.post({
        success: true,
        data: ietsHardstDan,
        reason: `🟩 spotify vond niet direct iets maar wel match met metal: ${ietsHardstDan} ab12`,
      });        
    }

    const ietsKutsDan = spotifyGenres
      .find((sg) => this.terms.forbidden.find((forbiddenTerm) => sg.includes(forbiddenTerm)));

    if (ietsKutsDan) {
      return this.post({
        success: false,
        data: ietsKutsDan,
        reason: `🟥 spotify vond niet direct iets maar wel iets kuts: ${ietsKutsDan} ab13`,
      });        
    }    
        
    return this.post({
      success: null,
      data: null,
      reason: `◻️ niets gevonden met spotify ab12`,
    }); 
  }

  async getSpotifyArtistSearch(artist) {
    if (!this.spotifyAccessToken) {
      await this.getSpotifyAccessToken();
    }

    const uriComponent = encodeURIComponent(`artist:${artist}`);
    const url = `https://api.spotify.com/v1/search?q=${uriComponent}&type=artist&offset=0&limit=20&market=NL`;
   
    const fetchResult = 
      await fetch(url, 
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',            
            Authorization: `Bearer ${this.spotifyAccessToken}`,
          }, 
        }).then((response) => response.json())
        .catch((err) => console.error(err));
        
    if (fetchResult?.artists?.items && fetchResult?.artists?.items.length) {
      this.consoleGroup(`meerdere items voor ${artist} gSAS1`, {
        alleArtistItems: fetchResult?.artists?.items,
      }, `getSpotifyArtistSearch`);

      const eersteHitCorrecteNaam = fetchResult?.artists?.items
        .filter((hit) => hit.name.toLowerCase() === artist)
        .filter((hit) => {
          const g = hit.genres.join('; ');
          const isGood = this.terms.goodCategories
            .find((goodCat) => g.includes(goodCat));
          const isBad = this.terms.forbidden
            .find((badCat) => g.includes(badCat));
          if (isBad && isGood) return true;
          if (!isBad && !isGood) return true;
          if (isBad && !isGood) return false;
          return true;
        })[0];
      return eersteHitCorrecteNaam; 
      // todo eerste teruggeven is slordig
    } 
    this.consoleGroup(`geen resultaat voor ${artist} gSAS2`, {
      fetchRes: fetchResult,
    }, `getSpotifyArtistSearch`);      
    
    return null;
  }
  // #endregion

  // #region GET METAL ENC CONF
  async getMetalEncyclopediaConfirmation(title) {
    let titleCopy = `${title}`;
    let metalString = titleCopy.replaceAll(' ', '+');
    const matchLanden = titleCopy.match(/(\(\w{2,3}\))/gi);
    if (Array.isArray(matchLanden)) {
      matchLanden.forEach((m) => {
        let land = m.replace(/\W/g, '').toUpperCase();
        if (land in this.landcodesMap) {
          const repl = RegExp(`\\(${land}\\)`, 'gi');
          
          titleCopy = titleCopy.replaceAll(repl, '').trim();
          if (land.length === 3) {
            land = this.landcodesMap[land];
          }
          metalString += `&country[]=${land}`;
        }
      });
    }

    const metalEncycloAjaxURL = `https://www.metal-archives.com/search/ajax-advanced/searching/bands/?bandName=${metalString}&yearCreationFrom=&yearCreationTo=&status[]=1`;
    
    const meaRes = await fetch(metalEncycloAjaxURL)
      .then((res) => res.json())
      .then((r) => {
        if (!r?.iTotalRecords) return null;
        return r?.aaData[0]; // TODO zomaar de eerste pakken slap
      })
      .catch((err) => {
        console.log('ERROR IN FETSCH');
        console.log(err);
      });

    if (!meaRes) {
      return this.post({
        success: false,
        data: null,
        reason: `🟥 metal enc niet gevonden. ab9`,
      });        
    }
    return this.post({
      success: true,
      data: null,
      reason: `🟩 metal enc gevonden ac1`,
    });
  }

  createFormBody(requestBodyObject) {
    let formBody = [];
    // eslint-disable-next-line no-restricted-syntax, guard-for-in
    for (const property in requestBodyObject) {
      const encodedKey = encodeURIComponent(property);
      const encodedValue = encodeURIComponent(requestBodyObject[property]);
      formBody.push(`${encodedKey}=${encodedValue}`);
    }
    formBody = formBody.join("&");
    return formBody;
  }

  async getSpotifyAccessToken() {
    const requestBody = this.createFormBody({
      grant_type: `client_credentials`,
      client_id: `11bf5090af7b42848c20124d8c83fda3`,
      client_secret: `55f3635cd31d4d97a47af46c51f20443`,
    });
  
    const fetchResult = await fetch("https://accounts.spotify.com/api/token", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: requestBody,
    }).then((response) => response.json())
      .catch((err) => console.error(err));
  
    if (fetchResult?.access_token) {
      this.spotifyAccessToken = fetchResult.access_token;
      return true;
    } 
    console.log(`err fetching access token!`);
    console.log(fetchResult);
    throw Error(`fetch result no access token`);
  }

  // #endregion
    
  /**
   * abstracte functie gedeeld door scanTextForAllowedArtists en zn broer
   * @param {*} eventNameOfTitle 
   * @param {*} slug 
   * @param {*} artistList 
   * @returns 
   */
  scanTextForSomeArtistList(eventNameOfTitle, slug, artistList) {
    const toScan = eventNameOfTitle.replaceAll(/\(.*\)/g, ''); // (usa etc eruit);
    const haystack = Object.keys(artistList);
    
    this.consoleGroup(`\nscanTextForAllowedArtists 1`, {
      toScan,
      slug,
      
    }, 'scanTextForSomeArtistList');
    
    const gevondenKeys = haystack
      .filter((hay) => toScan.includes(hay) || slug.includes(hay));
    
    this.consoleGroup(`scanTextForSomeArtistList gevonden keys`, { gevondenKeys }, 'scanTextForSomeArtistList');
    
    if (!gevondenKeys || !gevondenKeys.length) {
      return {};
    }

    const allowedArtists = {};
    gevondenKeys.forEach((key) => {
      allowedArtists[key] = this.allowedArtists[key];
    });

    if (gevondenKeys.length === 2) {
      const key1 = gevondenKeys[0];
      const key2 = gevondenKeys[1];
      const isSlug1 = allowedArtists[key1][0];
      const isSlug2 = allowedArtists[key2][0];
      const eenSlugAnderNiet = isSlug1 + isSlug2 === 1;
      if (eenSlugAnderNiet) {
        let winKey;
        if (isSlug1) {
          winKey = key2;
        } else {
          winKey = key1;
        }
        const winnaar = allowedArtists[winKey];
        const r = {
          [`${winKey}`]: winnaar,
        };
    
        this.consoleGroup(`\nscanTextForSomeArtistList twee keys gevonden waarvan één slug. return:`, 
          { gevonden: r }, 
          'scanTextForSomeArtistList');
        
        return r;
      }
    }

    // metalEncyclo is gelijk bij title & slug
    const metalEncycloKeys = [];
    const gefilterdeAllowedArtistsKeys = [];
    gevondenKeys.forEach((key) => {
      if (!allowedArtists[key][2]) return;
      if (metalEncycloKeys.includes(allowedArtists[key][2])) return;
      metalEncycloKeys.push(allowedArtists[key][2]);
      gefilterdeAllowedArtistsKeys.push(key);
    });

    const gefilterdeAllowedArtists = {};
    gefilterdeAllowedArtistsKeys.forEach((key) => {
      gefilterdeAllowedArtists[key] = allowedArtists[key];
    });
    
    this.consoleGroup(`\nscanTextForAllowedArtists na metal Enc; ret gefilderdeAllowedArtists:`, 
      { gefilterdeAllowedArtists }, 
      'scanTextForAllowedArtists');
    
    return gefilterdeAllowedArtists;
  }

  // #region SCAN FOR OK ARTISTS
  /**
   * scant eventNameOfTitle en slug op match met allowed artists
   * @param {*} eventNameOfTitle 
   * @param {*} slug 
   * @returns array met key:artiest
   */
  scanTextForAllowedArtists(eventNameOfTitle, slug) {
    return this.scanTextForSomeArtistList(eventNameOfTitle, slug, this.allowedArtistsTemp);
  }

  // #region SCAN FOR OK ARTISTS
  /**
   * scant eventNameOfTitle en slug op match met allowed artists
   * @param {*} eventNameOfTitle 
   * @param {*} slug 
   * @returns array met key:artiest
   */
  scanTextForRefusedArtists(eventNameOfTitle, slug) {
    return this.scanTextForSomeArtistList(eventNameOfTitle, slug, this.refusedTemp);
  }
 
  async scanEventForAllowedArtistsAsync(eventNameOfTitle, slug, shortText, settings) {
    let toScan = eventNameOfTitle; 
    if (settings.artistsIn.includes('shortText') && shortText) {
      const s = (shortText ?? '').toLowerCase();
      toScan = `${toScan}
      ${s}`;
    }    
    const artists = this.scanTextForAllowedArtists(toScan, slug);
    const workedArtists = {};

    const artistsFound = Object.keys(artists).length;
    if (artistsFound) {
      Object.entries(artists).forEach(([key, values]) => {
        workedArtists[key] = {
          s: values[1],
          l: values[2],
          g: values[3],
        };
      });
    }

    return this.post({
      success: artistsFound > 0 ? true : null,
      data: workedArtists,
      reason: artistsFound > 0 
        ? `🟩 ${artistsFound} allowed artists found: ${Object.keys(artists).join(', ')} ac3` 
        : `⬜ no artists found ac4`,
    });
  }

  async scanEventForRefusedArtistsAsync(eventNameOfTitle, slug, shortText, settings) {
    let toScan = eventNameOfTitle; 
    if (settings.artistsIn.includes('shortText') && shortText) {
      const s = (shortText ?? '').toLowerCase();
      toScan = `${toScan}
      ${s}`;
    }    
    const artists = this.scanTextForRefusedArtists(toScan, slug);
    const workedArtists = {};

    const artistsFound = Object.keys(artists).length;
    if (artistsFound) {
      Object.entries(artists).forEach(([key, values]) => {
        workedArtists[key] = {
          s: values[1],
          l: values[2],
          g: values[3],
        };
      });
    }

    return this.post({
      success: artistsFound > 0 ? true : null,
      data: workedArtists,
      reason: artistsFound > 0 
        ? `🟩 ${artistsFound} refused artists found: ${Object.keys(artists).join(', ')} aqwe3` 
        : `⬜ no artists found aqwe4`,
    });
  }
  // #endregion 

  // #region API CALL FOR GENRE
  async recursiveAPICallForGenre(lijst, resultaten = []) {
    const deze = lijst.shift();
    const APICallsRes = await this.APICallsForGenre(deze.workTitle, deze.slug);
    resultaten.push({
      title: deze.workTitle,
      slug: deze.slug,
      resultaten: APICallsRes,
    });
    
    if (lijst.length) {
      return this.recursiveAPICallForGenre(lijst, resultaten);
    }
    return resultaten;
  }  
  
  /**
   * kijkt in refused of daarin letterlijk de artistName/title of slug als key in voorkomen
   * @param {*} eventNameOfTitle 
   * @param {*} slug 
   * @returns successMessage met evt. artistData
   */
  async APICallsForGenre(eventNameOfTitle, slug) {
    if (!this.spotifyAccessToken) {
      await this.getSpotifyAccessToken();
    }

    // eerst even kijken of ie niet al op zichzelf wel geweigerd was
    const _a = Object.prototype.hasOwnProperty.call(this.refused, eventNameOfTitle);
    const _b = Object.prototype.hasOwnProperty.call(this.refused, slug);

    const genreRes = {
      title: eventNameOfTitle,
      slug,
      land: null,
    };
    
    if (_a || _b) {
      return {
        metalEnc: null,
      }; 
    }

    let titleCopy = `${eventNameOfTitle}`;
    let metalString = titleCopy.replaceAll(' ', '+');
    const matchLanden = titleCopy.match(/(\(\w{2,3}\))/gi);
    if (Array.isArray(matchLanden)) {
      matchLanden.forEach((m) => {
        let land = m.replace(/\W/g, '').toUpperCase();
        if (land in this.landcodesMap) {
          const repl = RegExp(`\\(${land}\\)`, 'gi');
          
          titleCopy = titleCopy.replaceAll(repl, '').trim();
          if (land.length === 3) {
            land = this.landcodesMap[land];
          }
          genreRes.land = land;
          metalString += `&country[]=${land}`;
        }
      });
    }

    const metalEncycloAjaxURL = `https://www.metal-archives.com/search/ajax-advanced/searching/bands/?bandName=${metalString}&yearCreationFrom=&yearCreationTo=&status[]=1`;
    
    genreRes.metalEnc = await fetch(metalEncycloAjaxURL)
      .then((res) => res.json())
      .then((r) => {
        if (!r?.iTotalRecords) return null;

        const correcteRij = (r?.aaData ?? []).find((rij) => {
          const rijNaam = rij[0].toLowerCase().replaceAll(/_/g, ' ');
          return rijNaam.includes(eventNameOfTitle) || rijNaam.includes(eventNameOfTitle);
        });
        correcteRij[1] = correcteRij[1].toLowerCase().split(/[;\/]/);

        return correcteRij;
      })
      .catch((err) => {
        console.log(`probleem met metal enc. fetch voor ${eventNameOfTitle} naar \n${metalEncycloAjaxURL}`);
        console.log(genreRes);
        return this.error(err);
      });

    genreRes.spotRes = await this.getSpotifyArtistSearch(eventNameOfTitle);
    if (genreRes?.spotRes?.external_urls) delete genreRes.spotRes.external_urls;
    if (genreRes?.spotRes?.followers) delete genreRes.spotRes.followers;
    if (genreRes?.spotRes?.images) delete genreRes.spotRes.images;
    if (genreRes?.spotRes?.popularity) delete genreRes.spotRes.popularity;
    if (genreRes?.spotRes?.type) delete genreRes.spotRes.type;

    return genreRes;
  }
  // #endregion

  // #region SAVE REFUSED ALLOWED EVENTS

  saveRefusedEventTemp(title, slug, eventDate) {
    const tt = title.length < this.minLengthLang ? title + eventDate : title;
    const ss = slug.length < this.minLengthLang ? slug + eventDate : slug;
    this.refusedTemp[tt] = [0, eventDate, this.today];
    if (tt !== ss) {
      this.refusedTemp[ss] = [1, eventDate, this.today]; 
    }
    return this.post({
      success: true,
      data: null,
      reason: `🟩 save worked`,
    });
  }

  saveAllowedEventTemp(title, slug, eventDate) {
    const tt = title.length < this.minLengthLang ? title + eventDate : title;
    const ss = slug.length < this.minLengthLang ? slug + eventDate : slug;
    this.allowedEventTemp[tt] = [0, eventDate, this.today];
    if (tt !== ss) {
      this.allowedEventTemp[ss] = [1, eventDate, this.today]; 
    }
    return this.post({
      success: true,
      data: null,
      reason: `🟩 save worked`,
    });
  }

  saveAllowedTemp(title, slug, spotify, metalEnc, genres, eventDate) {
    const tt = title.length < this.minLengthKort ? title + eventDate : title;
    const ss = slug.length < this.minLengthKort ? slug + eventDate : slug;
    this.allowedArtistsTemp[tt] = [0, spotify, metalEnc, genres, eventDate, this.today];
    if (tt !== ss) {
      this.allowedArtistsTemp[ss] = [1, spotify, metalEnc, genres, eventDate, this.today];
    }
    return this.post({
      success: true,
      data: null,
      reason: `🟩 save worked`,
    });
  }

  fromArrayToTwoColumnRows(a, i) {
    let b = a.length > 20 
      ? `${a.substring(0, 14)}..${a.substring(a.length - 4, a.length)}`
      : a;
    b = b.padEnd(24, ' ');
    if (i % 3 === 0 && i > 0) {
      return `${b}\r`;
    }
    if (i === 0) {
      return `\n${b}`;
    }
    return b;
  }

  persistNewRefusedAndRockArtists() {
    const artistKeys = Object
      .entries(this.allowedArtistsTemp)
      .map(([key, value]) => {
        if (value[0] === 1) return key;
        return false;
      }).filter((a) => a);
    const eventsKeys = Object
      .entries(this.allowedEventTemp)
      .map(([key, value]) => {
        if (value[0] === 1) return key;
        return false;
      }).filter((a) => a);
    const refusedKeys = Object
      .entries(this.refusedTemp)
      .map(([key, value]) => {
        if (value[0] === 1) return key;
        return false;
      }).filter((a) => a);
    const unclearArtistsKeys = Object
      .entries(this.unclearArtistsTemp)
      .map(([key, value]) => {
        if (value[0] === 1) return key;
        return false;
      }).filter((a) => a);
    this.consoleGroup(`artists, events, refused pNRARA1`, {
      artists: `${artistKeys.map(this.fromArrayToTwoColumnRows).join(' ')}\n`,
      events: `${eventsKeys.map(this.fromArrayToTwoColumnRows).join(' ')}\n`,
      refused: `${refusedKeys.map(this.fromArrayToTwoColumnRows).join(' ')}\n`,
      unclearArtists: `${unclearArtistsKeys.map(this.fromArrayToTwoColumnRows).join(' ')}\n`,
    }, 'persistNewRefusedAndRockArtists', 'fggreen');
    
    this.consoleGroup('new artists data pNRARA2', this.allowedArtistsTemp, 'persistNewRefusedAndRockArtists', 'fggreen');
    
    if (!this.storeWritePermission) {
      if (this.funcsToDebug.persistNewRefusedAndRockArtists) {
        console.log('\x1b[33m%s\x1b[0m', '//////////////////');
        console.log('----------------------');
        console.log('\x1b[36m%s\x1b[0m', 'LET OP');
        console.log('\x1b[36m%s\x1b[0m', 'de artiesten DB schrijft nog niet');
        console.log('---------------------------');
        console.log('\x1b[33m%s\x1b[0m', '//////////////////');
      }
      return;
    } 
    Object.entries(this.allowedArtistsTemp).forEach(([key, values]) => {
      if (this.allowedArtists[key]) {
        const nieuweRecord = [...this.allowedArtists[key]];
        if (values[1]) {
          nieuweRecord[1] = values[1];
        }
        if (values[2]) {
          nieuweRecord[2] = values[2];
        }
        if (values[3]) {
          nieuweRecord[3] = values[3];
        }
        if (values[4]) {
          nieuweRecord[4] = values[4];
        }
        if (values[5]) {
          nieuweRecord[5] = values[5];
        }
        this.allowedArtists[key] = nieuweRecord;
        return;
      } 
      this.allowedArtists[key] = values;
    });    

    Object.entries(this.refusedTemp).forEach(([key, values]) => {
      if (this.refused[key]) {
        const nieuweRecord = [...this.refused[key]];
        if (values[1]) {
          nieuweRecord[1] = values[1];
        }
        if (values[2]) {
          nieuweRecord[2] = values[2];
        }
        if (values[3]) {
          nieuweRecord[3] = values[3];
        }
        
        this.refused[key] = nieuweRecord;
        return;
      } 
      this.refused[key] = values;
    });

    Object.entries(this.allowedEventTemp).forEach(([key, values]) => {
      if (this.allowedEvents[key]) {
        const nieuweRecord = [...this.allowedEvents[key]];
        if (values[1]) {
          nieuweRecord[1] = values[1];
        }
        if (values[2]) {
          nieuweRecord[2] = values[2];
        }
        if (values[3]) {
          nieuweRecord[3] = values[3];
        }
        
        this.allowedEvents[key] = nieuweRecord;
        return;
      } 
      this.allowedEvents[key] = values;
    });

    Object.entries(this.unclearArtistsTemp).forEach(([key, values]) => {
      if (this.unclearArtists[key]) {
        const nieuweRecord = [...this.unclearArtists[key]];
        if (values[1]) {
          nieuweRecord[1] = values[1];
        }
        if (values[2]) {
          nieuweRecord[2] = values[2];
        }
        if (values[3]) {
          nieuweRecord[3] = values[3];
        }
        
        this.unclearArtists[key] = nieuweRecord;
        return;
      } 
      this.unclearArtists[key] = values;
    });
    
    fs.writeFileSync(`${this.storePath}/refused.json`, JSON.stringify(this.refused, null, 2), 'utf-8');
    fs.writeFileSync(`${this.storePath}/allowed-artists.json`, JSON.stringify(this.allowedArtists, null, 2), 'utf-8');
    fs.writeFileSync(`${this.storePath}/allowed-events.json`, JSON.stringify(this.allowedEvents, null, 2), 'utf-8');
    fs.writeFileSync(`${this.storePath}/unclear-artists.json`, JSON.stringify(this.unclearArtists, null, 2), 'utf-8');
  }

  // #endregion

  // #region ERR, POST, CONSGROUP
  /**
   * Verpakt een error in het 'type' van de messages.
   * @param {Error} err 
   * @returns {success:string,data:object,reason:string}
   */
  error(err) {
    return this.post({
      success: 'error',
      data: {
        error: err,
      },
      reason: err.message,
    });
  }

  post(message, consoleMessage = false) {
    const hasSuccess = Object.prototype.hasOwnProperty.call(message, 'success');
    const hasData = Object.prototype.hasOwnProperty.call(message, 'data');
    const hasReason = Object.prototype.hasOwnProperty.call(message, 'reason');
    if (consoleMessage) {
      console.log(message);
    }
    if (hasSuccess && hasData && hasReason) {
      return JSON.stringify(message);
    } 
    console.log(message);
    throw Error('message corrupt');
  }

  consoleGroup(title, toConsole, funcNaam = '', kleur = 'fgwhite') {
    if (!this.funcsToDebug[funcNaam]) return;
    const titelKleur = consoleKleuren[kleur];
    console.group(titelKleur, `\n${title} ${funcNaam.padStart(80 - title.length, ' * ')}`);
    if (toConsole !== null && typeof toConsole === 'object') {
      const keys = Object.keys(toConsole);
      // eslint-disable-next-line no-plusplus
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (typeof toConsole[k] === 'string') {
          console.log('\x1b[33m%s\x1b[0m', `${k}: ${toConsole[k]}`);
        } else {
          console.log('\x1b[33m%s\x1b[0m', k);
          console.log(toConsole[k]);
        }
      }
    }
    console.groupEnd();
  }
  // #endregion
}
