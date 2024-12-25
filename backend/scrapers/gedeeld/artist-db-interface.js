import DbInterFaceToScraper from "./db-interface-to-scraper.js";

/**
 * Klein helper functietje
 * @param {*} subtype
 * @param {*} event
 * @param {*} extraData
 * @returns
 */
function talkTitleAndSlug(subtype, event, extraData = {}) {
    const s = event.shortDate;
    return {
        type: "db-request",
        subtype,
        messageData: {
            title:
                event.workTitle.length < 7
                    ? event.workTitle + s
                    : event.workTitle,
            slug: event.slug.length < 7 ? event.slug + s : event.slug,
            eventDate: s,
            ...extraData
        }
    };
}

// #region SCR.NAMEN & DBNAMEN
// ifNotAllowedRefuse: 'asyncIfNotAllowedRefuse',
// allowedEvent: 'asyncIsAllowedEvent',
// refused: 'asyncIsRefused',
// forbiddenTerms: 'asyncForgetAllowedEventbiddenTerms',
// hasGoodTerms: 'asyncGoodTerms',
// harvestArtists: 'asyncHarvestArtists',
// spotifyConfirmation: 'asyncSpotifyConfirmation',
// metalEncyclopediaConfirmation: 'asyncMetalEncyclopediaConfirmation',
// explicitEventGenres: 'asyncExplicitEventCategories',
// hasAllowedArtist: 'asyncHasAllowedArtist',

// saveAllowedEvent: 'asyncSaveAllowedEvent',
// saveRefusedEvent: 'asyncSaveRefused',
// saveRefused: 'asyncSaveRefused',
// saveAllowedArtist: 'asyncSaveAllowedArtist',
// saveUnclearArtist: 'asyncSaveUnclearArtist',

// success: 'asyncSuccess',
// failure: 'asyncFailure',
// #endregion SCR.NAMEN & DBNAMEN

// #region AS. IS ALLOWED EVENT
export async function asyncIsAllowedEvent(event, olderReasons) {
    this.talkToDB(talkTitleAndSlug("getAllowedEvent", event));
    const dbAnswer = await this.checkDBhasAnswered();

    const DBToScraper = new DbInterFaceToScraper(
        dbAnswer,
        olderReasons,
        "async is allowed event"
    );

    if (DBToScraper.isSuccess) DBToScraper.setBreak(true);
    DBToScraper.setReason();
    if (!DBToScraper.isError) return DBToScraper;

    this.handleError(
        DBToScraper?.data?.error,
        DBToScraper.lastReason,
        "close-thread"
    );
    return DBToScraper;
}
// #endregion AS. IS ALLOWED EVENT

// #region AS. IS REFUSED
export async function asyncIsRefused(event, olderReasons = []) {
    this.talkToDB(talkTitleAndSlug("getRefused", event));
    const dbAnswer = await this.checkDBhasAnswered();
    const DBToScraper = new DbInterFaceToScraper(
        dbAnswer,
        olderReasons,
        "async is refused"
    );
    DBToScraper.reverseSuccessLogic().setReason();

    if (DBToScraper.isFailed) DBToScraper.setBreak(true);
    if (!DBToScraper.isError) return DBToScraper;

    this.handleError(
        DBToScraper?.data?.error,
        DBToScraper.lastReason,
        "close-thread"
    );
    return DBToScraper;
}
// #endregion AS. IS REFUSED

// #region AS. FORBIDDEN TERMS
export async function asyncForbiddenTerms(event, olderReasons) {
    this.talkToDB({
        type: "db-request",
        subtype: "hasForbidden",
        messageData: {
            string:
                event.title +
                event.slug +
                (event?.shortText ?? "").toLowerCase() +
                (event?.genres ?? "")
        }
    });
    const dbAnswer = await this.checkDBhasAnswered();
    const DBToScraper = new DbInterFaceToScraper(
        dbAnswer,
        olderReasons,
        "async forbidden terms"
    );
    DBToScraper.reverseSuccessLogic().setReason();

    if (DBToScraper.isFailed) DBToScraper.setBreak(true);
    if (!DBToScraper.isError) return DBToScraper;

    this.handleError(
        DBToScraper?.data?.error,
        DBToScraper.lastReason,
        "close-thread"
    );
    return DBToScraper;
}
// #endregion AS. FORBIDDEN TERMS

// #region AS. SUCCESS
export async function asyncSuccess(event, olderReasons) {
    this.talkToDB(
        talkTitleAndSlug("makeSuccess", event, {
            string:
                event.workTitle +
                event.slug +
                (event?.shortText ?? "").toLowerCase()
        })
    );
    const dbAnswer = await this.checkDBhasAnswered();
    const DBToScraper = new DbInterFaceToScraper(
        dbAnswer,
        olderReasons,
        "async success"
    );
    DBToScraper.setReason();

    DBToScraper.setBreak(true);
    return DBToScraper;
}
// #endregion AS. SUCCESS

// #region AS. FAILURE
export async function asyncFailure(event, olderReasons) {
    this.talkToDB(
        talkTitleAndSlug("makeFailure", event, {
            string:
                event.workTitle +
                event.slug +
                (event?.shortText ?? "").toLowerCase()
        })
    );
    const dbAnswer = await this.checkDBhasAnswered();
    const DBToScraper = new DbInterFaceToScraper(
        dbAnswer,
        olderReasons,
        "async failure"
    );
    DBToScraper.setReason();

    DBToScraper.setBreak(true);
    return DBToScraper;
}
// #endregion AS. FAILURE

// #region AS. GOOD TERMS
export async function asyncGoodTerms(event, olderReasons) {
    this.talkToDB(
        talkTitleAndSlug("hasGood", event, {
            string:
                event.workTitle +
                event.slug +
                (event?.shortText ?? "").toLowerCase() +
                (event?.genres ?? "")
        })
    );
    const dbAnswer = await this.checkDBhasAnswered();
    const DBToScraper = new DbInterFaceToScraper(
        dbAnswer,
        olderReasons,
        "async good terms"
    );
    DBToScraper.setReason();

    if (DBToScraper.isSuccess) {
        DBToScraper.setBreak(true);
        return DBToScraper;
    }
    if (!DBToScraper.isError) return DBToScraper;

    this.handleError(
        DBToScraper?.data?.error,
        DBToScraper.lastReason,
        "close-thread"
    );
    return DBToScraper;
}
// #endregion AS. GOOD TERMS

// #region AS. EXPL EVENT CATS
export async function asyncExplicitEventCategories(event, olderReasons) {
    if (!(event?.eventGenres ?? null) || event?.eventGenres.length < 1) {
        const DBToScraper = new DbInterFaceToScraper(
            {
                success: null,
                data: null,
                reason: `geen genres op event ${event.workTitle}`,
                reasons: [`geen genres op event ${event.workTitle}`]
            },
            olderReasons,
            "async explicit event categories"
        );
        return DBToScraper;
    }

    const talkTitleAndSlugObj = talkTitleAndSlug(
        "checkExplicitEventCategories",
        event,
        {
            genres: event?.eventGenres ?? []
        }
    );

    this.talkToDB(talkTitleAndSlugObj);

    const dbAnswer = await this.checkDBhasAnswered();
    const DBToScraper = new DbInterFaceToScraper(
        dbAnswer,
        olderReasons,
        "async explicit event categories"
    );
    DBToScraper.setReason();

    if (DBToScraper.isSuccess) DBToScraper.setBreak(true);
    if (!DBToScraper.isError) return DBToScraper;

    this.handleError(
        DBToScraper?.data?.error,
        DBToScraper.lastReason,
        "close-thread"
    );
    return DBToScraper;
}
// #endregion AS. EXPL EV CATS

// #region AS. SPOTIFY CONF
export async function asyncSpotifyConfirmation(event, olderReasons) {
    this.talkToDB({
        type: "db-request",
        subtype: "getSpotifyConfirmation",
        messageData: {
            title: event.workTitle,
            slug: event.slug,
            eventDate: event.shortDate
        }
    });
    const dbAnswer = await this.checkDBhasAnswered();
    const DBToScraper = new DbInterFaceToScraper(
        dbAnswer,
        olderReasons,
        "async spotify confirmation"
    );
    DBToScraper.setReason();
    if (DBToScraper.isSuccess || DBToScraper.isFailed)
        DBToScraper.setBreak(true);
    if (!DBToScraper.isError) return DBToScraper;

    this.handleError(
        DBToScraper?.data?.error,
        DBToScraper.lastReason,
        "close-thread"
    );
    return DBToScraper;
}
// #endregion AS. SPOTIFY CONF

// #region AS. METAL ENC CONF
export async function asyncMetalEncyclopediaConfirmation(event, olderReasons) {
    this.talkToDB({
        type: "db-request",
        subtype: "getMetalEncyclopediaConfirmation",
        messageData: {
            title: event.workTitle,
            settings: this._s.app.harvest
        }
    });
    const dbAnswer = await this.checkDBhasAnswered();
    const DBToScraper = new DbInterFaceToScraper(
        dbAnswer,
        olderReasons,
        "async metal enc confirmation"
    );
    DBToScraper.setReason();
    if (DBToScraper.isSuccess || DBToScraper.isFailed)
        DBToScraper.setBreak(true);
    if (!DBToScraper.isError) return DBToScraper;

    this.handleError(
        DBToScraper?.data?.error,
        DBToScraper.lastReason,
        "close-thread"
    );
    return DBToScraper;
}
// #endregion AS. METAL ENC CONFIRMATION

// #region AS. SAVE REFUSED
export async function asyncSaveRefused(event) {
    this.talkToDB({
        type: "db-request",
        subtype: "saveRefusedEvent",
        messageData: {
            string: event.workTitle.toLowerCase(),
            slug: event.slug,
            eventDate: event.shortDate
        }
    });
}
// #endregion AS. SAVE REFUSED

// #region AS. SAVE ALLOWEDEVENT
export async function asyncSaveAllowedEvent(event) {
    this.talkToDB({
        type: "db-request",
        subtype: "saveAllowedEvent",
        messageData: {
            string: event.workTitle.toLowerCase(), // todo ???
            slug: event.slug,
            eventDate: event.shortDate
        }
    });
    const dbAnswer = await this.checkDBhasAnswered();
    const DBToScraper = new DbInterFaceToScraper(
        dbAnswer,
        event.reasons,
        "async save allowed event"
    );
    DBToScraper.setReason();
    if (!DBToScraper.isError) return DBToScraper;

    this.handleError(
        DBToScraper?.data?.error,
        DBToScraper.lastReason,
        "close-thread"
    );
    return DBToScraper;
}
// #endregion AS. SAVE ALLOWED EVENT

// #region AS. SAVE ALLOWED ARTI
export async function asyncSaveAllowedArtist(event) {
    this.talkToDB({
        type: "db-request",
        subtype: "saveAllowedArtist",
        messageData: {
            string: event.workTitle.toLowerCase(),
            slug: event.slug,
            spotify: event?.spotify ?? null,
            metalEnc: event?.metalEnc ?? null,
            eventDate: event.shortDate
        }
    });
}
// #endregion AS. SAVE ALLOWED ARTIST

// #region AS. SAVE UNCLEAR ARTI
export async function asyncSaveUnclearArtist(event) {
    this.talkToDB({
        type: "db-request",
        subtype: "saveUnclearArtist",
        messageData: {
            string: event.workTitle.toLowerCase(),
            slug: event.slug,
            spotify: event?.spotify ?? null,
            metalEnc: event?.metalEnc ?? null,
            eventDate: event.shortDate
        }
    });
}
// #endregion AS. SAVE UNCLEAR ARTIST

// #region AS. HARVEST ARTISTS
export async function asyncHarvestArtists(event) {
    this.talkToDB({
        type: "db-request",
        subtype: "harvestArtists",
        messageData: {
            title: event.workTitle,
            string: event.workTitle,
            slug: event.slug,
            shortText: event.shortText,
            settings: this._s.app.harvest,
            eventDate: event.shortDate,
            eventGenres: event?.eventGenres ?? [],
            venueEventUrl: event.venueEventUrl
        }
    });
    const dbans = await this.checkDBhasAnswered();
    const DBToScraper = new DbInterFaceToScraper(
        dbans,
        [],
        "async harvest artists"
    );
    return DBToScraper;
}
// #endregion AS. HARVEST ARTISTS

/**
 * Zoek niet alleen maar geeft het ook terug.
 * Niet direct geschikt voor async checkers
 * @param {*} mergedEvent
 * @returns
 */ // #region AS. SCAN EVENT FOR ALLOWED ARTISTS
export async function asyncScanEventForAllowedArtists(
    mergedEvent,
    olderReasons = []
) {
    this.talkToDB(
        talkTitleAndSlug("scanEventForAllowedArtistsAsync", mergedEvent, {
            shortText: mergedEvent.shortText,
            settings: this._s.app.harvest
        })
    );

    const dbAnswer = await this.checkDBhasAnswered();
    const DBToScraper = new DbInterFaceToScraper(
        dbAnswer,
        olderReasons,
        "async scan title for allowed artists"
    );
    DBToScraper.setReason();
    if (!DBToScraper.isError) return DBToScraper;

    this.handleError(
        DBToScraper?.data?.error,
        DBToScraper.lastReason,
        "close-thread"
    );
    return DBToScraper;
}
// #endregion AS. SCAN EVENT FOR ALLOWED ARTISTS

// #region AS. HAS ALLOWED ARTI
export async function asyncHasAllowedArtist(event, olderReasons) {
    const getScanDBScraper = await this.asyncScanEventForAllowedArtists(
        event,
        olderReasons
    );

    if (getScanDBScraper.isSuccess) {
        getScanDBScraper.setBreak(true);
        return getScanDBScraper;
    }
    if (!getScanDBScraper.isError) return getScanDBScraper;

    this.handleError(
        getScanDBScraper?.data?.error,
        getScanDBScraper.lastReason,
        "close-thread"
    );
    return getScanDBScraper;
}
// #endregion AS. HAS ALLOWED ARTI

export default null;

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
