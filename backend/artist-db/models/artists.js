/* eslint-disable no-console */
import fs from "fs";
import terms from "../store/terms.js";
import shell from "../../mods/shell.js";
import {
  harvestArtists,
  makeVerderScannen,
  makePotentieeleOverigeTitels,
} from "./harvest.js";
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

  static funcsToDebug = {
    harvestArtists: true,
    scanTextForAllowedArtists: false,
    getSpotifyArtistSearch: false,
    persistNewRefusedAndRockArtists: true,
    checkExplicitEventCategories: false,
    saveAllowedEvent: false,
    scanTextForSomeArtistList: true,
    getRefused: false,
    _do: false,
    APICallsForGenre: false,
    getMetalEncyclopediaConfirmation: false,
    getSpotifyConfirmation: false,
    hasForbidden: true,
  };

  // #endregion
  /**
   * of in die persistentie functie fs write file
   */
  storeWritePermission = false || shell.artistDBWrite;

  /**
   * of oude jsons voor nieuwe schrijven gekopieerd worden naar bv allowed-events-20230101202020
   * schrijft geen backups zonder storeWritePermission
   */
  storeSaveBackup = true;

  /**
   * Creates an instance of Artists.
   *
   * @constructor
   * @param {*} conf
   */
  constructor(conf) {
    this.modelPath = conf.modelPath;
    this.storePath = conf.storePath;
    this.refused = JSON.parse(
      fs.readFileSync(`${this.storePath}/refused.json`)
    );
    this.allowedArtists = JSON.parse(
      fs.readFileSync(`${this.storePath}/allowed-artists.json`)
    );
    this.allowedEvents = JSON.parse(
      fs.readFileSync(`${this.storePath}/allowed-events.json`)
    );
    this.unclearArtists = JSON.parse(
      fs.readFileSync(`${this.storePath}/unclear-artists.json`)
    );
    this.landcodesMap = JSON.parse(
      fs.readFileSync(`${this.storePath}/landcodes-map.json`)
    );
    this.today = new Date().toISOString().replaceAll("-", "").substring(2, 8);

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
    if (typeof message === "string") {
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
    const hasRequest = Object.prototype.hasOwnProperty.call(
      parsedMessage,
      "request"
    );
    const hasData = Object.prototype.hasOwnProperty.call(parsedMessage, "data");
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
      console.log("error de perorr");
      return this.error(error);
    }
  }

  // #region DO (VOORMAN)

  /**
   * Voorman van de class. message.request heeft de naam van een functie hier
   * 'do' stuurt die functie aan en returned het resultaat. Controleert ook of
   * message.data wel de voor die functie vereiste 'type' heeft.
   * @param {object} message request:string, data:object
   * @returns {string} als JSON: success:boolean|string,reason:string,data:object
   */
  async _do(message) {
    // parse

    const parsedMessage = this.parseMessage(message);

    // check
    if (!this.checkMessage(parsedMessage)) {
      return this.error(new Error("message niet check"));
    }

    if (message.request === "getStoredArtist") {
      if (this.typeCheckInputFromScrapers) {
        const hasArtistName = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "artistName"
        );
        const hasSlug = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "slug"
        );
        if (!hasArtistName || !hasSlug) {
          return this.error(
            Error(
              `geen artist name of slug. artistName: ${hasArtistName}; slug: ${hasSlug} | ${message.request}`
            )
          );
        }
      }
      return this.getStoredArtist(message.data.artistName, message.data.slug);
    }

    if (message.request === "getAllowedEvent") {
      if (this.typeCheckInputFromScrapers) {
        const hasTitle = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "title"
        );
        const hasSlug = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "slug"
        );
        if (!hasTitle || !hasSlug) {
          return this.error(
            Error(`geen title of slug om te doorzoeken  | ${message.request}`)
          );
        }
      }
      this.consoleGroup("getAllowedEvent do27", message.data, "_do", "rood");
      return this.getAllowedEvent(message.data.title, message.data.slug);
    }

    if (message.request === "getRefused") {
      this.consoleGroup("getRefusedEvent do28", message.data, "_do", "rood");
      if (this.typeCheckInputFromScrapers) {
        const hasTitle = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "title"
        );
        const hasSlug = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "slug"
        );
        const hasEventDate = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "eventDate"
        );
        if (!hasTitle || !hasSlug) {
          return this.error(
            Error(`geen title of slug om te doorzoeken  | ${message.request}`)
          );
        }
        if (!hasEventDate) {
          return this.error(
            Error(
              `geen eventdate ${parsedMessage.data.title}  | ${message.request}`
            )
          );
        }
      }
      return this.getRefused(
        message.data.title,
        message.data.slug,
        message.data.eventDate
      );
    }

    if (message.request === "hasForbidden") {
      if (this.typeCheckInputFromScrapers) {
        const hasString = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "string"
        );
        if (!hasString) {
          return this.error(
            Error(`geen string om te doorzoeken | ${message.request}`)
          );
        }
      }
      return this.hasForbidden(message.data.string);
    }

    if (message.request === "hasGood") {
      if (this.typeCheckInputFromScrapers) {
        const hasString = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "string"
        );
        if (!hasString) {
          return this.error(
            Error(`geen string om te doorzoeken | ${message.request}`)
          );
        }
      }
      return this.hasGood(message.data.string);
    }

    if (message.request === "checkExplicitEventCategories") {
      if (this.typeCheckInputFromScrapers) {
        const hasGenres = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "genres"
        );
        if (!hasGenres) {
          return this.error(
            Error(`geen genres om te doorzoeken | ${message.request}`)
          );
        }
      }
      return this.checkExplicitEventCategories(message.data.genres);
    }

    if (message.request === "getGoodCategoriesInLongHTML") {
      const d = message.data;
      return this.getGoodCategoriesInLongHTML(d.title, d.slug, d.categories);
    }

    if (message.request === "getSpotifyConfirmation") {
      if (this.typeCheckInputFromScrapers) {
        const hasTitle = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "title"
        );
        const hasSlug = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "slug"
        );
        const hasEventDate = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "eventDate"
        );
        if (!hasTitle || !hasSlug) {
          return this.error(
            Error(`geen title of slug om te doorzoeken | ${message.request}`)
          );
        }
        if (!hasEventDate) {
          return this.error(
            Error(
              `geen eventdate ${parsedMessage.data.title} | ${message.request}`
            )
          );
        }
      }
      const d = message.data;
      return this.getSpotifyConfirmation(d.title, d.slug, d.eventDate);
    }

    if (message.request === "getMetalEncyclopediaConfirmation") {
      if (this.typeCheckInputFromScrapers) {
        const hasTitle = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "title"
        );
        if (!hasTitle) {
          return this.error(
            Error(`geen title om te doorzoeken | ${message.request}`)
          );
        }
        const hasSettings = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "settings"
        );
        if (!hasSettings) {
          return this.error(
            Error(`geen settings meegegeven | ${message.request}`)
          );
        }
      }
      return this.getMetalEncyclopediaConfirmation(
        message.data.title,
        message.data.settings
      );
    }

    if (
      [
        "scanTextForAllowedArtists",
        "scanTextForRefusedArtists",
        "scanTextForUnclearArtists",
      ].includes(message.request)
    ) {
      if (this.typeCheckInputFromScrapers) {
        const hasTitle = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "title"
        );
        const hasSlug = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "slug"
        );
        if (!hasTitle || !hasSlug) {
          return this.error(
            Error(`geen title of slug om te doorzoeken | ${message.request}`)
          );
        }
      }
      if (message.request === "scanTextForAllowedArtists") {
        return this.scanTextForAllowedArtists(
          message.data.title,
          message.data.slug
        );
      }
      if (message.request === "scanTextForRefusedArtists") {
        return this.scanTextForRefusedArtists(
          message.data.title,
          message.data.slug
        );
      }
      if (message.request === "scanTextForUnclearArtists") {
        return this.scanTextForUnclearArtists(
          message.data.title,
          message.data.slug
        );
      }
    }

    if (message.request === "scanEventForAllowedArtistsAsync") {
      if (this.typeCheckInputFromScrapers) {
        const hasTitle = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "title"
        );
        const hasSlug = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "slug"
        );
        const hasSettings = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "settings"
        );
        if (!hasTitle || !hasSlug) {
          return this.error(
            Error(`geen title of slug om te doorzoeken | ${message.request}`)
          );
        }
        if (!hasSettings) {
          return this.error(Error(`geen settings | ${message.request}`));
        }
      }
      return this.scanEventForAllowedArtistsAsync(
        message.data.title,
        message.data.slug,
        message.data?.shortText,
        message.data.settings
      );
    }

    if (message.request === "harvestArtists") {
      if (this.typeCheckInputFromScrapers) {
        const hasTitle = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "title"
        );
        const hasSlug = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "slug"
        );
        const hasSettings = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "settings"
        );
        const hasURL = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "venueEventUrl"
        );
        const hasEventDate = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "eventDate"
        );
        if (!hasTitle || !hasSlug) {
          return this.error(
            Error(`geen title of slug om te doorzoeken | ${message.request}`)
          );
        }
        if (!hasSettings) {
          return this.error(Error(`geen settings | ${message.request}`));
        }
        if (!hasEventDate) {
          return this.error(
            Error(
              `geen eventdate ${parsedMessage.data.title} | ${message.request}`
            )
          );
        }
        if (!hasURL) {
          return this.error(Error(`geen event url | ${message.request}`));
        }
      }
      const d = message.data;
      const t = d.title;
      const s = d.slug;
      const st = d?.shortText;
      const set = d.settings;
      const ed = d.eventDate;
      const url = d.venueEventUrl;
      const eg = d?.eventGenres;
      return this.harvestArtists(t, s, st, set, ed, url, eg);
    }

    if (message.request === "APICallsForGenre") {
      if (this.typeCheckInputFromScrapers) {
        const hasTitle = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "title"
        );
        const hasSlug = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "slug"
        );
        if (!hasTitle || !hasSlug) {
          console.log("message:");
          console.log(message);
          return this.error(
            Error(`geen title of slug om te doorzoeken | ${message.request}`)
          );
        }
      }
      return this.APICallsForGenre(message.data.title, message.data.slug);
    }

    if (
      [
        "saveRefusedEvent",
        "saveAllowedEvent",
        "saveRefused",
        "saveUnclearArtist",
        "saveAllowedArtist",
      ].includes(message.request)
    ) {
      if (this.typeCheckInputFromScrapers) {
        const hasString = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "string"
        );
        const hasSlug = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "slug"
        );
        const hasEventDate = Object.prototype.hasOwnProperty.call(
          parsedMessage.data,
          "eventDate"
        );
        if (!hasString) {
          return this.error(
            Error(`geen string om op te slaan | ${message.request}`)
          );
        }
        if (!hasSlug) {
          return this.error(
            Error(`geen slug om op te slaan | ${message.request}`)
          );
        }
        if (!hasEventDate) {
          return this.error(
            Error(`geen eventDate om op te slaan | ${message.request}`)
          );
        }
      }
      if (["saveRefusedEvent", "saveRefused"].includes(message.request)) {
        return this.saveRefusedEvent(
          message.data.string,
          message.data.slug,
          message.data.eventDate
        );
      }
      if (message.request === "saveAllowedEvent") {
        return this.saveAllowedEvent(
          message.data.string,
          message.data.slug,
          message.data.eventDate
        );
      }
      if (message.request === "saveAllowedArtist") {
        return this.saveAllowedArtist(
          message.data.string,
          message.data.slug,
          message.data?.spotify ?? "",
          message.data?.metalEnc ?? "",
          message.data?.genres ?? [],
          message.data.eventDate
        );
      }
      if (message.request === "saveUnclearArtist") {
        return this.saveUnclearArtist(
          message.data.string,
          message.data.slug,
          message.data?.spotify ?? "",
          message.data?.metalEnc ?? "",
          message.data?.genres ?? [],
          message.data.eventDate
        );
      }
    } // ['saveRefusedEvent', 'saveAllowedEvent', ETC 'saveAllowedArtist'].includes(message.request)

    if (message.request === "makeSuccess") {
      return this.post({
        success: true,
        data: null,
        reason: `🟩 Gen. success`,
      });
    }

    if (message.request === "makeFailure") {
      return this.post({
        success: false,
        data: null,
        reason: `🟥 Gen. failure`,
      });
    }

    console.group(`artist db request error`);
    console.log("onbekende request. message:");
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
    const _a = Object.prototype.hasOwnProperty.call(
      this.allowedArtists,
      artistName
    );
    const _b = Object.prototype.hasOwnProperty.call(this.allowedArtists, slug);

    if (!_a && !_b) {
      return this.post({
        success: false,
        data: null,
        reason: `${artistName} and ${slug} not in allowedArtists aa1`,
      });
    }

    const artistData = _a
      ? this.allowedArtists[artistName]
      : this.allowedArtists[slug];
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
    const _a = Object.prototype.hasOwnProperty.call(
      this.allowedEvents,
      eventName
    );
    const _b = Object.prototype.hasOwnProperty.call(this.allowedEvents, slug);

    if (!_a && !_b) {
      return this.post({
        success: null,
        data: null,
        reason: `⬜ ${eventName} and ${slug} not allowed event aa3`,
      });
    }

    const eventData = _a
      ? this.allowedEvents[eventName]
      : this.allowedEvents[slug];
    return this.post({
      success: true,
      data: eventData,
      reason: `🟩 ${
        _a ? `eventName ${eventName}` : `slug ${slug}`
      } allowed event aa4`,
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
    const tt =
      eventNameOfTitle.length < this.minLengthLang
        ? eventNameOfTitle + eventDate
        : eventNameOfTitle;
    const ss = slug.length < this.minLengthLang ? slug + eventDate : slug;

    const _a = Object.hasOwn(this.refused, tt);
    const _b = Object.hasOwn(this.refused, ss);

    this.consoleGroup(
      "getRefused zoekt",
      {
        eventNameOfTitle,
        slug,
        zoektMetTitleDate: tt,
        zoektMetSlugDate: ss,
        titleInRefused: _a,
        slugInRefused: _b,
        // eslint-disable-next-line no-nested-ternary
        gevondenRefused: _a ? this.refused[tt] : _b ? this.refused[ss] : null,
      },
      "getRefused",
      "rood"
    );

    if (_a || _b) {
      const eventOfArtistData = _a ? this.refused[tt] : this.refused[ss];
      return this.post({
        success: true,
        data: eventOfArtistData,
        reason: `🟥 ${
          _a ? `eventNameOfTitle ${tt}` : `slug ${ss}`
        } refused aa6`,
      });
    }

    return this.post({
      success: null,
      data: null,
      reason: `⬜ ${tt} and ${ss} not refused aa5`,
    });
  }
  // #endregion

  // #region GET RECORDS OF TODAY
  /**
   * filtered this.allowedArtists, this.allowedEvents, this.refused op
   * 1. niet slug 2. date is today.
   * @param {string} recordType unclear|artists|allowedEvents|refused;
   * @returns list of records
   */
  getRecordsOfToday(recordType) {
    const r = {};
    if (recordType === "artists" || recordType === "unclear") {
      Object.entries(
        recordType === "artists" ? this.allowedArtists : this.unclearArtists
      ).forEach(([artistKey, artist]) => {
        if (artist[5] === this.today && artist[0] === 1) {
          r[artistKey] = artist;
        }
      });
    }
    if (recordType === "allowedEvents" || recordType === "refused") {
      Object.entries(
        recordType === "allowedEvents" ? this.allowedEvents : this.refused
      ).forEach(([eventKey, event]) => {
        if (event[2] === this.today && event[0] === 1) {
          r[eventKey] = event;
        }
      });
    }

    if (
      ["artists", "unclear", "allowedEvents", "refused"].includes(recordType)
    ) {
      return r;
    }
    throw new Error(`onbekende record ${recordType} in getRecordsOfToday`);
  }

  // #endregion GET RECORDS OF TODAY

  // #region HAS FORBIDDEN
  /**
   * vergelijkt string (title, slug, shorttext) met terms.forbidden
   * @param {string} titleslugshorttext
   * @returns successMessage met evt. artistData
   */
  hasForbidden(stringtitleslugshorttext) {
    const rommelig = stringtitleslugshorttext.toLowerCase();
    const gevondenForbidden = this.terms.forbidden.find((forbidden) => {
      return rommelig.includes(forbidden);
    });
    const isForbidden = !!gevondenForbidden;
    this.consoleGroup(
      `hasForbidden hF1`,
      {
        toScan: stringtitleslugshorttext,
        isForbidden,
      },
      "hasForbidden",
      "wit"
    );

    if (isForbidden) {
      return this.post({
        success: !!isForbidden,
        data: isForbidden,
        reason: `🟥 ${gevondenForbidden} is forbidden term aa7`,
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
    const isGood = this.terms.goodCategories.find((goodCat) =>
      stringtitleslugshorttext.includes(goodCat)
    );

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

  // #region GOOD CATEGORIES IN LONG HTML
  /**
   * antwoord letterlijk terug wat de event
   * @param {string} titleslugshorttext
   * @returns successMessage met evt. artistData
   */
  getGoodCategoriesInLongHTML(title, slug, categories) {
    if (categories && categories.length) {
      return this.post({
        success: true,
        data: categories,
        reason: `🟩 Long HTML has ${categories.join(" ")} aa91`,
      });
    }
    return this.post({
      success: null,
      data: categories,
      reason: `⬜ Long HTML no good term aa92`,
    });
  }
  // #endregion getGoodCategoriesInLongHTML

  // #region CHECK EXPL. EV. CATS
  /**
   * vergelijkt genre array met terms.goodCategories en terms.forbiddenTerms
   */
  checkExplicitEventCategories(genres) {
    const joinedGenres = genres.join(", ");

    let isGoodFound;
    isGoodFound = this.terms.globalGoodCategories.find((goodCat) =>
      joinedGenres.includes(goodCat)
    );

    if (!isGoodFound) {
      isGoodFound = this.terms.goodCategories.find((goodCat) =>
        joinedGenres.includes(goodCat)
      );
    }

    if (isGoodFound) {
      const r = `🟩 ${isGoodFound} good in expl. cats. ab2`;
      return this.post({
        success: true,
        data: isGoodFound,
        reason: r,
        reasons: [r],
      });
    }

    let isBadFound;

    isBadFound = this.terms.globalForbiddenGenres.find((badCat) =>
      joinedGenres.includes(badCat)
    );

    if (!isBadFound) {
      isBadFound = this.terms.forbidden.find((badCat) =>
        joinedGenres.includes(badCat)
      );
    }
    if (isBadFound) {
      this.consoleGroup(
        "SLECHT expliciet genres",
        { genres, isGoodFound, isBadFound },
        `checkExplicitEventCategories`
      );

      return this.post({
        success: false,
        data: isBadFound,
        reason: `🟥 ${isBadFound} bad in expl. cats. ab3`,
        reasons: [`🟥 ${isBadFound} bad in expl. cats. ab3`],
      });
    }
    this.consoleGroup(
      "niet gevonden expliciete genres",
      { genres, isGoodFound, isBadFound },
      `checkExplicitEventCategories`
    );

    return this.post({
      success: null,
      data: null,
      reason: `⬜ No matches. ab4`,
      reasons: [`⬜ No matches. ab4`],
    });
  }
  // #endregion

  // #region SPOTIFY
  /**
   * Searches spotify for title;
   * if no results, returns success null
   * if results, checks if result has forbidden genres (returns success false)
   * if results checks if result has good genres (returns success true)
   * TODO: depends on getSpotifyArtistSearch, but that also filters for good genres
   * @param {*} title
   * @param {*} slug
   * @param {*} eventDate
   * @returns {JSON} post object met success, data, reason
   */
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

    const spotifyGenresInForbidden = spotifyGenres.find((sg) =>
      this.terms.forbidden.includes(sg)
    );

    if (spotifyGenresInForbidden) {
      this.consoleGroup(
        `spotify confirmation gSC23`,
        {
          title,
          success: "🟥 verboden spotify genres gevonden",
          spotifyGenres,
          spotifyGenresInForbidden,
        },
        `getSpotifyConfirmation`,
        "magenta"
      );
      return this.post({
        success: false,
        data: spotifyGenresInForbidden,
        reason: `🟥 spotify vond verboden genre ${spotifyGenresInForbidden} ab10`,
      });
    }

    const spotifyGenresInGoodCategories = spotifyGenres.find((sg) =>
      this.terms.goodCategories.includes(sg)
    );

    if (spotifyGenresInGoodCategories) {
      this.consoleGroup(
        `spotify confirmation gSC24`,
        {
          title,
          success: "🟩 goede spotify genres gevonden",
          spotifyGenres,
          spotifyGenresInGoodCategories,
        },
        `getSpotifyConfirmation`,
        "magenta"
      );
      return this.post({
        success: true,
        data: spotifyGenresInGoodCategories,
        reason: `🟩 spotify vond goed genre ${spotifyGenresInGoodCategories} ab11`,
      });
    }

    // losser zoeken.
    const ietsHardstDan = spotifyGenres.find((sg) => sg.includes("metal"));

    if (ietsHardstDan) {
      this.consoleGroup(
        `spotify confirmation gSC25`,
        {
          title,
          success: "🟩 iets van metal gevonden in spotify genres",
          spotifyGenres,
          ietsHardstDan,
        },
        `getSpotifyConfirmation`,
        "magenta"
      );
      return this.post({
        success: true,
        data: ietsHardstDan,
        reason: `🟩 spotify vond niet direct iets maar wel match met metal: ${ietsHardstDan} ab12`,
      });
    }

    const ietsKutsDan = spotifyGenres.find((sg) =>
      this.terms.forbidden.find((forbiddenTerm) => sg.includes(forbiddenTerm))
    );

    if (ietsKutsDan) {
      this.consoleGroup(
        `spotify confirmation gSC26`,
        {
          title,
          success: "🟥 een slecht genre in spotify genres",
          spotifyGenres,
          ietsKutsDan,
        },
        `getSpotifyConfirmation`,
        "magenta"
      );
      return this.post({
        success: false,
        data: ietsKutsDan,
        reason: `🟥 spotify vond niet direct iets maar wel iets kuts: ${ietsKutsDan} ab13`,
      });
    }

    this.consoleGroup(
      `spotify confirmation gSC27`,
      {
        title,
        success: "⬜ niet relevants gevonden in spotify genres",
        spotifyGenres,
      },
      `getSpotifyConfirmation`,
      "magenta"
    );

    return this.post({
      success: null,
      data: null,
      reason: `◻️ niets gevonden met spotify ab12`,
    });
  }

  /**
   * Queries spotify; if results
   * tries to find the first hit on this name that is 'metal'
   * TODO: if filtering here, use bonus for rockgenres and malus voor shitgenres
   * and sort the result accordingly, then give the first.
   * @param {*} artist
   * @returns {*} spotifyArtistItem OR null
   */
  async getSpotifyArtistSearch(artist) {
    if (!this.spotifyAccessToken) {
      await this.getSpotifyAccessToken();
    }

    const uriComponent = encodeURIComponent(`artist:${artist}`);
    const url = `https://api.spotify.com/v1/search?q=${uriComponent}&type=artist&offset=0&limit=20&market=NL`;

    const fetchResult = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.spotifyAccessToken}`,
      },
    })
      .then((response) => response.json())
      .catch((err) => console.error(err));

    if (fetchResult?.artists?.items && fetchResult?.artists?.items.length) {
      this.consoleGroup(
        `meerdere items voor ${artist} gSAS1`,
        {
          alleArtistItems: fetchResult?.artists?.items,
        },
        `getSpotifyArtistSearch`
      );

      const eersteHitCorrecteNaam = fetchResult?.artists?.items
        .filter((hit) => hit.name.toLowerCase() === artist)
        .filter((hit) => {
          const g = hit.genres.join("; ");
          const isGood = this.terms.goodCategories.find((goodCat) =>
            g.includes(goodCat)
          );
          const isBad = this.terms.forbidden.find((badCat) =>
            g.includes(badCat)
          );
          if (isBad && isGood) return true;
          if (!isBad && !isGood) return true;
          if (isBad && !isGood) return false;
          return true;
        })[0];
      return eersteHitCorrecteNaam;
      // todo eerste teruggeven is slordig
    }
    this.consoleGroup(
      `geen resultaat voor ${artist} gSAS2`,
      {
        fetchRes: fetchResult,
      },
      `getSpotifyArtistSearch`
    );

    return null;
  }

  /**
   * Create spotify access token with spotify API
   * sets the spotify access token on Artist
   * @returns {boolean} true is successfull
   */
  async getSpotifyAccessToken() {
    let requestBody = [];
    const rbConf = {
      grant_type: `client_credentials`,
      client_id: `11bf5090af7b42848c20124d8c83fda3`,
      client_secret: `55f3635cd31d4d97a47af46c51f20443`,
    };

    // eslint-disable-next-line guard-for-in, no-restricted-syntax
    for (const property in rbConf) {
      const encodedKey = encodeURIComponent(property);
      const encodedValue = encodeURIComponent(rbConf[property]);
      requestBody.push(`${encodedKey}=${encodedValue}`);
    }
    requestBody = requestBody.join("&");

    const fetchResult = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: requestBody,
    })
      .then((response) => response.json())
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

  // #region GET METAL ENC CONF
  /**
   * ONDUIDELIJKE FUNCTIE MOGELIJK NIET AFGEMAAKT. GEEFT OOK GEEN DATA TERUG VAN METAL ENC.
   * @param {*} title
   * @returns {JSON} post object met success, data, reason
   */
  async getMetalEncyclopediaConfirmation(title, settings) {
    const teScannen = [title];

    // reedsGevondenNamen
    const rgn = Object.keys(this.allowedArtists);
    // reedsGevondenRefusedNamen
    const rgrn = Object.keys(this.refused);
    const teScannenZonderBekendeNamen = makeVerderScannen(
      teScannen,
      rgn,
      rgrn,
      settings
    );
    this.consoleGroup(
      `te scannen zonder BN gMEC32`,
      {
        teScannenZonderBekendeNamen,
      },
      "getMetalEncyclopediaConfirmation",
      "blauw"
    );

    const scanbareTitels = makePotentieeleOverigeTitels(
      settings,
      teScannenZonderBekendeNamen
    );

    const metalPromises = scanbareTitels
      .map((scanbaar) => scanbaar.workTitle)
      .map((scanbaar) => this.metalEncSingle(scanbaar));
    const metalResultaat = await this.verwerkArrayPromises(metalPromises);
    // metal enc recur

    const gevonden = metalResultaat.filter((a) => a.success === true);

    this.consoleGroup(
      `metal Enc Confirm gMEC23`,
      {
        title,
        scanbareTitels,
        heeftGevonden: !!gevonden.length,
        gevonden: gevonden.map((a) => a.titleCopy),
      },
      `getMetalEncyclopediaConfirmation`,
      "magenta"
    );

    if (!gevonden.length) {
      return this.post({
        success: null,
        data: gevonden,
        reason: `⬜ geen resultaat metal enc. ab9`,
      });
    }

    return this.post({
      success: true,
      data: gevonden,
      reason: `🟩 metal enc gevonden ac1`,
    });
  }

  verwerkArrayPromises(promiseArray) {
    return Promise.all(promiseArray)
      .then((res) => res)
      .catch((err) => {
        console.log(`fout in metal enc confirmation promises gMEC232`);
        console.log(err);
      });
  }

  async metalEncSingle(title) {
    let titleCopy = `${title}`;
    let metalString = titleCopy.replaceAll(" ", "+");
    const matchLanden = titleCopy.match(/(\(\w{2,3}\))/gi);
    if (Array.isArray(matchLanden)) {
      matchLanden.forEach((m) => {
        let land = m.replace(/\W/g, "").toUpperCase();
        if (land in this.landcodesMap) {
          const repl = RegExp(`\\(${land}\\)`, "gi");

          titleCopy = titleCopy.replaceAll(repl, "").trim();
          if (land.length === 3) {
            land = this.landcodesMap[land];
          }
          metalString += `&country[]=${land}`;
        }
      });
    }

    const metalEncycloAjaxURL = `https://www.metal-archives.com/search/ajax-advanced/searching/bands/?bandName=${metalString}&yearCreationFrom=&yearCreationTo=&status[]=1`;
    const metalRes = {
      titleCopy,
      metalString,
      metalEncycloAjaxURL,
      success: null,
    };

    return fetch(metalEncycloAjaxURL)
      .then((res) => res.json())
      .then((r) => {
        if (!r?.iTotalRecords) return metalRes;
        metalRes.fetchRes = r?.aaData;
        const correcteRij = (r?.aaData ?? []).find((rij) => {
          const rijNaam = rij[0].toLowerCase().replaceAll(/_/g, " ");
          return rijNaam.includes(titleCopy);
        });
        if (correcteRij && correcteRij.length) {
          correcteRij[1] = correcteRij[1].toLowerCase().split(/[;\/]/);
          metalRes.success = true;
          metalRes.data = correcteRij;
        } else {
          metalRes.success = null;
          metalRes.data = null;
        }
        return metalRes;
      })
      .catch((err) => {
        console.log(
          `in getMetalEncyclopediaConfirmation probleem met metal enc. fetch voor ${titleCopy} naar \n${metalEncycloAjaxURL}`
        );
        metalRes.success = "error";
        metalRes.data = err;
        return metalRes;
      });
  }

  // #endregion GET METAL ENC CONF

  // #region SCAN FOR ARTILIST
  /**
   * abstracte functie gedeeld door scanTextForAllowedArtists en zn broer
   * @param {*} eventNameOfTitle
   * @param {*} slug
   * @param {*} artistList
   * @param {string} scanningFor name of list being looked through.
   * @returns {object} key: artists, één of meer of nul
   */
  scanTextForSomeArtistList(eventNameOfTitle, slug, artistList, scanningFor) {
    const toScan = eventNameOfTitle.replaceAll(/\(.*\)/g, ""); // (usa etc eruit);

    const slugLozeArtiList = {};
    Object.entries(artistList)
      .filter(([, artist]) => artist[0] === 0)
      .forEach(([key, artist]) => {
        slugLozeArtiList[key] = artist;
      });

    const haystack = Object.keys(slugLozeArtiList);

    const gevondenKeys = haystack
      // .filter((hay) => toScan.includes(hay) || slug.includes(hay));
      .filter((hay) => toScan.includes(hay) || slug.includes(hay));

    if (!gevondenKeys || !gevondenKeys.length) {
      this.consoleGroup(
        `\n niets gevonden in scanTextForAllowedArtists atFSAL22`,
        {
          toScan,
          slug,
          scanningFor,
        },
        "scanTextForSomeArtistList",
        "blauw"
      );
      return {};
    }

    const gevondenArtiesten = {};
    gevondenKeys.forEach((key) => {
      gevondenArtiesten[key] = slugLozeArtiList[key];
    });

    this.consoleGroup(
      `scan 4 all.arts sTFSMAL43`,
      {
        slug,
        titel: eventNameOfTitle,
        gevondenArtiesten,
        scanningFor,
      },
      "scanTextForSomeArtistList",
      "blauw"
    );

    return gevondenArtiesten;
  }
  // #endregion SCAN FOR OK ARTISTS

  // #region SCAN FOR OK ARTISTS
  /**
   * scant eventNameOfTitle en slug op match met allowed artists
   * @param {*} eventNameOfTitle
   * @param {*} slug
   * @returns array met key:artiest
   */
  scanTextForAllowedArtists(eventNameOfTitle, slug) {
    return this.scanTextForSomeArtistList(
      eventNameOfTitle,
      slug,
      this.allowedArtists,
      "allowed artists"
    );
  }
  // #endregion SCAN FOR OK ARTISTS

  // #region SCAN FOR REF.D ARTISTS
  /**
   * scant eventNameOfTitle en slug op match met allowed artists
   * @param {*} eventNameOfTitle
   * @param {*} slug
   * @returns array met key:artiest
   */
  scanTextForRefusedArtists(eventNameOfTitle, slug) {
    return this.scanTextForSomeArtistList(
      eventNameOfTitle,
      slug,
      this.refused,
      "refused"
    );
  }

  // #endregion SCAN FOR REF.D ARTISTS

  // #region SCAN FOR UNCL ARTISTS
  /**
   * scant eventNameOfTitle en slug op match met allowed artists
   * @param {*} eventNameOfTitle
   * @param {*} slug
   * @returns array met key:artiest
   */
  scanTextForUnclearArtists(eventNameOfTitle, slug) {
    return this.scanTextForSomeArtistList(
      eventNameOfTitle,
      slug,
      this.unclearArtists,
      "unclear artists"
    );
  }

  // #endregion SCAN FOR UNCL. ARTIS

  // #region SC EV F ALLOW ARTISTS
  async scanEventForAllowedArtistsAsync(
    eventNameOfTitle,
    slug,
    shortText,
    settings
  ) {
    let toScan = eventNameOfTitle;
    if (settings.artistsIn.includes("shortText") && shortText) {
      const s = (shortText ?? "").toLowerCase();
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
      reason:
        artistsFound > 0
          ? `🟩 ${artistsFound} allowed artists found: ${Object.keys(
              artists
            ).join(", ")} ac3`
          : `⬜ no artists found ac4`,
    });
  }
  // #endregion SC EV F ALLOW ARTISTS

  // #region SC EV F REF.D ARTISTS
  async scanEventForRefusedArtistsAsync(
    eventNameOfTitle,
    slug,
    shortText,
    settings
  ) {
    let toScan = eventNameOfTitle;
    if (settings.artistsIn.includes("shortText") && shortText) {
      const s = (shortText ?? "").toLowerCase();
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
      reason:
        artistsFound > 0
          ? `🟩 ${artistsFound} refused artists found: ${Object.keys(
              artists
            ).join(", ")} aqwe3`
          : `⬜ no artists found aqwe4`,
    });
  }

  // #endregion SC EV F REF.D ARTISTS

  // #region API CALL FOR GENRE
  async recursiveAPICallForGenre(lijst, resultaten = []) {
    const lijstCP = [...lijst];
    const deze = lijstCP.shift();
    const APICallsRes = await this.APICallsForGenre(deze.workTitle, deze.slug);
    resultaten.push({
      title: deze.workTitle,
      slug: deze.slug,
      resultaten: APICallsRes,
    });

    if (lijstCP.length) {
      return this.recursiveAPICallForGenre(lijstCP, resultaten);
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
    const _a = Object.prototype.hasOwnProperty.call(
      this.refused,
      eventNameOfTitle
    );
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
    let metalString = titleCopy.replaceAll(" ", "+");
    const matchLanden = titleCopy.match(/(\(\w{2,3}\))/gi);
    if (Array.isArray(matchLanden)) {
      matchLanden.forEach((m) => {
        let land = m.replace(/\W/g, "").toUpperCase();
        if (land in this.landcodesMap) {
          const repl = RegExp(`\\(${land}\\)`, "gi");

          titleCopy = titleCopy.replaceAll(repl, "").trim();
          if (land.length === 3) {
            land = this.landcodesMap[land];
          }
          genreRes.land = land;
          metalString += `&country[]=${land}`;
        }
      });
    }

    const metalEncycloAjaxURL = `https://www.metal-archives.com/search/ajax-advanced/searching/bands/?bandName=${metalString}&yearCreationFrom=&yearCreationTo=&status[]=1`;
    let metalEncaaData = null;
    genreRes.metalEnc = await fetch(metalEncycloAjaxURL)
      .then((res) => res.json())
      .then((r) => {
        if (!r?.iTotalRecords) return null;
        metalEncaaData = r?.aaData;
        const correcteRij = (r?.aaData ?? []).find((rij) => {
          const rijNaam = rij[0].toLowerCase().replaceAll(/_/g, " ");
          return rijNaam.includes(eventNameOfTitle);
        });
        if (correcteRij && correcteRij.length) {
          correcteRij[1] = correcteRij[1].toLowerCase().split(/[;\/]/);
          return correcteRij;
        }
        return null;
      })
      .catch((err) => {
        console.log(
          `probleem met metal enc. fetch voor ${eventNameOfTitle} naar \n${metalEncycloAjaxURL}`
        );
        console.log(genreRes);
        return this.error(err);
      });

    genreRes.spotRes = await this.getSpotifyArtistSearch(eventNameOfTitle);
    if (genreRes?.spotRes?.external_urls) delete genreRes.spotRes.external_urls;
    if (genreRes?.spotRes?.followers) delete genreRes.spotRes.followers;
    if (genreRes?.spotRes?.images) delete genreRes.spotRes.images;
    if (genreRes?.spotRes?.popularity) delete genreRes.spotRes.popularity;
    if (genreRes?.spotRes?.type) delete genreRes.spotRes.type;

    this.consoleGroup(
      `APICallsForGenre - spotify, metalenc 23`,
      {
        eventNameOfTitle,
        slug,
        metalString,
        metalEncaaData,
        spotifyRes: genreRes.spotRes,
      },
      "APICallsForGenre",
      "blauw"
    );

    return genreRes;
  }
  // #endregion

  // #region SAVE REFUSED EVENTS

  saveRefusedEvent(title, slug, eventDate) {
    const tt = title.length < this.minLengthLang ? title + eventDate : title;
    const ss = slug.length < this.minLengthLang ? slug + eventDate : slug;

    const titleAlRefused = Object.hasOwn(this.refused, tt);
    if (titleAlRefused) {
      this.refused[tt][1] = eventDate; // TODO check welke datum nieuwer
      this.refused[tt][2] = this.today;
    } else {
      this.refused[tt] = [0, eventDate, this.today];
    }

    if (tt !== ss) {
      const slugAlRefused = Object.hasOwn(this.refused, ss);
      if (slugAlRefused) {
        this.refused[ss][1] = eventDate; // TODO check welke datum nieuwer
        this.refused[ss][2] = this.today;
      } else {
        this.refused[ss] = [1, eventDate, this.today];
      }
    }
    return this.post({
      success: true,
      data: null,
      reason: `🟩 save refused worked`,
    });
  }
  // #endregion SAVE REFUSED EVENTS

  // #region SAVE ALLOWED EVENTS
  saveAllowedEvent(title, slug, eventDate) {
    this.consoleGroup(
      `saving allowed event sAE1`,
      { title, slug, eventDate },
      "saveAllowedEvent",
      "bright"
    );

    const tt = title.length < this.minLengthLang ? title + eventDate : title;
    const ss = slug.length < this.minLengthLang ? slug + eventDate : slug;

    const titleAlAllowed = Object.hasOwn(this.allowedEvents, tt);
    if (titleAlAllowed) {
      this.allowedEvents[tt][1] = eventDate; // TODO check welke datum nieuwer
      this.allowedEvents[tt][2] = this.today;
    } else {
      this.allowedEvents[tt] = [0, eventDate, this.today];
    }

    if (tt !== ss) {
      const slugAlAllowed = Object.hasOwn(this.allowedEvents, ss);
      if (slugAlAllowed) {
        this.allowedEvents[ss][1] = eventDate; // TODO check welke datum nieuwer
        this.allowedEvents[ss][2] = this.today;
      } else {
        this.allowedEvents[ss] = [1, eventDate, this.today];
      }
    }
    return this.post({
      success: true,
      data: null,
      reason: `🟩 save allowed worked`,
    });
  }

  // #endregion SAVE ALLOWED EVENTS

  // #region SAVE ALLOWED ARTIST
  saveAllowedArtist(title, slug, spotify, metalEnc, genres, eventDate) {
    const tt = title.length < this.minLengthKort ? title + eventDate : title;
    const ss = slug.length < this.minLengthKort ? slug + eventDate : slug;

    const titleAlInArtists = Object.hasOwn(this.allowedArtists, tt);
    if (titleAlInArtists) {
      const oudeRecordCopy = [...this.allowedArtists[tt]];
      if (!oudeRecordCopy[1]) {
        oudeRecordCopy[1] = spotify;
      }
      if (!oudeRecordCopy[2]) {
        oudeRecordCopy[2] = metalEnc;
      }
      genres.forEach((gNieuw) => {
        if (!oudeRecordCopy[3].includes(gNieuw)) {
          oudeRecordCopy[3].push(gNieuw);
        }
      });
      oudeRecordCopy[4] = eventDate; // TODO event dates vergelijken
      oudeRecordCopy[5] = this.today;
      this.allowedArtists[tt] = oudeRecordCopy;
      if (tt !== ss) {
        const slugCopy = [
          1,
          oudeRecordCopy[1],
          oudeRecordCopy[2],
          [...oudeRecordCopy[3]],
          oudeRecordCopy[4],
          oudeRecordCopy[5],
        ];
        this.allowedArtists[ss] = slugCopy;
      }
    }

    return this.post({
      success: true,
      data: null,
      reason: `🟩 save allowed artist worked`,
    });
  }
  // #endregion SAVE ALLOWED ARTIST

  // #region SAVE UNCLEAR ARTIST
  saveUnclearArtist(title, slug, spotify, metalEnc, genres, eventDate) {
    const tt = title.length < this.minLengthKort ? title + eventDate : title;
    const ss = slug.length < this.minLengthKort ? slug + eventDate : slug;

    const titleAlInUnclear = Object.hasOwn(this.unclearArtists, tt);
    if (titleAlInUnclear) {
      const oudeRecordCopy = [...this.unclearArtists[tt]];
      if (!oudeRecordCopy[1]) {
        oudeRecordCopy[1] = spotify;
      }
      if (!oudeRecordCopy[2]) {
        oudeRecordCopy[2] = metalEnc;
      }
      genres.forEach((gNieuw) => {
        if (!oudeRecordCopy[3].includes(gNieuw)) {
          oudeRecordCopy[3].push(gNieuw);
        }
      });
      oudeRecordCopy[4] = eventDate; // TODO event dates vergelijken
      oudeRecordCopy[5] = this.today;
      this.unclearArtists[tt] = oudeRecordCopy;
      if (tt !== ss) {
        const slugCopy = [
          1,
          oudeRecordCopy[1],
          oudeRecordCopy[2],
          [...oudeRecordCopy[3]],
          oudeRecordCopy[4],
          oudeRecordCopy[5],
        ];
        this.unclearArtists[ss] = slugCopy;
      }
    }

    return this.post({
      success: true,
      data: null,
      reason: `🟩 save unclear artist worked`,
    });
  }
  // #endregion SAVE UNCLEAR ARTIST

  // #region PERSISTING

  fromArrayToTwoColumnRows(a, i) {
    let b =
      a.length > 20
        ? `${a.substring(0, 14)}..${a.substring(a.length - 4, a.length)}`
        : a;
    b = b.padEnd(24, " ");
    if (i % 3 === 0 && i > 0) {
      return `${b}\r`;
    }
    if (i === 0) {
      return `\n${b}`;
    }
    return b;
  }

  /**
   * Description placeholder
   *
   * @returns {*}
   */
  persistNewRefusedAndRockArtists() {
    const todaysArtists = this.getRecordsOfToday("artists");
    const artistKeys = Object.keys(todaysArtists);
    const eventsKeys = Object.keys(this.getRecordsOfToday("allowedEvents"));
    const refusedKeys = Object.keys(this.getRecordsOfToday("refused"));
    const unclearArtistsKeys = Object.keys(this.getRecordsOfToday("unclear"));

    this.consoleGroup(
      `artists, allowedEvents, refused, unclear pNRARA1`,
      {
        artists: `${artistKeys.map(this.fromArrayToTwoColumnRows).join(" ")}\n`,
        events: `${eventsKeys.map(this.fromArrayToTwoColumnRows).join(" ")}\n`,
        refused: `${refusedKeys
          .map(this.fromArrayToTwoColumnRows)
          .join(" ")}\n`,
        unclearArtists: `${unclearArtistsKeys
          .map(this.fromArrayToTwoColumnRows)
          .join(" ")}\n`,
      },
      "persistNewRefusedAndRockArtists",
      "fggreen"
    );

    if (!this.storeWritePermission) {
      if (Artists.funcsToDebug.persistNewRefusedAndRockArtists) {
        this.consoleGroup(
          "////////////////// pNRARA3",
          {
            title: "LET OP",
            onder: "de artiesten DB schrijft nog niet",
          },
          "persistNewRefusedAndRockArtists",
          "fgyellow"
        );
      }
      return this.post({
        success: null,
        data: null,
        reason: `⬜ persisting blocked by setting "storeWritePermission"`,
      });
    }
    if (this.storeSaveBackup) {
      const timeStamp = new Date()
        .toISOString()
        .replaceAll(/[:T-]/g, "")
        .substring(0, 14);
      fs.cpSync(
        `${this.storePath}/refused.json`,
        `${this.storePath}/refused-${timeStamp}.json`
      );
      fs.cpSync(
        `${this.storePath}/allowed-artists.json`,
        `${this.storePath}/allowed-artists-${timeStamp}.json`
      );
      fs.cpSync(
        `${this.storePath}/allowed-events.json`,
        `${this.storePath}/allowed-events-${timeStamp}.json`
      );
      fs.cpSync(
        `${this.storePath}/unclear-artists.json`,
        `${this.storePath}/unclear-artists-${timeStamp}.json`
      );
      this.consoleGroup(
        "Oude jsons backup pNRARA4",
        {
          title: `Oude JSON gebackupt onder timestamp ${timeStamp}`,
        },
        "persistNewRefusedAndRockArtists",
        "fgwhite"
      );
    }

    fs.writeFileSync(
      `${this.storePath}/refused.json`,
      JSON.stringify(this.refused, null, 2),
      "utf-8"
    );
    fs.writeFileSync(
      `${this.storePath}/allowed-artists.json`,
      JSON.stringify(this.allowedArtists, null, 2),
      "utf-8"
    );
    fs.writeFileSync(
      `${this.storePath}/allowed-events.json`,
      JSON.stringify(this.allowedEvents, null, 2),
      "utf-8"
    );
    fs.writeFileSync(
      `${this.storePath}/unclear-artists.json`,
      JSON.stringify(this.unclearArtists, null, 2),
      "utf-8"
    );

    return this.post({
      success: true,
      data: null,
      reason: `🟩 persisting success`,
    });
  }

  // #endregion PERSISTING

  // #region ERR, POST, CONSGROUP
  /**
   * Verpakt een error in het 'type' van de messages.
   * @param {Error} err
   * @returns {JSON} success:string,data:object,reason:string
   */
  error(err) {
    return this.post({
      success: "error",
      data: {
        error: err,
      },
      reason: err.message,
    });
  }

  /**
   * Description placeholder
   *
   * @param {*} message
   * @param {boolean} [consoleMessage=false]
   * @returns {*}
   */
  post(message, consoleMessage = false) {
    const hasSuccess = Object.prototype.hasOwnProperty.call(message, "success");
    const hasData = Object.prototype.hasOwnProperty.call(message, "data");
    const hasReason = Object.prototype.hasOwnProperty.call(message, "reason");
    if (consoleMessage) {
      console.log(message);
    }
    if (hasSuccess && hasData && hasReason) {
      return JSON.stringify(message);
    }
    console.log(message);
    throw Error("message corrupt");
  }

  /**
   * Description placeholder
   *
   * @param {*} title
   * @param {*} toConsole
   * @param {string} [funcNaam='']
   * @param {string} [kleur='fgwhite']
   */
  consoleGroup(title, toConsole, funcNaam = "", kleur = "fgwhite") {
    return Artists._consoleGroup(title, toConsole, funcNaam, kleur);
  }

  static _consoleGroup(title, toConsole, funcNaam = "", kleur = "fgwhite") {
    if (!Artists.funcsToDebug[funcNaam]) return;
    const titelKleur = consoleKleuren[kleur];
    console.group(
      titelKleur,
      `\n${title} ${funcNaam.padStart(80 - title.length, " * ")}`
    );
    if (toConsole !== null && typeof toConsole === "object") {
      const keys = Object.keys(toConsole);
      // eslint-disable-next-line no-plusplus
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (typeof toConsole[k] === "string") {
          console.log(consoleKleuren.fgyellow, `${k}: ${toConsole[k]}`);
        } else if (typeof toConsole[k] === "undefined") {
          console.log(consoleKleuren.fgyellow, `${k}: UNDEFINED`);
        } else if (Array.isArray(toConsole[k])) {
          console.log(consoleKleuren.fgyellow, k);
          console.log(toConsole[k]);
        } else if (typeof toConsole[k] === "object" && toConsole[k] !== null) {
          console.log(consoleKleuren.fgyellow, {
            _naamVanGelogdeVariabele1: k,
            ...toConsole[k],
          });
        } else {
          const str = `varName: ${k}; val: ${
            toConsole[k]
          }; typeof: ${typeof toConsole[k]}`;
          console.log(consoleKleuren.fgyellow, str);
        }
      }
    }
    console.log(titelKleur, `${`${funcNaam} `.padStart(78, "-")}`);
    console.groupEnd();
  }
  // #endregion
}
