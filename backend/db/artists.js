/* eslint-disable no-console */
import fs from 'fs';

export default class Artists {
  conf = null;

  rockArtists = null;

  refused = null;

  rockEvents = null;

  rockArtistAliases = {};

  refusedAliases = {}; 

  rockEventsAliases = {};

  allRockArtistsNamesAndAliases = [];

  allRefusedNamesAndAliases = [];

  allRockEventsNamesAndAliases = [];
  
  allRockArtistsNamesAndAliasesString = '';

  allRockEventsNamesAndAliasesString = '';
  
  allRefusedNamesAndAliasesString = '';

  constructor(conf) {
    this.conf = conf;
    this.rockArtists = JSON.parse(fs.readFileSync(conf.rockArtistPath));
    this.refused = JSON.parse(fs.readFileSync(conf.refusedPath));
    this.rockEvents = JSON.parse(fs.readFileSync(conf.rockEventsPath));
    
    Object.entries(this.rockArtists)
      .forEach(([artistName, artistRecord]) => {
        this.allRockArtistsNamesAndAliases.push(artistName);
        artistRecord.aliases.forEach((alias) => {
          this.rockArtistAliases[alias] = artistName;
          this.allRockArtistsNamesAndAliases.push(alias);
        });
      });

    Object.entries(this.refused)
      .forEach(([refusedName, refusedRecord]) => {
        this.allRefusedNamesAndAliases.push(refusedName);
        refusedRecord.aliases.forEach((alias) => {
          this.allRefusedNamesAndAliases.push(alias);
          this.refusedAliases[alias] = refusedName;
        });
      });

    Object.entries(this.rockEvents)
      .forEach(([rockEventName, rockEventRecord]) => {
        this.allRockEventsNamesAndAliases.push(rockEventName);
        rockEventRecord.aliases.forEach((alias) => {
          this.rockEventsAliases[alias] = rockEventName;
          this.allRockEventsNamesAndAliases.push(alias);
        });
      });      

    this.allRockArtistsNamesAndAliasesString = this.allRockArtistsNamesAndAliases.join(', ');
    this.allRockEventsNamesAndAliasesString = this.allRockEventsNamesAndAliases.join(', ');
    this.allRefusedNamesAndAliasesString = this.allRefusedNamesAndAliases.join(', ');
  }

  parseMessage(message) {
    if (typeof message === 'string') {
      return JSON.parse(message);
    }
    return message;
  }

  checkMessage(parsedMessage) {
    const hasRequest = Object.prototype.hasOwnProperty.call(parsedMessage, 'request');
    const hasData = Object.prototype.hasOwnProperty.call(parsedMessage, 'data');
    return hasRequest && hasData;
  }

  do(message) {
    const parsedMessage = this.parseMessage(message);
    if (!this.checkMessage(parsedMessage)) {
      return this.error(new Error('message niet check'));
    }

    if (message.request === 'getStoredArtist') {
      const hasArtistName = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'artistName');
      if (!hasArtistName) {
        return this.error(Error('geen artist name'));
      }
      return this.getStoredArtist(message.data.artistName);
    }

    if (message.request === 'scanStringForArtists') {
      const hasString = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'string');
      if (!hasString) {
        return this.error(Error('geen string om te doorzoeken'));
      }
      return this.scanStringForArtists(message.data.string);
    }

    if (message.request === 'isRefused') {
      const hasString = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'string');
      if (!hasString) {
        return this.error(Error('geen string om te doorzoeken'));
      }
      return this.isRefused(message.data.string);
    }

    if (message.request === 'isAllowed') {
      const hasString = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'string');
      if (!hasString) {
        return this.error(Error('geen string om te doorzoeken'));
      }
      return this.isAllowed(message.data.string);
    }

    if (message.request === 'isRockEvent') {
      const hasString = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'string');
      if (!hasString) {
        return this.error(Error('geen string om te doorzoeken'));
      }
      return this.isRockEvent(message.data.string);
    }

    if (message.request === 'saveRefusedTitle') {
      const hasString = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'string');
      if (!hasString) {
        return this.error(Error('geen string om op te slaan'));
      }
      return this.saveRefusedTitle(message.data.string, message.data?.reason);
    }

    if (message.request === 'saveAllowedTitle') {
      const hasString = Object.prototype.hasOwnProperty.call(parsedMessage.data, 'string');
      if (!hasString) {
        return this.error(Error('geen string om op te slaan'));
      }
      return this.saveAllowedTitle(message.data.string, message.data?.reason);
    }

    return this.error(new Error(`request ${message.request} onbekend`));
  }

  lowerCaseAndTrim(rawArtistName) {
    return rawArtistName.toLowerCase().trim();
  }

  getArtistIsStored(artistName) {
    return Object.prototype.hasOwnProperty.call(this.rockArtists, artistName);
  }

  getArtistAliasIsStored(possibleAlias) {
    return Object.prototype.hasOwnProperty.call(this.rockArtistAliases, possibleAlias); 
  }

  getStoredArtist(artistName) {
    let searchForName = this.lowerCaseAndTrim(artistName);
    if (!this.getArtistIsStored(searchForName)) {
      if (!this.getArtistAliasIsStored(searchForName)) {
        return this.post({
          success: false,
          data: null,
          reason: `${searchForName} not found, also no alias`,
        }); 
      } 
      searchForName = this.rockArtistAliases[searchForName];
    }
    const artistFound = this.rockArtists[searchForName];
    return this.post({
      success: true,
      data: artistFound,
      reason: `${searchForName} found`,
    });
  }

  scanStringForArtists(string) {
    const lowerString = this.lowerCaseAndTrim(string);
    const found = this.allRockArtistsNamesAndAliases
      .filter((nameOrAlias) => lowerString.includes(nameOrAlias));
    if (!found.length) {
      return this.post({
        success: false,
        data: null,
        reason: `no alias or artistName found in ${string}.`,
      });
    }
    return this.post({
      success: true,
      data: found,
      reason: `${found.length} found`,
    });
  }

  isRockEvent(string) {
    const lowerString = this.lowerCaseAndTrim(string);
    const isFoundDirectly = this.allRockEventsNamesAndAliasesString.includes(lowerString);
    const eventTypeNameFound = Object.keys(this.rockEvents).find((event) => string.includes(event));
      
    if (isFoundDirectly || eventTypeNameFound) {
      return this.post({
        success: true,
        data: null,
        reason: `${string} is found in names and aliases.`,
      });
    }
    return this.post({
      success: false,
      data: null,
      reason: `${string} is not an event.`,
    });
  }  

  isRefused(string) {
    const lowerString = this.lowerCaseAndTrim(string);
    const foundDirectly = this.allRefusedNamesAndAliasesString.includes(lowerString);
      
    if (foundDirectly) {
      return this.post({
        success: true,
        data: null,
        reason: `${lowerString} is refused.`,
      });
    }
    return this.post({
      success: false,
      data: null,
      reason: `nothing refused found in ${lowerString}`,
    });
  }

  isAllowed(string) {
    const lowerString = this.lowerCaseAndTrim(string);
    const found = this.allRockArtistsNamesAndAliasesString.includes(lowerString);
      
    if (found) {
      return this.post({
        success: true,
        data: found,
        reason: `${found} is allowed.`,
      });
    }
    return this.post({
      success: false,
      data: null,
      reason: `nothing allowed found in ${string}`,
    });
  }

  saveRefusedTitle(string, reason) {
    const clean = this.lowerCaseAndTrim(string);
    if (Object.prototype.hasOwnProperty.call(this.refused, clean)) {
      // allready saved, should not be
      return this.post({
        success: false,
        data: null,
        reason: 'allready in refused',
      });
    }
    if (Object.prototype.hasOwnProperty.call(this.refusedAliases, clean)) {
      const alias = clean;
      const refusedName = this.refusedAliases[alias];
      this.refused[refusedName].aliases.push(alias);
      if (reason) {
        this.refused[refusedName].reason += reason.replace(/class='.*'\s/, '');
      }
      return this.post({
        success: true,
        data: null,
        reason: 'saving succes via alias',
      });
    }
    this.refused[clean] = {
      aliases: [],
      reason,
    };
    return this.post({
      success: true,
      data: null,
      reason: 'saving succes',
    });
  }

  saveAllowedTitle(string, reason) {
    const clean = this.lowerCaseAndTrim(string);
    if (Object.prototype.hasOwnProperty.call(this.rockArtists, clean)) {
      // allready saved, should not be
      return this.post({
        success: false,
        data: null,
        reason: 'allready in rockArtists',
      });
    }
    if (Object.prototype.hasOwnProperty.call(this.rockArtistAliases, clean)) {
      const alias = clean;
      const artistName = this.rockArtistAliases[alias];
      this.rockArtists[artistName].aliases.push(alias);
      if (reason) {
        this.rockArtists[artistName].reason += reason.replace(/class='.*'\s/, '');
      }
      return this.post({
        success: true,
        data: null,
        reason: 'save success via alias',
      });
    }
    this.rockArtists[clean] = {
      aliases: [],
      genres: [],
    };
    return this.post({
      success: true,
      data: null,
      reason: 'save success',
    });    
  }

  persistNewRefusedAndRockArtists() {
    // const orderedRefused = Object.keys(this.refused).sort().reduce(
    //   (obj, key) => { 
    //     obj[key] = this.refused[key]; 
    //     return obj;
    //   }, 
    //   {},
    // );
    // const rockArtistsOrdered = Object.keys(this.rockArtists).sort().reduce(
    //   (obj, key) => { 
    //     obj[key] = this.rockArtists[key]; 
    //     return obj;
    //   }, 
    //   {},
    // );
    fs.writeFileSync(this.conf.refusedPath, JSON.stringify(this.refused, null, 2));
    fs.writeFileSync(this.conf.rockArtistPath, JSON.stringify(this.rockArtists, null, 2));
  }

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
