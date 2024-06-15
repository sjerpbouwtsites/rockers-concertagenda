/* eslint-disable no-console */
import fs from 'fs';
import terms from '../store/terms.js';
import { slugify } from "../../scrapers/gedeeld/slug.js";

// console.log(util.inspect(na, 
//   { showHidden: false, depth: null, colors: true })); 

export default class Artists {
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
   * Twee weg referentie zoals {USA: US, US: USA}
   * tbv country info uit titels halen
   */
  landcodesMap;

  terms = terms;

  today = null;

  spotifyAccessToken = null;

  /**
   * of in die persistentie functie fs write file
   */
  nietSchrijven = true;

  constructor(conf) {
    this.modelPath = conf.modelPath;
    this.storePath = conf.storePath;
    this.refused = JSON.parse(fs.readFileSync(`${this.storePath}/refused.json`));
    this.allowedArtists = JSON.parse(fs.readFileSync(`${this.storePath}/allowed-artists.json`));
    this.allowedEvents = JSON.parse(fs.readFileSync(`${this.storePath}/allowed-events.json`));
    this.landcodesMap = JSON.parse(fs.readFileSync(`${this.storePath}/landcodes-map.json`));
    this.today = (new Date()).toISOString().substring(2, this.minLengthLang).replaceAll('-', '');
    this.getSpotifyAccessToken();
  }

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

    if (message.request === 'scanTitleForAllowedArtists') {
      if (this.typeCheckInputFromScrapers) {
        const hasTitle = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'title');
        const hasSlug = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'slug');
        if (!hasTitle || !hasSlug) {
          return this.error(Error('geen title of slug om te doorzoeken'));
        } 
      }
      return this.scanTitleForAllowedArtists(message.data.title, message.data.slug);
    }

    if (message.request === 'scanTitleForAllowedArtistsAsync') {
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
      return this.scanTitleForAllowedArtistsAsync(
        message.data.title, message.data.slug, message.data?.shortText, message.data.settings);
    }
    
    if (message.request === 'harvestArtists') {
      if (this.typeCheckInputFromScrapers) {
        const hasTitle = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'title');
        const hasSlug = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'slug');
        const hasSettings = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'settings');
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
      }
      const d = message.data;
      return this.harvestArtists(
        d.title, d.slug, d?.shortText, d.settings, d.eventDate, d?.eventGenres);
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
      return this.saveRefusedEventTemp(message.data.string, message.data.eventDate);
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

    return this.error(new Error(`request ${message.request} onbekend`));
  }

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

  /**
   * kijkt in refused of daarin letterlijk de artistName/title of slug als key in voorkomen
   * @param {*} eventNameOfTitle 
   * @param {*} slug 
   * @returns successMessage met evt. artistData
   */
  getRefused(eventNameOfTitle, slug, eventDate) {
    const tt = eventNameOfTitle.length < this.minLengthLang ? eventNameOfTitle + eventDate : eventNameOfTitle;
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

  /**
   * vergelijkt genre array met terms.goodCategories en terms.forbiddenTerms
   */
  checkExplicitEventCategories(genres) {
    const joinedGenres = genres.join(', ');

    let isGood;
    isGood = this.terms.globalGoodCategories
      .find((goodCat) => joinedGenres.includes(goodCat));

    if (!isGood) {
      isGood = this.terms.goodCategories
        .find((goodCat) => joinedGenres.includes(goodCat));
    }

    if (isGood) {
      const r = `🟩 ${isGood} good in expl. cats. ab2`;
      return this.post({
        success: true,
        data: isGood,
        reason: r,
        reasons:[r],
      });      
    }
    
    let isBad;

    isBad = this.terms.globalForbiddenGenres
      .find((badCat) => joinedGenres.includes(badCat));

    if (!isBad) {
      isBad = this.terms.forbidden
        .find((badCat) => joinedGenres.includes(badCat));
    }
    if (isBad) {
      console.log('is SLECHT expliciet genres');
      const r = `🟥 ${isBad} bad in expl. cats. ab3`;
      return this.post({
        success: false,
        data: isBad,
        reason: r,
        reasons: [r],
      });      
    }
    console.log('niet gevonden expliciete genres');
    const r = `⬜ No matches. ab4`;
    return this.post({
      success: null,
      data: null,
      reason: r,
      reasons:[r],
    });
  }    

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
    
    const heeftVerbodenTermen1 = this.terms.forbidden
      .find((ft) => spotifyGenres.find((sg) => sg.includes(ft) || ft.includes(sg)));
    const heeftVerbodenTermen = heeftVerbodenTermen1 && (heeftVerbodenTermen1 !== 'undefined' && typeof heeftVerbodenTermen1 !== 'undefined');
    
    const heeftGoedeTermen1 = this.terms.goodCategories
      .find((ft) => spotifyGenres.find((sg) => sg.includes(ft) || ft.includes(sg)));

    const heeftGoedeTermen = heeftGoedeTermen1 && (heeftGoedeTermen1 !== 'undefined' && typeof heeftGoedeTermen1 !== 'undefined');
        
    if (heeftVerbodenTermen) {
      if (heeftGoedeTermen) {
        return this.post({
          success: true,
          data: heeftGoedeTermen,
          reason: `🟩 spotify verboden genre ${heeftVerbodenTermen} ook goede term ${heeftGoedeTermen} ab6`,
        });
      }
 
      return this.post({
        success: false,
        data: heeftVerbodenTermen,
        reason: `🟥 spotify verboden genre ${heeftVerbodenTermen} maar geen goede termen ab7`,
      });    
    }
    
    return this.post({
      success: null,
      data: heeftGoedeTermen,
      reason: `⬜ geen spotify verboden of goede genres ab8`,
    });    
  }

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

  async harvestArtists(title, slug, shortText, settings, eventDate, eventGenres = []) {
    const reg = new RegExp(settings.dividerRex, 'i');
    let toScan = title; 
    if (settings.artistsIn.includes('shortText') && shortText) {
      const s = (shortText ?? '').toLowerCase();
      toScan = `${toScan} + ${s}`;
    }
    const reedsGevonden = this.scanTitleForAllowedArtists(toScan, slug);

    let verderScannen = toScan;
    Object.keys(reedsGevonden).forEach((rg) => {
      verderScannen = verderScannen.replace(rg, '');
    });
    verderScannen = verderScannen.trim();
    let overigeTitels = [];
    if (verderScannen) {
      overigeTitels = verderScannen.split(reg)
        .map((t) => t.trim())
        .filter((a) => a)
        .map((t) => slugify(t));

      if (overigeTitels.length) {
        const nieuweArtiesten = await this.recursiveAPICallForGenre(overigeTitels, []);
        nieuweArtiesten
          .filter((a) => (a.resultaten?.spotRes ?? null) || (a.resultaten?.metalEnc ?? null))
          .forEach((na) => {
            const spotify = na.resultaten?.spotRes?.id ?? null;
            const sGenres = na.resultaten?.spotRes?.genres ?? [];
            const heeftMetalEnc = Array.isArray(na.resultaten?.metalEnc);
            const mGenres = heeftMetalEnc ? na.resultaten?.metalEnc[1].split(';').map((a) => a.replace(/\(.*\)/, '').trim().toLowerCase()) ?? [] : [];
            const genres = [...sGenres, ...mGenres, ...eventGenres];
            const land = heeftMetalEnc ? na.resultaten?.metalEnc[2] ?? null : null;
  
            const eerstGefilterdeGenres = genres
              .filter((g) => !this.terms.globalForbiddenGenres.find((gfg) => g.includes(gfg)));
            const tweedeGefilterdeGenres = eerstGefilterdeGenres
              .filter((g) => !this.terms.forbidden.includes(g));
            const heeftHeelGoedGenre = genres
              .filter((g) => !this.terms.globalGoodCategories.find((gfg) => g.includes(gfg)));
            const heeftGoedeGenres = genres
              .filter((g) => !this.terms.goodCategories.find((gfg) => g.includes(gfg)));

            if (tweedeGefilterdeGenres.length || heeftHeelGoedGenre) {
              this.saveAllowedTemp(na.title, na.slug, spotify, land, genres, eventDate); // TODO GAAT DIT DE GOEDE KANT OP?
            } else if (heeftGoedeGenres.length > tweedeGefilterdeGenres) {
              this.saveAllowedTemp(na.title, na.slug, spotify, land, genres, eventDate);
            } else {
              this.saveRefusedTemp(na.title, na.slug, spotify, land, eventDate);
            }
          });
      }
    }

    console.log('harvest klaar');

    return this.post({
      success: true,
      data: 'niets',
      reason: `succesvolle harvest ac2`,
    });
  }

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

    const genreRes = {};
    
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
        console.log(`probleem met metal enc. fetch voor ${eventNameOfTitle} naar \n${metalEncycloAjaxURL}`);
        console.log(meaRes);
        return this.error(err);
      });

    genreRes.metalEnc = meaRes;

    genreRes.spotRes = await this.getSpotifyArtistSearch(eventNameOfTitle);
    
    return genreRes;
  }
    
  /**
   * scant eventNameOfTitle en slug op match met allowed artists
   * @param {*} eventNameOfTitle 
   * @param {*} slug 
   * @returns array met key:artiest
   */
  scanTitleForAllowedArtists(eventNameOfTitle, slug) {
    const haystack = Object.keys(this.allowedArtists);
    // console.log();
    // console.log('-----------------');
    // console.log('eventNameOfTitle, slug');
    console.log(eventNameOfTitle, slug);
    
    const gevondenKeys = haystack
      .filter((hay) => eventNameOfTitle.includes(hay) || slug.includes(hay));
    // console.log('gevondenKeys');
    // console.log(gevondenKeys);
    
    if (!gevondenKeys || !gevondenKeys.length) {
      return {};
    }
    
    if (gevondenKeys.length === 1) {
      const k = gevondenKeys[0];
      const artist = this.allowedArtists[k];
      // console.log('een key gevonden. return:');
      // console.log({
      //   [`${k}`]: artist,
      // });
      return {
        [`${k}`]: artist,
      };
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
        // console.log('twee keys gevonden waarvan één slug. return:');
        // console.log({
        //   [`${winKey}`]: winnaar,
        // });
        return {
          [`${winKey}`]: winnaar,
        };
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
    
    return gefilterdeAllowedArtists;
  } 

  async scanTitleForAllowedArtistsAsync(eventNameOfTitle, slug, shortText, settings) {
    let toScan = eventNameOfTitle; 
    if (settings.artistsIn.includes('shortText') && shortText) {
      const s = (shortText ?? '').toLowerCase();
      toScan = `${toScan} + ${s}`;
    }    
    const artists = this.scanTitleForAllowedArtists(toScan, slug);
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
        ? `🟩 ${artistsFound} artists found ac3` 
        : `⬜ no artists found ac4`,
    });
  }

  saveRefusedEventTemp(title, slug, eventDate) {
    const tt = title.length < this.minLengthLang ? title + eventDate : title;
    const ss = slug.length < this.minLengthLang ? slug + eventDate : slug;
    this.refusedTemp[tt] = [0, null, null, eventDate, this.today];
    if (tt !== ss) {
      this.refusedTemp[ss] = [1, null, null, eventDate, this.today]; 
    }
    return this.post({
      success: true,
      data: null,
      reason: `🟩 save worked`,
    });
  }

  saveRefusedTemp(title, slug, spotify, metalEnc, eventDate) {
    console.log(`save refused temp met ${title}`);
    const tt = title.length < this.minLengthLang ? title + eventDate : title;
    const ss = slug.length < this.minLengthLang ? slug + eventDate : slug;
    this.refusedTemp[tt] = [0, spotify, metalEnc, eventDate, this.today];
    if (tt !== ss) {
      console.log(`${title} nieuw op de lijst`);
      this.refusedTemp[ss] = [1, spotify, metalEnc, eventDate, this.today]; 
    } else {
      console.log(`${title} NIET de lijst`);
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

  persistNewRefusedAndRockArtists() {
    console.log(`new artists`);
    console.log(Object.keys(this.allowedArtistsTemp));
    console.log(`new events`);
    console.log(Object.keys(this.allowedEventTemp));
    console.log(`new refused`);
    console.log(Object.keys(this.refusedTemp));

    if (this.nietSchrijven) {
      console.log('\x1b[33m%s\x1b[0m', '//////////////////');
      console.log('----------------------');
      console.log('\x1b[36m%s\x1b[0m', 'LET OP');
      console.log('\x1b[36m%s\x1b[0m', 'de artiesten DB schrijft nog niet');
      console.log('---------------------------');
      console.log('\x1b[33m%s\x1b[0m', '//////////////////');
      return;
    } 
    console.log(`artiesten worden opgeslagen`);

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
        nieuweRecord[5] = this.today;
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
        nieuweRecord[2] = this.today;
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
        nieuweRecord[2] = this.today;
        this.allowedEvents[key] = nieuweRecord;
        return;
      } 
      this.allowedEvents[key] = values;
    });
    
    fs.writeFileSync(`${this.storePath}/refused.json`, JSON.stringify(this.refused, null, 2), 'utf-8');
    fs.writeFileSync(`${this.storePath}/allowed-artists.json`, JSON.stringify(this.allowedArtists, null, 2), 'utf-8');
    fs.writeFileSync(`${this.storePath}/allowed-events.json`, JSON.stringify(this.allowedEvents, null, 2), 'utf-8');
  }

  async getSpotifyArtistSearch(artist) {
    if (!this.spotifyAccessToken) {
      await this.getSpotifyAccessToken();
    }

    // console.log();
    // console.log('--------------');

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
      // console.log(`meerdere items voor ${artist}, dit is de eerste item: `);
      // console.log(fetchResult?.artists?.items[0]);
      const eersteHitCorrecteNaam = fetchResult?.artists?.items
        .filter((hit) => hit.name.toLowerCase() === artist)[0];
      return eersteHitCorrecteNaam; 
      // todo eerste teruggeven is slordig
    } if (fetchResult?.artists) {
      // console.log(`geen meerdere items maar wel resultaat voor artist ${artist}`);
      // console.log(fetchResult?.artists);
      return fetchResult?.artists?.items[0];
    }
    // console.log(`geen resultaat uberhaupt voor ${artist}`);
    return null;
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
}
