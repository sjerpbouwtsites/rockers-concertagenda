function talkTitleAndSlug(subtype, event) {
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
    },
  };
}

function successAnswerObject(eventA, reasons, breakA = false) {
  return {
    event: eventA,
    success: true,
    break: breakA,
    reasons,
    reason: reasons.reverse().join(', '),
  };
}

function failureAnswerObject(eventA, reasons, breakA = false) {
  return {
    event: eventA,
    success: false,
    break: breakA,
    reasons,
    reason: reasons.reverse().join(', '),
  };
}

function nullAnswerObject(eventA, reasons) {
  return {
    event: eventA,
    success: null,
    break: false,
    reasons,
    reason: reasons.reverse().join(', '),
  };    
}

function errorAnswerObject(eventA, reasons, dbAnswer) {
  const reasonsCopy = Array.isArray(reasons) ? reasons : [];
  reasonsCopy.push(dbAnswer.reason);
  return {
    event: eventA,
    success: 'error',
    break: null,
    reasons,
    reason: reasons.reverse().join(', '),
  };
}

export async function asyncIsAllowedEvent(event, reasons) {
  const reasonsCopy = Array.isArray(reasons) ? reasons : [];
  this.talkToDB(talkTitleAndSlug('getAllowedEvent', event));
  await this.checkDBhasAnswered();
  if (this.lastDBAnswer.success === 'error') {
    this.handleError(this.lastDBAnswer?.data?.error, this.lastDBAnswer.reason, 'close-thread');
    return errorAnswerObject(event, reasons, this.lastDBAnswer);
  }
  if (this.lastDBAnswer.success) {
    reasonsCopy.push(this.lastDBAnswer.reason);
    this.skipFurtherChecks.push(event.workTitle);
    return successAnswerObject(event, reasonsCopy, true);
  }
  const nulledReason = this.lastDBAnswer.reason.replace('🟥', '⬜').replace('🟩', '⬜');
  reasonsCopy.push(nulledReason);
  return nullAnswerObject(event, reasonsCopy);
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

export async function asyncIsRefused(event, reasons) {
  const reasonsCopy = Array.isArray(reasons) ? reasons : [];
  this.talkToDB(talkTitleAndSlug('getRefused', event));
  await this.checkDBhasAnswered();
  if (this.lastDBAnswer.success === 'error') {
    this.handleError(this.lastDBAnswer?.data?.error, this.lastDBAnswer.reason, 'close-thread');
    return errorAnswerObject(event, reasons, this.lastDBAnswer);
  }
  if (this.lastDBAnswer.success) {
    reasonsCopy.push(this.lastDBAnswer.reason);
    return failureAnswerObject(event, reasonsCopy, true);
  }
  const nulledReason = this.lastDBAnswer.reason.replace('🟥', '⬜').replace('🟩', '⬜');
  reasonsCopy.push(nulledReason);
  return nullAnswerObject(event, reasonsCopy);
}

export async function asyncForbiddenTerms(event, reasons) {
  const reasonsCopy = Array.isArray(reasons) ? reasons : [];
  this.talkToDB({
    type: 'db-request', 
    subtype: 'hasForbidden',
    messageData: {
      string: event.workTitle + event.slug + (event?.shortText ?? '').toLowerCase(),
    },
  });
  await this.checkDBhasAnswered();
  reasonsCopy.push(this.lastDBAnswer.reason);
  if (this.lastDBAnswer.success === 'error') {
    this.handleError(this.lastDBAnswer?.data?.error, this.lastDBAnswer.reason, 'close-thread');
    return errorAnswerObject(event, reasons, this.lastDBAnswer);
  }
  if (this.lastDBAnswer.success) {
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveRefusedTemp',
      messageData: {
        title: event.workTitle,
        slug: event.slug,
        eventDate: event.shortDate,
      },
    }); 
    reasonsCopy.push(`🟧 saved in refused temp sa3`);
    return failureAnswerObject(event, reasonsCopy, true);
  }
  return successAnswerObject(event, reasonsCopy);
}

export async function asyncGoodTerms(event, reasons) {
  const reasonsCopy = Array.isArray(reasons) ? reasons : [];
  this.talkToDB({
    type: 'db-request', 
    subtype: 'hasGood',
    messageData: {
      string: event.workTitle + event.slug + (event?.shortText ?? '').toLowerCase(),
    },
  });
  await this.checkDBhasAnswered();
  this.skipFurtherChecks.push(event.workTitle);
  if (this.lastDBAnswer.success === 'error') {
    this.handleError(this.lastDBAnswer?.data?.error, this.lastDBAnswer.reason, 'close-thread');
    return errorAnswerObject(event, reasons, this.lastDBAnswer);
  }
  if (this.lastDBAnswer.success) {
    reasonsCopy.push(this.lastDBAnswer.reason);
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveAllowedEventTemp',
      messageData: {
        title: event.workTitle,
        slug: event.slug,
        eventDate: event.shortDate,
      },
    }); 
    reasonsCopy.push(`🟧 saved in allowed event temp sa4`);
    return successAnswerObject(event, reasonsCopy, true);
  }
  const nulledReason = this.lastDBAnswer.reason.replace('🟥', '⬜').replace('🟩', '⬜');
  reasonsCopy.push(nulledReason);
  return nullAnswerObject(event, reasonsCopy);
}

export async function asyncExplicitEventCategories(event, reasons) {
  const reasonsCopy = Array.isArray(reasons) ? reasons : [];

  if (!event.eventGenres || event.eventGenres < 1) {
    reasonsCopy.push(`⬜ no eventGenres to check expl. ev. cats sa5`);
    return nullAnswerObject(event, reasonsCopy);  
  }

  this.talkToDB({
    type: 'db-request', 
    subtype: 'checkExplicitEventCategories',
    messageData: {
      genres: event.eventGenres,
    },
  });
  await this.checkDBhasAnswered();
  if (this.lastDBAnswer.success === 'error') {
    this.handleError(this.lastDBAnswer?.data?.error, this.lastDBAnswer.reason, 'close-thread');
    return errorAnswerObject(event, reasons, this.lastDBAnswer);
  }
  if (this.lastDBAnswer.success) {
    // this.dirtyLog({
    //   'last db answer check explicit genres':'rue',
    //   lastDBAnswer: this.lastDBAnswer,
    // });
    reasonsCopy.push(this.lastDBAnswer.reason);
    this.skipFurtherChecks.push(event.workTitle);
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveAllowedEventTemp',
      messageData: {
        title: event.workTitle,
        slug: event.slug,
        eventDate: event.shortDate,
      },
    }); 
    reasonsCopy.push(`🟧 saved in allowed event temp sa6`);
    return successAnswerObject(event, reasonsCopy, true);
  }
  if (this.lastDBAnswer.success === false) {
    reasonsCopy.push(this.lastDBAnswer.reason);
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveRefusedTemp',
      messageData: {
        title: event.workTitle,
        slug: event.slug,
        eventDate: event.shortDate,
      },
    }); 
    reasonsCopy.push(`🟧 saved in refused temp sa7`);
    return failureAnswerObject(event, reasonsCopy, true);
  }  
  const nulledReason = this.lastDBAnswer.reason.replace('🟥', '⬜').replace('🟩', '⬜');
  reasonsCopy.push(nulledReason);
  return nullAnswerObject(event, reasonsCopy);
}

export async function asyncSpotifyConfirmation(event, reasons) {
  const reasonsCopy = Array.isArray(reasons) ? reasons : [];
  
  this.talkToDB({
    type: 'db-request', 
    subtype: 'getSpotifyConfirmation',
    messageData: {
      title: event.workTitle,
      slug: event.slug,
      eventDate: event.shortDate,
    },
  });
  await this.checkDBhasAnswered();
  if (this.lastDBAnswer.success === 'error') {
    this.handleError(this.lastDBAnswer?.data?.error, this.lastDBAnswer.reason, 'close-thread');
    return errorAnswerObject(event, reasons, this.lastDBAnswer);
  }
  if (this.lastDBAnswer.success) {
    reasonsCopy.push(this.lastDBAnswer.reason);
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
    reasonsCopy.push(`🟧 saved in allowed event temp sa8`);
    return successAnswerObject(event, reasonsCopy, true);
  }
 
  if (this.lastDBAnswer.success === false) {
    reasonsCopy.push(this.lastDBAnswer.reason);
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveRefusedTemp',
      messageData: {
        title: event.workTitle,
        slug: event.slug,
        eventDate: event.shortDate,
      },
    }); 
    reasonsCopy.push(`🟧 saved in refused event temp sa9`);
    return failureAnswerObject(event, reasonsCopy, true);
  }
  const nulledReason = this.lastDBAnswer.reason.replace('🟥', '⬜').replace('🟩', '⬜');
  reasonsCopy.push(nulledReason);
  return nullAnswerObject(event, reasonsCopy);
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

export async function asyncSaveAllowedEvent(event, reasons) {
  const reasonsCopy = Array.isArray(reasons) ? reasons : [];
  this.talkToDB({
    type: 'db-request',
    subtype: 'saveAllowedEventTemp',
    messageData: {
      title: event.workTitle.toLowerCase(), // todo ???
      slug: event.slug,
      eventDate: event.shortDate,
    },
  });    
  reasonsCopy.push(`🟧 saved in allowed event temp sb2`);
  return nullAnswerObject(event, reasonsCopy);
}

export async function asyncHarvestArtists(event, reasons) {
  const reasonsCopy = Array.isArray(reasons) ? reasons : [];
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
  // await this.checkDBhasAnswered(); // TODO HIER IS EEN RACE CONDITION ONTSTAAN
  // reasonsCopy.push(`⬜${this.lastDBAnswer.reason} sb3`);
  // return nullAnswerObject(event, reasons);
  reasonsCopy.push(`⬜ harvest gaande sb3`);
  return nullAnswerObject(event, reasons);
}
/**
 * Zoek niet alleen maar geeft het ook terug.
 * Niet direct geschikt voor async checkers
 * @param {*} mergedEvent 
 * @returns 
 */
export async function asyncScanTitleForAllowedArtists(mergedEvent) {
  this.talkToDB({
    type: 'db-request',
    subtype: 'scanTitleForAllowedArtistsAsync',
    messageData: {
      title: mergedEvent.title,
      slug: mergedEvent.slug,
      shortText: mergedEvent.shortText,
      settings: this._s.app.harvest,
    },
  });    
  await this.checkDBhasAnswered();
  if (this.lastDBAnswer.success === 'error') {
    this.handleError(this.lastDBAnswer?.data?.error, this.lastDBAnswer.reason, 'close-thread');
    return errorAnswerObject(mergedEvent, [], this.lastDBAnswer);
  }
  return { ...this.lastDBAnswer };
}

export async function asyncHasAllowedArtist(event, reasons) {
  const reasonsCopy = Array.isArray(reasons) ? reasons : [];
  await this.asyncScanTitleForAllowedArtists(event);
  await this.checkDBhasAnswered();
  reasonsCopy.push(this.lastDBAnswer.reason);
  if (this.lastDBAnswer.success === 'error') {
    this.handleError(this.lastDBAnswer?.data?.error, this.lastDBAnswer.reason, 'close-thread');
    return errorAnswerObject(event, reasons, this.lastDBAnswer);
  }
  if (this.lastDBAnswer.success) {
    return successAnswerObject(event, reasonsCopy, true);
  }
  return nullAnswerObject(event, reasonsCopy);
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
