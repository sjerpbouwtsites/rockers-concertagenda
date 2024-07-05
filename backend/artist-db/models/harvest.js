import { slugify } from "../../scrapers/gedeeld/slug.js";
import terms from "../store/terms.js";

// #region MAKE TO SCAN
/**
 * Creates a text to scan. Will not produce a slug. Because a slug of a title and shortText doesn't make any sense.
 * @param {*} title 
 * @param {*} settings 
 * @param {*} shortText 
 * @returns 
 */
function makeToScan(title, settings, shortText) {
  const toScan = [title]; 
  if (settings.artistsIn.includes('shortText') && shortText) {
    const s = (shortText ?? '').toLowerCase().trim();
    toScan.push(s);
  }
  
  return toScan.map((scan) => scan.replaceAll(/\(.*\)/g, '').trim());
}
// #endregion MAKE TO SCAN

// #region MAKE VERDER SCANNEN
/**
 * Haalt reedsGevondenNamen en reedsGevondenRefusedNamen uit de te scannen textArray toScan
 * en haalt gelijk per verwijderde naam een divider weg obv settings.
 * @param {*} toScan [tekst, tekst]
 * @param {*} reedsGevondenNamen Object.keys(this.allowedArtists)
 * @param {*} reedsGevondenRefusedNamen Object.keys(this.refused)
 * @param {*} settings app.harvest
 * @returns [tekst, tekst]
 */
export function makeVerderScannen(toScan, reedsGevondenNamen, reedsGevondenRefusedNamen, settings) {
  const reg = new RegExp(settings.dividerRex, 'i');
  return toScan.map((scan) => {
    let _scan = scan;
    reedsGevondenNamen.forEach((rg) => {
      if (_scan.includes(rg)) {
        _scan = _scan
          .replace(rg, '')
          .replace(reg, '')
          .trim();
      }
    });
    reedsGevondenRefusedNamen.forEach((rg) => {
      if (_scan.includes(rg)) {
        _scan = _scan
          .replace(rg, '')
          .replace(reg, '')
          .trim();
      }
    });
    return _scan; 
  })  
    .filter((a) => a);
}
// #endregion

// #region MAKE POTENT. OVERIGE TITELS
/**
 * gaat over tekst array heen en splitst (en flattened) de teksten mbt
 * de dividerRex uit app.harvest (metallica + harrysmarry + bla => [metallica, harrysmarry, bla])
 * de terms.eventMetaTerms worden per stuk eruit gehaald
 * en vervolgens wordt het door slugify heen gehaald.
 * @param {*} settings app.harvest
 * @param {Array} verderScannen [tekst, tekst]
 * @returns [tekst, tekst]
 */
export function makePotentieeleOverigeTitels(settings, verderScannen) {
  const reg = new RegExp(settings.dividerRex, 'i');
  return verderScannen
    .map((scan) => {
      if (Array.isArray(scan.match(reg))) {
        return scan
          .split(reg)
          .map((a) => a.trim())
          .filter((b) => b);
      }
      return scan;
    }).flat()
    .map((potTitel) => {
      let t = potTitel;
      terms.eventMetaTerms.forEach((emt) => {
        t = t.replace(emt, '').replaceAll(/\s{2,500}/g, ' ').trim();
      });
      return t;
    })
    .filter((potTitel) => potTitel.length > 3)
    .map(slugify);    
}
// #endregion

// #region MAKE REFUSED VAR
function makeRefusedVar(isSlug, _eventDate, today, venueEventUrl) {
  return [
    isSlug ? 1 : 0,
    _eventDate,
    today,
    venueEventUrl,
  ];
}
// #endregion MAKE REFUSED VAR

// #region MAKE VOL ARTIST VAR
function makeVolArtistVar(isSlug, spotifyID, gevondenArtiest, _eventDate, today, venueEventUrl) {
  return [
    isSlug ? 1 : 0,
    spotifyID,
    encodeURI(gevondenArtiest.title),
    gevondenArtiest.genres,
    _eventDate,
    today,
    venueEventUrl,
  ];    
}
// #endregion MAKE VOL ARTIST VAR

// #region GENRE API RESP MAP 1
function genreAPIRespMap1(ga) {
  const spotifyGenres = ga?.resultaten?.spotRes?.genres ?? [];
  const metalGenres = (ga?.resultaten?.metalEnc?.[1] ?? []);
  // eslint-disable-next-line no-param-reassign
  ga.genres = [...spotifyGenres, ...metalGenres, ...this._eventGenres]
    .filter((a) => a);
  return ga;
}
// #endregion GENRE API RESP MAP 1

// #region GENRE API RESP MAP 2
function genreAPIRespMap2(ga) {
  const id = ga.resultaten?.spotRes?.id ?? null;
  this._gevondenArtiesten[ga.title] = makeVolArtistVar(
    false, id, ga, this._eventDate, this._today, this._venueEventUrl);
    
  this._allowedArtists[ga.title] = makeVolArtistVar(
    false, id ?? null, ga, this._eventDate, this._today, this._venueEventUrl);
  if (ga.title !== ga.slug) {
    this._allowedArtists[ga.slug] = makeVolArtistVar(
      true, id ?? null, ga, this._eventDate, this._today, this._venueEventUrl);        
  }
  return ga;
}
// #endregion GENRE API RESP MAP 2

export async function harvestArtists(
  title, slug, shortText, settings, eventDate, venueEventUrl, eventGenres = []) {
  const toScan = makeToScan(title, settings, shortText);
  // geen slug want het is een lap tekst en een slug is dan raar gebrabbel.
  // als er een artiest gevonden wordt dan moet dat op titel.
  const reedsGevonden = toScan.map((scan) => this.scanTextForAllowedArtists(scan, '')).filter((a) => Object.keys(a).length);
  const reedsGevondenRefused = toScan.map((scan) => this.scanTextForRefusedArtists(scan, '')).filter((a) => Object.keys(a).length);

  // #region REEDS GEVONDEN
  let reedsGevondenHACK = {}; // TODO HACK
  Object.values(reedsGevonden).forEach((r) => {
    reedsGevondenHACK = Object.assign(reedsGevondenHACK, r);
  });
  const reedsGevondenNamen = reedsGevonden.map((g) => Object.keys(g)).flat(); 
  const reedsGevondenRefusedNamen = reedsGevondenRefused.map((g) => Object.keys(g)).flat(); 
  // #endregion REEDS GEVONDEN

  // #region VERDER SCANNEN
  // reedsGevondenNamen
  const rgn = reedsGevondenNamen;
  // reedsGevondenRefusedNamen
  const rgfn = reedsGevondenRefusedNamen;
  const verderScannen = makeVerderScannen(toScan, rgn, rgfn, settings);

  if (!verderScannen.length) {
    this.consoleGroup(`Niets te vinden dat reeds bekende namen in hA2`, 
      { title, bronTekst: toScan, reedsGevondenNamen }, 
      'harvestArtists',
      'fgred');      
    return this.post({
      success: true,
      data: reedsGevondenHACK,
      reason: `niets gevonden dat er niet reeds was qq1`,
    });      
  }
  // #endregion VERDER SCANNEN

  // #region POTENT. OVERIGE TITELS
  const potentieeleOverigeTitels = makePotentieeleOverigeTitels(settings, verderScannen);
      
  if (!potentieeleOverigeTitels.length) {
    this.consoleGroup(`Na tweede bew. niets verder gevonden om te onderzoeken hA3`, { title, bronTekst: toScan, naVerwijderenBekendeNamen: verderScannen }, 'harvestArtists', 'fgmagenta');      
    return this.post({
      success: true,
      data: reedsGevondenHACK,
      reason: `niets gevonden dat er niet reeds was qq2`,
    });      
  }
  // #endregion POTENT. OVERIGE TITELS

  // #region GENRE API & FILTER
  const genreAPIResp = await this.recursiveAPICallForGenre(potentieeleOverigeTitels);
  const gevondenArtiesten = {};
  
  genreAPIResp
    .map(genreAPIRespMap1, { _eventGenres: eventGenres })
    .filter((ga) => {
      const explGenreCheckRes = JSON.parse(this.checkExplicitEventCategories(ga.genres));
  
      if (explGenreCheckRes.success) {
        return true;
      } if (explGenreCheckRes.success === false) {
        this.refused[ga.title] = makeRefusedVar(false, eventDate, this.today, venueEventUrl);
        if (ga.title !== ga.slug) {
          this.refused[ga.slug] = makeRefusedVar(true, eventDate, this.today, venueEventUrl);
        }
        return false;
      } 
      this.unclearArtists[ga.title] = makeVolArtistVar(
        false, ga.resultaten?.spotRes?.id ?? null, ga, eventDate, this.today, venueEventUrl);
      if (ga.title !== ga.slug) {
        this.unclearArtists[ga.slug] = makeVolArtistVar(
          true, ga.resultaten?.spotRes?.id ?? null, ga, eventDate, this.today, venueEventUrl);
      }
      return false;
    })
    .map(genreAPIRespMap2, {
      _gevondenArtiesten: gevondenArtiesten,
      _eventDate: eventDate,
      _today: this.today,
      _allowedArtists: this.allowedArtists,
      _venueEventUrl: venueEventUrl,
    }); 

  const artiestenInEvent = { ...reedsGevondenHACK, ...gevondenArtiesten };

  this.consoleGroup(`harvest artist debug bundel hA99`, {
    eventTitle: title,
    // alBekendeArtists: reedsGevonden,
    namenAlBekendeArtists: reedsGevondenNamen,
    rawTextToScan: toScan,
    naVerwBekendeArtists: verderScannen,
    naSplitsenOpruimenBron: potentieeleOverigeTitels,
    APIResponseArtists: genreAPIResp,
  }, 'harvestArtists', 'fggreen');

  return this.post({
    success: true,
    data: artiestenInEvent,
    reason: `succesvolle harvest hA6`,
  });
}

export default null;
