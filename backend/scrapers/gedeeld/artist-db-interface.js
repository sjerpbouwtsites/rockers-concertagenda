function dateNaarShortDate(date) {
  if (date.length < 10) {
    throw new Error(`${date} is geen isostring`);
  }
  return date.substring(2, 10).replaceAll('-', '');
}
function talkTitleAndSlug(subtype, event) {
  return {
    type: 'db-request', 
    subtype,
    messageData: {
      title: event.workTitle.length < 10 
        ? event.workTitle + dateNaarShortDate(event.start) 
        : event.workTitle,
      slug: event.slug.length < 10 
        ? event.slug + dateNaarShortDate(event.start) 
        : event.slug,
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

export async function asyncIsAllowedEvent(event, reasons) {
  const reasonsCopy = Array.isArray(reasons) ? reasons : [];
  this.talkToDB(talkTitleAndSlug('getAllowedEvent', event));
  await this.checkDBhasAnswered();
  reasonsCopy.push(this.lastDBAnswer.reason);
  if (this.lastDBAnswer.success) {
    this.skipFurtherChecks.push(event.workTitle);
    return successAnswerObject(event, reasonsCopy, true);
  }
  return nullAnswerObject(event, reasons);
}
export async function asyncIsRefused(event, reasons) {
  const reasonsCopy = Array.isArray(reasons) ? reasons : [];
  this.talkToDB(talkTitleAndSlug('getRefused', event));
  await this.checkDBhasAnswered();
  reasonsCopy.push(this.lastDBAnswer.reason);
  if (this.lastDBAnswer.success) {
    return failureAnswerObject(event, reasonsCopy, true);
  }
  return nullAnswerObject(event, reasons);
}

export async function asyncForbiddenTerms(event, reasons) {
  const reasonsCopy = Array.isArray(reasons) ? reasons : [];
  this.talkToDB({
    type: 'db-request', 
    subtype: 'hasForbidden',
    messageData: {
      string: event.workTitle + event.slug + event.shortText.toLowerCase(),
    },
  });
  await this.checkDBhasAnswered();
  reasonsCopy.push(this.lastDBAnswer.reason);
  if (this.lastDBAnswer.success) {
    this.talkToDB({
      type: 'db-request',
      subtype: 'saveRefusedTemp',
      messageData: {
        title: event.workTitle,
        slug: event.slug,
        eventDate: dateNaarShortDate(event.start),
      },
    }); 

    return failureAnswerObject(event, reasonsCopy, true);
  }
  return successAnswerObject(event, reasonsCopy);
}

export async function asyncSaveAllowedEvent(event, reasons) {
  this.talkToDB({
    type: 'db-request',
    subtype: 'saveAllowedEventTemp',
    messageData: {
      title: event.workTitle.toLowerCase(), // todo ???
      slug: event.slug,
      eventDate: dateNaarShortDate(event.start),
    },
  });    
  return nullAnswerObject(event, reasons);
}

export async function asyncHarvestArtists(event, reasons) {
  this.talkToDB({
    type: 'db-request',
    subtype: 'harvestArtists',
    messageData: {
      title: event.workTitle,
      slug: event.slug,
      settings: this._s.app.splitting,
      eventDate: dateNaarShortDate(event.start),
    },
  });    
  return nullAnswerObject(event, reasons);
}

export default null;
    
//   async asyncCheckEmptySuccess(event, reasons) {
//     const reasonsCopy = Array.isArray(reasons) ? reasons : [];
//     reasonsCopy.push('empty success');
//     return {
//       break: true,
//       success: true,
//       event,
//       reasons: reasonsCopy,
//       reason: reasonsCopy.reverse().join(', '),
//     };    
//   },
    
//   async asyncCheckEmptyFailure(event, reasons) {
//     const reasonsCopy = Array.isArray(reasons) ? reasons : [];
//     reasonsCopy.push('empty failure');
//     return {
//       break: true,
//       success: false,
//       event,
//       reasons: reasonsCopy,
//       reason: reasonsCopy.reverse().join(', '),
//     };    
//   },

//   async asyncCheckGoodTerms(event, reasons) {
//     const reasonsCopy = Array.isArray(reasons) ? reasons : [];
//     const goodTermsRes = await this.hasGoodTerms(event);
//     reasonsCopy.push(goodTermsRes.reason);
//     if (goodTermsRes.success) {
//       this.skipFurtherChecks.push(event.title);
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
//         reason: reasonsCopy.reverse().join(','),
//         reasons: reasonsCopy,
//         success: true,
//         break: true,
//       };
//     }  
//     return {
//       break: false,
//       success: null,
//       event,
//       reasons: reasonsCopy,
//     };    
//   },
    
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
    
//   async asyncCheckIsEvent(event, reasons) {
//     const reasonsCopy = Array.isArray(reasons) ? reasons : [];
//     this.talkToDB({
//       type: 'db-request',
//       subtype: 'isRockEvent',
//       messageData: {
//         string: event.title,
//       },
//     });
//     await this.checkDBhasAnswered();
//     reasonsCopy.push(this.lastDBAnswer.reason);
//     if (this.lastDBAnswer.success) {
//       this.skipFurtherChecks.push(event.title);
//       return {
//         event,
//         reasons: reasonsCopy,
//         success: true,
//         break: true,
//         reason: reasonsCopy.reverse().join(', '),
//       };
//     } 
//     return {
//       break: false,
//       success: null,
//       event,
//       reasons: reasonsCopy,
//     };    
//   },
    
//   async asyncSaveAllowed(event, reasons) {
//     const reasonsCopy = Array.isArray(reasons) ? reasons : [];
//     this.talkToDB({
//       type: 'db-request',
//       subtype: 'saveAllowedTitle',
//       messageData: {
//         string: event.title,      
//       },
//     });    
//     return {
//       break: true,
//       success: true,
//       event,
//       reasons: reasonsCopy,
//       reason: reasonsCopy.reverse().join(', '),
//     };    
//   },
    
//   async asyncSaveRefused(event, reasons) {
//     const reasonsCopy = Array.isArray(reasons) ? reasons : [];
//     this.talkToDB({
//       type: 'db-request',
//       subtype: 'saveRefusedTitle',
//       messageData: {
//         string: event.title,
//         reason: reasons.reverse().join(', '),
//       },
//     });   
//     return {
//       break: true,
//       success: true,
//       event,
//       reasons: reasonsCopy,
//       reason: reasonsCopy.reverse().join(', '),
//     };    
//   },
    
//   async asyncGetArtists(event, reasons) {
//     const eventCopy = { ...event };
//     this.talkToDB({
//       type: 'db-request',
//       subtype: 'getArtistsFromEventTitle',
//       messageData: {
//         string: eventCopy.title,
//       },
//     });
//     await this.checkDBhasAnswered();
//     eventCopy.artists = this.lastDBAnswer.artists;
//     return {
//       event:eventCopy,
//       reasons,
//       success: !!this.lastDBAnswer.success,
//       break: false,
//       reason: reasons.reverse().join(', '),
//     };
//   },
// };

//   /**
//    * Loopt over terms.goodCategories en kijkt of ze in
//    * een bepaalde text voorkomen, standaard bestaande uit de titel en de shorttext van
//    * de event.
//    *
//    * @param {*} event
//    * @param {string} [keysToCheck=['title', 'shortText']]
//    * @return {event, {bool} succes, {string} reason}
//    * @memberof AbstractScraper
//    */
//   async hasGoodTerms(event, keysToCheck) {
//     const keysToCheck2 = keysToCheck || ['title', 'shortText'];
//     let combinedTextToCheck = '';
//     for (let i = 0; i < keysToCheck2.length; i += 1) {
//       try {
//         const v = event[keysToCheck2[i]];
//         if (v) {
//           combinedTextToCheck += v.toLowerCase();
//         }
//       } catch (error) {
//         this.dirtyDebug(
//           {
//             fout: `fout maken controle text met keys, key${keysToCheck2[i]}`,
//             toDebug: {
//               event,
//             },
//           },
//           'hasGoodTerms',
//         );
//       }
//     }

//     const hasGoodTerm = terms.goodCategories.find((goodTerm) =>
//       combinedTextToCheck.includes(goodTerm),
//     );

//     if (hasGoodTerm) {
//       return {
//         event,
//         success: true,
//         reason: `Goed in ${keysToCheck2.join('')}`,
//       };
//     }

//     return {
//       event,
//       success: false,
//       reason: `Geen bevestiging gekregen uit ${keysToCheck2.join(';')} ${combinedTextToCheck}`,
//     };
//   }

//   /**
//    * Loopt over terms.forbiddenTerms en kijkt of ze in
//    * een bepaalde text voorkomen, standaard bestaande uit de titel en de shorttext van
//    * de event.
//    *
//    * @param {*} event
//    * @param {string} [keysToCheck=['title', 'shortText']]
//    * @return {event, {bool} succes, {string} reason}
//    * @memberof AbstractScraper
//    */
//   async hasForbiddenTerms(event, keysToCheck) {
//     const keysToCheck2 = Array.isArray(keysToCheck) ? keysToCheck : ['title', 'shortText'];
//     let combinedTextToCheck = '';
//     for (let i = 0; i < keysToCheck2.length; i += 1) {
//       const v = event[keysToCheck2[i]];
//       if (v) {
//         combinedTextToCheck += `${v} `;
//       }
//     }
//     combinedTextToCheck = combinedTextToCheck.toLowerCase();
//     const hasForbiddenTerm = terms.forbidden.find((forbiddenTerm) =>
//       combinedTextToCheck.includes(forbiddenTerm),
//     );
//     if (hasForbiddenTerm) {
//       return {
//         event,
//         success: true,
//         reason: `verboden genres gevonden in ${keysToCheck2.join('; ')}`,
//       };
//     }

//     return {
//       event,
//       success: false,
//       reason: `verboden genres niet gevonden in ${keysToCheck2.join('; ')}.`,
//     };
//   }

//   saveRefusedTitle(title) {
//     this.rockRefuseList = `${title}\n${this.rockRefuseList}`;
//     this.rockRefuseListNew = `${title}\n${this.rockRefuseListNew}`;
//   }

//   saveAllowedTitle(title) {
//     this.rockAllowList = `${title}\n${this.rockAllowList}`;
//     this.rockAllowListNew = `${title}\n${this.rockAllowListNew}`;
//   }

//   async saveRockRefusedAllowedToFile() {
//     if (this.rockAllowListNew) {
//       const huiLijst = fs.readFileSync(fsDirections.isRockAllow, 'utf-8');
//       fs.writeFileSync(fsDirections.isRockAllow, `${this.rockAllowListNew}\n${huiLijst}`, 'utf-8');
//     }
//     if (this.rockRefuseListNew) {
//       const huiLijst = fs.readFileSync(fsDirections.isRockRefuse, 'utf-8');
//       fs.writeFileSync(
//         fsDirections.isRockRefuse,
//         `${this.rockRefuseListNew}\n${huiLijst}`,
//         'utf-8',
//       );
//     }
//     return true;
//   }

//   async rockAllowListCheck(event, title) {
//     const workingTitle = title || this.cleanupEventTitle(event.title);
//     const workingTitleInRockAllowList = this.rockAllowList.includes(workingTitle);
//     const fullTitleInRockAllowList = this.rockAllowList.includes(event.title);
//     const success = workingTitleInRockAllowList || fullTitleInRockAllowList;
//     return {
//       event,
//       success,
//       reason: `${workingTitle} ${success ? 'in' : 'NOT in'} allowed 🛴 list`,
//     };
//   }

//   async rockRefuseListCheck(event, title) {
//     const workingTitle = title || this.cleanupEventTitle(event.title);
//     const workingTitleInRockRefuseList = this.rockRefuseList.includes(workingTitle);
//     const fullTitleInRockRefuseList = this.rockRefuseList.includes(event.title);
//     const success = workingTitleInRockRefuseList || fullTitleInRockRefuseList;
//     return {
//       event,
//       success,
//       reason: `${workingTitle} ${success ? 'in' : 'NOT in'} refuse 🚮 list`,
//     };
//   }

//   async metalEncyclopedia(event, title) {
//     const workingTitle = title || this.cleanupEventTitle(event.title);

//     const MetalEncFriendlyTitle = workingTitle.replace(/\s/g, '_');
//     const metalEncUrl = `https://www.metal-archives.com/search/ajax-band-search/?field=name&query=${MetalEncFriendlyTitle}`;
//     const foundInMetalEncyclopedia = await fetch(metalEncUrl)
//       .then((result) => result.json())
//       .then((parsedJson) => {
//         if (parsedJson.iTotalRecords < 1) return false;
//         const bandNamesAreMainTitle = parsedJson.aaData.some((bandData) => {
//           let match;
//           try {
//             match = bandData[0].match(/>(.*)<\//);
//             if (Array.isArray(match) && match.length > 1) {
//               return match[1].toLowerCase() === workingTitle;
//             }
//           } catch (error) {
//             return false;
//           }
//           return false;
//         });
//         return bandNamesAreMainTitle;
//       })
//       .catch((metalEncError) => {
//         this.handleError(metalEncError, `<a href='${event?.venueEventUrl}' class='error-link get-page-info-timeout'>singlePage ${workerData.name} metal enc. error</a>`);
//         return {
//           event,
//           success: false,
//           url: metalEncUrl,
//           reason: metalEncError.message,
//         };
//       });
//     if (foundInMetalEncyclopedia) {
//       return {
//         event,
//         success: true,
//         url: metalEncUrl,
//         reason: `found in <a class='single-event-check-reason metal-encyclopedie metal-encyclopedie--success' href='${metalEncUrl}'>metal encyclopedia</a>`,
//       };
//     }
//     return {
//       success: false,
//       url: metalEncUrl,
//       reason: 'no result metal enc',
//       event,
//     };
//   }

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
