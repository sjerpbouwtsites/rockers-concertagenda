/* eslint-disable no-console */
import fs from 'fs';
import util from 'util';
import terms from '../store/terms.js';
import { slugify } from "../../scrapers/gedeeld/slug.js";

export default class Artists {
  typeCheckInputFromScrapers = true;

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

  constructor(conf) {
    this.modelPath = conf.modelPath;
    this.storePath = conf.storePath;
    this.refused = JSON.parse(fs.readFileSync(`${this.storePath}/refused.json`));
    this.allowedArtists = JSON.parse(fs.readFileSync(`${this.storePath}/allowed-artists.json`));
    this.allowedEvents = JSON.parse(fs.readFileSync(`${this.storePath}/allowed-events.json`));
    this.landcodesMap = JSON.parse(fs.readFileSync(`${this.storePath}/landcodes-map.json`));
    this.today = (new Date()).toISOString().substring(2, 10).replaceAll('-', '');
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
   * Voorman van de class. message.request heeft de naam van een functie hier
   * 'do' stuurt die functie aan en returned het resultaat. Controleert ook of 
   * message.data wel de voor die functie vereiste 'type' heeft.
   * @param {request:string, data:object} message  
   * @returns {success:boolean|string,reason:string,data:object} -> ALS JSON!
   */
  async do(message) {
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
        if (!hasTitle || !hasSlug) {
          return this.error(Error('geen title of slug om te doorzoeken'));
        } 
      }
      return this.getRefused(message.data.title, message.data.slug);
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
      return this.harvestArtists(
        message.data.title, message.data.slug, message.data.settings, message.data.eventDate);
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

    // if (message.request === 'saveRefusedTitle') {
    //   const hasString = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'string');
    //   if (!hasString) {
    //     return this.error(Error('geen string om op te slaan'));
    //   }
    //   return this.saveRefusedTitle(message.data.string, message.data?.reason);
    // }

    // if (message.request === 'saveAllowedTitle') {
    //   const hasString = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'string');
    //   if (!hasString) {
    //     return this.error(Error('geen string om op te slaan'));
    //   }
    //   return this.saveAllowedTitle(message.data.string, message.data?.reason);
    // }

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
      return this.post({
        success: false,
        data: null,
        reason: `${artistName} and ${slug} not in allowedArtists`,
      }); 
    }

    const artistData = _a ? this.allowedArtists[artistName] : this.allowedArtists[slug];
    return this.post({
      success: true,
      data: artistData,
      reason: `${_a ? `artistName ${artistName}` : `slug ${slug}`} found`,
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
      return this.post({
        success: false,
        data: null,
        reason: `🟥 ${eventName} and ${slug} not allowed event`,
      }); 
    }

    const eventData = _a ? this.allowedEvents[eventName] : this.allowedEvents[slug];
    return this.post({
      success: true,
      data: eventData,
      reason: `🟩 ${_a ? `eventName ${eventName}` : `slug ${slug}`} allowed event`,
    });
  }  

  /**
   * kijkt in refused of daarin letterlijk de artistName/title of slug als key in voorkomen
   * @param {*} eventNameOfTitle 
   * @param {*} slug 
   * @returns successMessage met evt. artistData
   */
  getRefused(eventNameOfTitle, slug) {
    const _a = Object.prototype.hasOwnProperty.call(this.refused, eventNameOfTitle);
    const _b = Object.prototype.hasOwnProperty.call(this.refused, slug);
    
    if (!_a && !_b) {
      return this.post({
        success: false,
        data: null,
        reason: `🟩 ${eventNameOfTitle} and ${slug} not refused`,
      }); 
    }

    const eventOfArtistData = _a ? this.refused[eventNameOfTitle] : this.refused[slug];
    return this.post({
      success: true,
      data: eventOfArtistData,
      reason: `🟥 ${_a ? `eventNameOfTitle ${eventNameOfTitle}` : `slug ${slug}`} refused`,
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
        reason: `🟥 ${isForbidden} is forbidden term`,
      });
    }
    return this.post({
      success: !!isForbidden,
      data: isForbidden,
      reason: `🟩 no forbidden term`,
    });
  }  

  async harvestArtists(title, slug, settings, eventDate) {
    const reg = new RegExp(settings.dividerRex, 'i');
    // console.log(`///////////////////////`);
    console.log(`checking ${title}`);
    const reedsGevonden = this.scanTitleForAllowedArtists(title, slug);

    let titleVerderZoeken = title;
    Object.keys(reedsGevonden).forEach((rg) => {
      titleVerderZoeken = titleVerderZoeken.replace(rg, '');
    });
    titleVerderZoeken = titleVerderZoeken.trim();
    let overigeTitels = [];
    if (titleVerderZoeken) {
      overigeTitels = titleVerderZoeken.split(reg)
        .map((t) => t.trim())
        .filter((a) => a)
        .map((t) => slugify(t));
      
      const nieuweArtiesten = await this.recursiveAPICallForGenre(overigeTitels, []);
      nieuweArtiesten
        .filter((a) => (a.resultaten?.spotRes ?? null) || (a.resultaten?.metalEnc ?? null))
        .forEach((na) => {
          // console.log(util.inspect(na, 
          //   { showHidden: false, depth: null, colors: true }));          
          const spotify = na.resultaten?.spotRes?.id ?? null;
          const sGenres = na.resultaten?.spotRes?.genres ?? [];
          const heeftMetalEnc = Array.isArray(na.resultaten?.metalEnc);
          const mGenres = heeftMetalEnc ? na.resultaten?.metalEnc[1].split(';').map((a) => a.replace(/\(.*\)/, '').trim().toLowerCase()) ?? [] : [];
          const genres = [...sGenres, ...mGenres];
          const land = heeftMetalEnc ? na.resultaten?.metalEnc[2] ?? null : null;

          const eerstGefilterdeGenres = genres
            .filter((g) => !this.terms.globalForbiddenGenres.find((gfg) => g.includes(gfg)));
          const tweedeGefilterdeGenres = eerstGefilterdeGenres
            .filter((g) => !this.terms.forbidden.includes(g));
          if (tweedeGefilterdeGenres.length) {
            this.saveAllowedTemp(na.title, na.slug, spotify, land, genres, eventDate);
          } else {
            this.saveRefusedTemp(na.title, na.slug, spotify, land, eventDate);
          }
        });
    }

    return this.post({
      success: true,
      data: 'niets',
      reason: `succesvolle harvest`,
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
        console.log('ERROR IN FETSCH');
        console.log(err);
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
    
    const gevondenKeys = haystack
      .filter((hay) => eventNameOfTitle.includes(hay) || slug.includes(hay));
    
    if (!gevondenKeys || !gevondenKeys.length) {
      return {};
    }
    
    if (gevondenKeys.length === 1) {
      const k = gevondenKeys[0];
      const artist = this.allowedArtists[k];
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
        return {
          [`${winKey}`]: winnaar,
        };
      }
    }

    // metalEncyclo is gelijk bij title & slug
    const metalEncycloKeys = [];
    const gefilterdeAllowedArtistsKeys = [];
    gevondenKeys.forEach((key) => {
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

  saveRefusedEventTemp(title, slug, eventDate) {
    const tt = title.length < 10 ? title + eventDate : title;
    const ss = slug.length < 10 ? slug + eventDate : slug;
    this.refusedTemp[tt] = [0, null, null, eventDate, this.today];
    if (tt !== ss) {
      this.refusedTemp[ss] = [1, null, null, eventDate, this.today]; 
    }
    return true;
  }

  saveRefusedTemp(title, slug, spotify, metalEnc, eventDate) {
    const tt = title.length < 10 ? title + eventDate : title;
    const ss = slug.length < 10 ? slug + eventDate : slug;
    this.refusedTemp[tt] = [0, spotify, metalEnc, eventDate, this.today];
    if (tt !== ss) {
      this.refusedTemp[ss] = [1, spotify, metalEnc, eventDate, this.today]; 
    }
    return true;
  }  

  saveAllowedEventTemp(title, slug, eventDate) {
    const tt = title.length < 10 ? title + eventDate : title;
    const ss = slug.length < 10 ? slug + eventDate : slug;
    this.allowedEventTemp[tt] = [0, eventDate, this.today];
    if (tt !== ss) {
      this.allowedEventTemp[ss] = [1, eventDate, this.today]; 
    }
    return true;
  }

  saveAllowedTemp(title, slug, spotify, metalEnc, genres, eventDate) {
    const tt = title.length < 10 ? title + eventDate : title;
    const ss = slug.length < 10 ? slug + eventDate : slug;
    this.allowedArtistsTemp[tt] = [0, spotify, metalEnc, genres, eventDate, this.today];
    if (tt !== ss) {
      this.allowedArtistsTemp[ss] = [1, spotify, metalEnc, genres, eventDate, this.today];
    }
    return true;
  }

  persistNewRefusedAndRockArtists() {
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
    
    fs.writeFileSync(`${this.storePath}/refused.json`, JSON.stringify(this.refused), 'utf-8');
    fs.writeFileSync(`${this.storePath}/allowed-artists.json`, JSON.stringify(this.allowedArtists), 'utf-8');
    fs.writeFileSync(`${this.storePath}/allowed-events.json`, JSON.stringify(this.allowedEvents), 'utf-8');
  }

  async getSpotifyArtistSearch(artist) {
    if (!this.spotifyAccessToken) {
      await this.getSpotifyAccessToken();
    }

    const uriComponent = encodeURIComponent(`artist:${artist}`);
    const url = `https://api.spotify.com/v1/search?q=${uriComponent}&type=artist&offset=0&limit=20&market=NL`;
    // console.log(url);
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
      return fetchResult?.artists?.items.filter((hit) => hit.name.toLowerCase() === artist)[0]; 
      // todo eerste teruggeven is slordig
    } if (fetchResult?.artists) {
      return null;
    }
    console.log(`geen resultaat uberhaupt voor ${artist}`);
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
