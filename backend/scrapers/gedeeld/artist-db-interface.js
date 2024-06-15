import DbInterFaceToScraper from './db-interface-to-scraper.js';

// ifNotAllowedRefuse: 'asyncIfNotAllowedRefuse',
// allowedEvent: 'asyncIsAllowedEvent',
// refused: 'asyncIsRefused',
// forbiddenTerms: 'asyncForbiddenTerms',
// hasGoodTerms: 'asyncGoodTerms',
// saveAllowedEvent: 'asyncSaveAllowedEvent',
// harvestArtists: 'asyncHarvestArtists',
// spotifyConfirmation: 'asyncSpotifyConfirmation', 
// metalEncyclopediaConfirmation: 'asyncMetalEncyclopediaConfirmation', 
// explicitEventGenres: 'asyncExplicitEventCategories',
// hasAllowedArtist: 'asyncHasAllowedArtist',
// success: 'asyncSuccess',

function talkTitleAndSlug(subtype, event, extraData = {}) {
  const s = event.shortDate;
  return {
    type: 'db-request', 
    subtype,
    messageData: {
      title: event.workTitle.length < 10 
        ? event.workTitle + s
        : event.workTitle,
      slug: event.slug.length < 10 
        ? event.slug + s 
        : event.slug,
      eventDate: s,
      ...extraData,
    },
  };
}

export async function asyncIsAllowedEvent(event, olderReasons) {
  this.talkToDB(talkTitleAndSlug('getAllowedEvent', event));
  const dbAnswer = await this.checkDBhasAnswered();
  
  const DBToScraper = new DbInterFaceToScraper(dbAnswer, olderReasons, 'async is allowed event');
  
  if (DBToScraper.isSuccess) DBToScraper.setBreak(true);
  DBToScraper.setReason();
  if (!DBToScraper.isError) return DBToScraper;
  
  this.handleError(DBToScraper?.data?.error, DBToScraper.lastReason, 'close-thread');
  return DBToScraper;
}

export async function asyncSaveRefused(event) {
  this.talkToDB({
    type: 'db-request',
    subtype: 'saveRefusedTemp',
    messageData: {
      title: event.workTitle,
      slug: event.slug,
      eventDate: event.shortDate,
    },
  });   
}

export async function asyncIfNotAllowedRefuse(event, reasons) {
  const reasonsCopy = Array.isArray(reasons) ? reasons : [];
  
  const isAllowed = await this.asyncIsAllowedEvent(event, reasons);
  if (this.lastDBAnswer.success === 'error') {
    this.handleError(this.lastDBAnswer?.data?.error, this.lastDBAnswer.reason, 'close-thread');
    return errorAnswerObject(event, reasons, this.lastDBAnswer);
  }  
  reasonsCopy.push(this.lastDBAnswer.reason);
  if (isAllowed.success === false || isAllowed.success === null) {
    reasonsCopy.push(`🟥 because not present in allowed: ifNotAllowedRefuse sa1`);
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveRefusedTemp',
      messageData: {
        title: event.workTitle,
        slug: event.slug,
        eventDate: event.shortDate,
      },
    }); 
    reasonsCopy.push(`🟧 saved in refused temp sa2`);
    return failureAnswerObject(event, reasonsCopy, true);
  }
  return successAnswerObject(event, reasonsCopy, true);
}

export async function asyncIsRefused(event, olderReasons = []) {
  this.talkToDB(talkTitleAndSlug('getRefused', event));
  const dbAnswer = await this.checkDBhasAnswered();
  this.dirtyDebug(dbAnswer);
  const DBToScraper = new DbInterFaceToScraper(dbAnswer, olderReasons, 'async is refused');
  DBToScraper.reverseSuccessLogic().setReason();

  if (DBToScraper.isFailed) DBToScraper.setBreak(true);
  if (!DBToScraper.isError) return DBToScraper;
  
  this.handleError(DBToScraper?.data?.error, DBToScraper.lastReason, 'close-thread');
  return DBToScraper;
}

export async function asyncForbiddenTerms(event, olderReasons) {
  this.talkToDB({
    type: 'db-request', 
    subtype: 'hasForbidden',
    messageData: {
      string: event.workTitle + event.slug + (event?.shortText ?? '').toLowerCase(),
    },
  });
  const dbAnswer = await this.checkDBhasAnswered();
  const DBToScraper = new DbInterFaceToScraper(dbAnswer, olderReasons, 'async forbidden terms');
  DBToScraper.reverseSuccessLogic();  

  if (DBToScraper.isFailed) DBToScraper.setBreak(true);
  if (!DBToScraper.isError) return DBToScraper;

  this.handleError(DBToScraper?.data?.error, DBToScraper.lastReason, 'close-thread');
  return DBToScraper;
}

export async function asyncSuccess(event, olderReasons) {
  this.talkToDB(talkTitleAndSlug('makeSuccess', event, {
    string: event.workTitle + event.slug + (event?.shortText ?? '').toLowerCase(),
  }));
  const dbAnswer = await this.checkDBhasAnswered();
  const DBToScraper = new DbInterFaceToScraper(dbAnswer, olderReasons, 'async success');
  DBToScraper.setReason();
  
  DBToScraper.setBreak(true);
  return DBToScraper;
}

export async function asyncGoodTerms(event, olderReasons) {
  this.talkToDB(talkTitleAndSlug('hasGood', event, {
    string: event.workTitle + event.slug + (event?.shortText ?? '').toLowerCase(),
  }));
  const dbAnswer = await this.checkDBhasAnswered();
  const DBToScraper = new DbInterFaceToScraper(dbAnswer, olderReasons, 'async good terms');
  DBToScraper.setReason();

  if (DBToScraper.isSuccess) {
    DBToScraper.setBreak(true);
    return DBToScraper;
  }
  if (!DBToScraper.isError) return DBToScraper;
  
  this.handleError(DBToScraper?.data?.error, DBToScraper.lastReason, 'close-thread');
  return DBToScraper;
}

export async function asyncExplicitEventCategories(event, olderReasons) {
  if (!(event?.eventGenres ?? null) || event?.eventGenres.length < 1) {
    const DBToScraper = new DbInterFaceToScraper({
      success: null,
      data: null,
      reason: `geen genres op event ${event.workTitle}`,
      reasons: [`geen genres op event ${event.workTitle}`],
    }, olderReasons, 'async explicit event categories');
    return DBToScraper;
  }

  const talkTitleAndSlugObj = talkTitleAndSlug('checkExplicitEventCategories', event, {
    genres: event?.eventGenres ?? [],
  });

  this.talkToDB(talkTitleAndSlugObj);
  
  const dbAnswer = await this.checkDBhasAnswered();
  const DBToScraper = new DbInterFaceToScraper(dbAnswer, olderReasons, 'async explicit event categories');
  DBToScraper.setReason();

  if (DBToScraper.isSuccess) DBToScraper.setBreak(true);
  if (!DBToScraper.isError) return DBToScraper;
  
  this.handleError(DBToScraper?.data?.error, DBToScraper.lastReason, 'close-thread');
  return DBToScraper;
}

export async function asyncSpotifyConfirmation(event, olderReasons) {
  this.talkToDB({
    type: 'db-request', 
    subtype: 'getSpotifyConfirmation',
    messageData: {
      title: event.workTitle,
      slug: event.slug,
      eventDate: event.shortDate,
    },
  });
  const dbAnswer = await this.checkDBhasAnswered();
  const DBToScraper = new DbInterFaceToScraper(dbAnswer, olderReasons, 'async spotify confirmation');
  if (DBToScraper.isSuccess || DBToScraper.isFailed) DBToScraper.setBreak(true);
  if (!DBToScraper.isError) return DBToScraper;
  
  this.handleError(DBToScraper?.data?.error, DBToScraper.lastReason, 'close-thread');
  return DBToScraper;
}

export async function asyncMetalEncyclopediaConfirmation(event, reasons) {
  const reasonsCopy = Array.isArray(reasons) ? reasons : [];
  
  this.talkToDB({
    type: 'db-request', 
    subtype: 'getMetalEncyclopediaConfirmation',
    messageData: {
      title: event.workTitle,
    },
  });
  await this.checkDBhasAnswered();
  if (this.lastDBAnswer.success === 'error') {
    this.handleError(this.lastDBAnswer?.data?.error, this.lastDBAnswer.reason, 'close-thread');
    return errorAnswerObject(event, reasons, this.lastDBAnswer);
  }
  reasonsCopy.push(this.lastDBAnswer.reason);

  if (this.lastDBAnswer.success) {
    this.skipFurtherChecks.push(event.workTitle);
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveAllowedTemp',
      messageData: {
        title: event.workTitle,
        slug: event.slug,
        eventDate: event.shortDate,
      },
    }); 
    reasonsCopy.push(`🟧 saved in allowed event temp sb1`);
    return failureAnswerObject(event, reasonsCopy, true);
  }
  return successAnswerObject(event, reasonsCopy);
}

export async function asyncSaveAllowedEvent(event) {
  this.talkToDB({
    type: 'db-request',
    subtype: 'saveAllowedEventTemp',
    messageData: {
      title: event.workTitle.toLowerCase(), // todo ???
      slug: event.slug,
      eventDate: event.shortDate,
    },
  });
}

export async function asyncHarvestArtists(event) {
  this.talkToDB({
    type: 'db-request',
    subtype: 'harvestArtists',
    messageData: {
      title: event.workTitle,
      slug: event.slug,
      shortText: event.shortText,
      settings: this._s.app.harvest,
      eventDate: event.shortDate,
      eventGenres: event?.eventGenres ?? [],
    },
  });    
  const dbans = await this.checkDBhasAnswered();
  const DBToScraper = new DbInterFaceToScraper(dbans, [], 'async harvest artists');
  return DBToScraper;
}
/**
 * Zoek niet alleen maar geeft het ook terug.
 * Niet direct geschikt voor async checkers
 * @param {*} mergedEvent 
 * @returns 
 */
export async function asyncScanTitleForAllowedArtists(mergedEvent, olderReasons = []) {
  this.talkToDB(talkTitleAndSlug('scanTitleForAllowedArtistsAsync', mergedEvent, {
    shortText: mergedEvent.shortText,
    settings: this._s.app.harvest,
  }));    

  const dbAnswer = await this.checkDBhasAnswered();
  const DBToScraper = new DbInterFaceToScraper(dbAnswer, olderReasons, 'async scan title for allowed artists');
  DBToScraper.setReason();
  if (!DBToScraper.isError) return DBToScraper;
  
  this.handleError(DBToScraper?.data?.error, DBToScraper.lastReason, 'close-thread');
  return DBToScraper;
}

export async function asyncHasAllowedArtist(event, olderReasons) {
  const getScanDBScraper = 
    await this.asyncScanTitleForAllowedArtists(event, olderReasons);

  if (getScanDBScraper.isSuccess) {
    getScanDBScraper.setBreak(true);
    return getScanDBScraper;
  }
  if (!getScanDBScraper.isError) return getScanDBScraper;
  
  this.handleError(getScanDBScraper?.data?.error, getScanDBScraper.lastReason, 'close-thread');
  return getScanDBScraper;
}

export default null;
    
//   async asyncCheckIsRock(event, reasons) {
//     const reasonsCopy = Array.isArray(reasons) ? reasons : [];
//     const isRockRes = await this.isRock(event);
//     reasonsCopy.push(isRockRes.reason);
//     if (isRockRes.success) {
//       this.talkToDB({
//         type: 'db-request',
//         subtype: 'saveAllowedTitle',
//         messageData: {
//           string: event.title,
//           reason: reasonsCopy.reverse().join(', '),
//         },
//       });    
//       return {
//         event,
//         break: true,
//         reason: reasonsCopy.reverse().join(','),
//         success: true,
//       };
//     } 
//     return {
//       break: false,
//       success: null,
//       event,
//       reasons: reasonsCopy,
//     };    
//   },

//   async wikipedia(event, title) {
//     const workingTitle = title || this.cleanupEventTitle(event.title);

//     const page = await this.browser.newPage();
//     let wikiPage;
//     try {
//       const wikifiedTitled = workingTitle
//         .split(' ')
//         .filter((a) => a)
//         .map((word) => word[0].toUpperCase() + word.substring(1, word.length))
//         .join('_')
//         .replace(/\W/g, '');
//       wikiPage = `https://en.wikipedia.org/wiki/${wikifiedTitled}`;
//       await page.goto(wikiPage);
//     } catch (error) {
//       this.handleError(error, `<a href='${event?.venueEventUrl}' class='error-link get-page-info-timeout'>wikititel maken fout ${workerData.name}</a> ${workingTitle}`);
//     }

//     const pageDoesNotExist = await page.evaluate(() => document.getElementById('noarticletext'));

//     if (pageDoesNotExist) {
//       const searchPage = await page.evaluate(
//         () => document.getElementById('noarticletext').querySelector('[href*=search]')?.href ?? '',
//       );
//       await page.goto(searchPage);
//       if (!searchPage) {
//         return {
//           event,
//           reason: 'wiki page not found, als no search page',
//           success: false,
//         };
//       }
//       const matchingResults = await page.evaluate(
//         // eslint-disable-next-line no-shadow
//         ({ title }) =>
//           Array.from(document.querySelectorAll('.mw-search-results [href*=wiki]'))
//             .filter((anker) => anker.textContent.toLowerCase().includes(title.toLowerCase()))
//             .map((anker) => anker.href),
//         { title },
//       );
//       if (!matchingResults || !Array.isArray(matchingResults) || !matchingResults.length) {
//         return {
//           event,
//           reason: 'Not found title of event on wiki search page',
//           success: false,
//         };
//       }
//       await page.goto(matchingResults[0]);
//     }

//     const wikiRockt = await page.evaluate(
//       ({ wikipediaGoodGenres }) => {
//         let found = false;
//         let i = 0;
//         while (found === false && i < wikipediaGoodGenres.length) {
//           const thisSelector = wikipediaGoodGenres[i];
//           if (document.querySelector(`.infobox ${thisSelector}`)) {
//             found = true;
//           }
//           i += 1;
//         }
//         return found;
//       },
//       { wikipediaGoodGenres: terms.wikipediaGoodGenres },
//     );
//     if (!page.isClosed()) page.close();
//     if (wikiRockt) {
//       return {
//         event,
//         success: true,
//         url: wikiPage,
//         reason: `found on <a class='single-event-check-reason wikipedia wikipedia--success' href='${wikiPage}'>wikipedia</a>`,
//       };
//     }
//     if (!page.isClosed()) page.close();
//     return {
//       event,
//       success: false,
//       reason: 'wiki catch return',
//     };
//   }

//   /**
//    * methode waarmee mainPageAsyncCheck vervangen kan worden.
//    * kijkt naar 'voornaamste titel', dwz de event.title tot aan een '&'.
//    *
//    * @param {*} event
//    * @memberof AbstractScraper
//    */
//   async isRock(event, overloadTitles = null, recursiveTitle = null) {
//     const workingTitle = recursiveTitle || this.cleanupEventTitle(event.title);

//     const metalEncyclopediaRes = await this.metalEncyclopedia(event, workingTitle);
//     if (metalEncyclopediaRes.success) {
//       return metalEncyclopediaRes;
//     }

//     const wikipediaRes = await this.wikipedia(event, workingTitle);
//     if (wikipediaRes.success) {
//       return wikipediaRes;
//     }

//     if (Array.isArray(overloadTitles)) {
//       const overloadTitlesCopy = [...overloadTitles];
//       const thisOverloadTitle = overloadTitlesCopy.shift();
//       const extraRes = await this.isRock(event, null, thisOverloadTitle);
//       if (extraRes.success) {
//         return extraRes;
//       }
//       if (overloadTitles.length) {
//         return this.isRock(event, overloadTitlesCopy);
//       }
//     }

//     return {
//       event,
//       success: false,
//       reason: `<a class='single-event-check-reason wikipedia wikipedia--failure metal-encyclopedie metal-encyclopedie--failure' href='${wikipediaRes.url}'>wikipedia</a> + <a href='${metalEncyclopediaRes.url}'>metal encyclopedia</a> 👎`,
//     };
//   }
