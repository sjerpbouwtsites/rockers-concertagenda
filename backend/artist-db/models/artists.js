/* eslint-disable no-console */
import fs from 'fs';
import puppeteer from 'puppeteer';

export default class Artists {
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
   * Twee weg referentie zoals {USA: US, US: USA}
   * tbv country info uit titels halen
   */
  landcodesMap;

  constructor(conf) {
    this.modelPath = conf.modelPath;
    this.storePath = conf.storePath;

    this.refused = JSON.parse(fs.readFileSync(`${this.storePath}/refused.json`));
    this.allowedArtists = JSON.parse(fs.readFileSync(`${this.storePath}/allowed-artists.json`));
    this.allowedEvents = JSON.parse(fs.readFileSync(`${this.storePath}/allowed-events.json`));
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
  do(message) {
    // parse
    const parsedMessage = this.parseMessage(message);
    // check
    if (!this.checkMessage(parsedMessage)) {
      return this.error(new Error('message niet check'));
    }

    if (message.request === 'getStoredArtist') {
      const hasArtistName = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'artistName');
      const hasSlug = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'slug');
      if (!hasArtistName || !hasSlug) {
        return this.error(Error(`geen artist name of slug. artistName: ${hasArtistName}; slug: ${hasSlug}`));
      }
      return this.getStoredArtist(message.data.artistName, message.data.slug);
    }

    if (message.request === 'getAllowedEvent') {
      const hasTitle = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'title');
      const hasSlug = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'slug');
      if (!hasTitle || !hasSlug) {
        return this.error(Error('geen title of slug om te doorzoeken'));
      }
      return this.getAllowedEvent(message.data.title, message.data.slug);
    }

    if (message.request === 'getRefused') {
      const hasTitle = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'title');
      const hasSlug = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'slug');
      if (!hasTitle || !hasSlug) {
        return this.error(Error('geen title of slug om te doorzoeken'));
      }
      return this.getRefused(message.data.title, message.data.slug);
    }

    if (message.request === 'scanTitleForAllowedArtists') {
      const hasTitle = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'title');
      const hasSlug = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'slug');
      if (!hasTitle || !hasSlug) {
        return this.error(Error('geen title of slug om te doorzoeken'));
      }
      return this.scanTitleForAllowedArtists(message.data.title, message.data.slug);
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
        reason: `${eventName} and ${slug} not in allowedEvents`,
      }); 
    }

    const eventData = _a ? this.allowedEvents[eventName] : this.allowedEvents[slug];
    return this.post({
      success: true,
      data: eventData,
      reason: `${_a ? `eventName ${eventName}` : `slug ${slug}`} found`,
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
        reason: `${eventNameOfTitle} and ${slug} not in refused`,
      }); 
    }

    const eventOfArtistData = _a ? this.refused[eventNameOfTitle] : this.refused[slug];
    return this.post({
      success: true,
      data: eventOfArtistData,
      reason: `${_a ? `eventNameOfTitle ${eventNameOfTitle}` : `slug ${slug}`} found`,
    });
  }  

  /**
   * scant eventNameOfTitle en slug op match met allowed artists
   * @param {*} eventNameOfTitle 
   * @param {*} slug 
   * @returns successMessage met evt. artistData - 
   * kan één artiest of meer zijn. als één dan array, als meer dan object.
   */
  scanTitleForAllowedArtists(eventNameOfTitle, slug) {
    const haystack = Object.keys(this.allowedArtists);
    
    const gevondenKeys = haystack
      .filter((hay) => eventNameOfTitle.includes(hay) || slug.includes(hay));
    
    if (!gevondenKeys || !gevondenKeys.length) {
      return this.post({
        success: false,
        data: null,
        reason: `${eventNameOfTitle} and ${slug} not found in scan of allowed artists.`,
      }); 
    }
    
    if (gevondenKeys.length === 1) {
      const k = gevondenKeys[0];
      const artist = this.allowedArtists[k];
      return this.post({
        success: true,
        data: artist,
        reason: `${k} een ${artist[0] ? "slug" : "title"} gevonden in scan of allowed artists.`,
      }); 
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
        return this.post({
          success: true,
          data: winnaar,
          reason: `${winKey} een gevonden in scan of allowed artists na uitsluiting van slug.`,
        });         
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
    console.log(gefilterdeAllowedArtistsKeys);

    const gefilterdeAllowedArtists = {};
    gefilterdeAllowedArtistsKeys.forEach((key) => {
      gefilterdeAllowedArtists[key] = allowedArtists[key];
    });
    
    return this.post({
      success: true,
      data: gefilterdeAllowedArtists,
      reason: `${gefilterdeAllowedArtistsKeys.join(', ')} gevonden in scan of allowed artists`,
    });
  } 

  // saveRefusedTitle(string, reason) {
  //   const clean = this.lowerCaseAndTrim(string);
  //   if (Object.prototype.hasOwnProperty.call(this.refused, clean)) {
  //     // allready saved, should not be
  //     return this.post({
  //       success: false,
  //       data: null,
  //       reason: 'allready in refused',
  //     });
  //   }
  //   if (Object.prototype.hasOwnProperty.call(this.refusedAliases, clean)) {
  //     const alias = clean;
  //     const refusedName = this.refusedAliases[alias];
  //     this.refused[refusedName].aliases.push(alias);
  //     if (reason) {
  //       this.refused[refusedName].reason += reason.replace(/class='.*'\s/, '');
  //     }
  //     return this.post({
  //       success: true,
  //       data: null,
  //       reason: 'saving succes via alias',
  //     });
  //   }
  //   this.refused[clean] = {
  //     aliases: [],
  //     reason,
  //   };
  //   return this.post({
  //     success: true,
  //     data: null,
  //     reason: 'saving succes',
  //   });
  // }

  // saveAllowedTitle(string) {
  //   const clean = this.lowerCaseAndTrim(string);
  //   const isKeyVanEvents = Object.prototype.hasOwnProperty.call(this.rockEvents, clean);
  //   const isAlInEvents = isKeyVanEvents || this.allRockEventsNamesAndAliases
  //     .find((eventOfAlias) => clean.includes(eventOfAlias));
  //   if (isAlInEvents) {
  //     // allready saved, should not be
  //     return this.post({
  //       success: false,
  //       data: null,
  //       reason: 'allready in rockArtists',
  //     });
  //   }

  //   this.rockEvents[clean] = {
  //     aliases: [string],
  //     genres: [],
  //   };
    
  //   return this.post({
  //     success: true,
  //     data: null,
  //     reason: 'save success via alias',
  //   });
  // }

  // persistNewRefusedAndRockArtists() {
  //   console.log("PERSIST MAAR DAN EVEN UITGEZET");
  //   console.log('AANGEROEPEN VANUIT WORKER STATUS NA EINDE PROGRAMMA');
  //   console.log('artists.js@persistNewRefusedAndRockArtists');
  //   // const orderedRefused = Object.keys(this.refused).sort().reduce(
  //   //   (obj, key) => { 
  //   //     obj[key] = this.refused[key]; 
  //   //     return obj;
  //   //   }, 
  //   //   {},
  //   // );
  //   // const rockArtistsOrdered = Object.keys(this.rockArtists).sort().reduce(
  //   //   (obj, key) => { 
  //   //     obj[key] = this.rockArtists[key]; 
  //   //     return obj;
  //   //   }, 
  //   //   {},
  //   // );
  //   // fs.writeFileSync(this.conf.refusedPath, JSON.stringify(this.refused, null, 2));
  //   // fs.writeFileSync(this.conf.rockArtistPath, JSON.stringify(this.rockArtists, null, 2));
  //   // fs.writeFileSync(this.conf.rockEventsPath, JSON.stringify(this.rockEvents, null, 2));
  // }

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
