/* eslint-disable no-console */
import fs from 'fs';

export default class Artists {
  conf = null;

  rockArtists = null;

  refused = null;

  rockArtistAliases = {};

  refusedAliases = {}; 

  allRockArtistNamesAndAliases = [];

  allRefusedNamesAndAliases = [];

  constructor(conf) {
    this.conf = conf;
    this.rockArtists = JSON.parse(fs.readFileSync(conf.rockArtistPath));
    this.refused = JSON.parse(fs.readFileSync(conf.refusedPath));
    this.rockArtistAliases = {};
    this.refusedAliases = {};
   
    Object.entries(this.rockArtists)
      .filter(([, artistRecord]) => artistRecord.aliases.length)
      .forEach(([artistName, artistRecord]) => {
        artistRecord.aliases.forEach((alias) => {
          this.rockArtistAliases[alias] = artistName;
        });
      });

    Object.entries(this.refused)
      .filter(([, refusedRecord]) => refusedRecord.aliases.length)
      .forEach(([refusedName, refusedRecord]) => {
        refusedRecord.aliases.forEach((alias) => {
          this.refusedAliases[alias] = refusedName;
        });
      });

    this.allRockArtistNamesAndAliases = Object.keys(this.rockArtists)
      .concat(Object.keys(this.rockArtistAliases));

    this.allRefusedNamesAndAliases = Object.keys(this.refused)
      .concat(Object.keys(this.refusedAliases));
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

  cleanArtistName(rawArtistName) {
    return rawArtistName.toLowerCase().trim();
  }

  getArtistIsStored(artistName) {
    return Object.prototype.hasOwnProperty.call(this.rockArtists, artistName);
  }

  getArtistAliasIsStored(possibleAlias) {
    return Object.prototype.hasOwnProperty.call(this.rockArtistAliases, possibleAlias); 
  }

  getStoredArtist(artistName) {
    let searchForName = this.cleanArtistName(artistName);
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
    const lowerString = string.toLowerCase();
    const found = this.allRockArtistNamesAndAliases
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

  isRefused(string) {
    const lowerString = string.toLowerCase();
    const found = this.allRefusedNamesAndAliases
      .find((nameOrAlias) => lowerString.includes(nameOrAlias));
    if (found) {
      return this.post({
        success: true,
        data: found,
        reason: `${found} is refused.`,
      });
    }
    return this.post({
      success: false,
      data: null,
      reason: `nothing refused found in ${string}`,
    });
  }

  isAllowed(string) {
    const lowerString = string.toLowerCase();
    const found = this.allRockArtistNamesAndAliases
      .find((nameOrAlias) => lowerString.includes(nameOrAlias));
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
    const clean = this.cleanArtistName(string);
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
    const clean = this.cleanArtistName(string);
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
      reason,
    };
    return this.post({
      success: true,
      data: null,
      reason: 'save success',
    });    
  }

  persistNewRefusedAndRockArtists() {
    fs.writeFileSync(this.conf.refusedPath, JSON.stringify(this.refused));
    fs.writeFileSync(this.conf.rockArtistPath, JSON.stringify(this.rockArtists));
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
