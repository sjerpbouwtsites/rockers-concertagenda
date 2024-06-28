import { slugify } from "../../scrapers/gedeeld/slug.js";
import terms from "../store/terms.js";

// #region MAKE TO SCAN
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
function makeVerderScannen(toScan, reedsGevondenNamen) {
  return toScan.map((scan) => {
    let _scan = scan;
    reedsGevondenNamen.forEach((rg) => {
      _scan = _scan.replace(rg, '').trim();
    });
    return _scan;  
  })
    .filter((a) => a);
}
// #endregion

// #region MAKE POTENT. OVERIGE TITELS
function makePotentieeleOverigeTitels(settings, verderScannen) {
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
function makeRefusedVar(isSlug, _eventDate, today) {
  return [
    isSlug ? 1 : 0,
    _eventDate,
    today,
  ];
}
// #endregion MAKE REFUSED VAR

// #region MAKE VOL ARTIST VAR
function makeVolArtistVar(isSlug, spotifyID, gevondenArtiest, _eventDate, today) {
  return [
    isSlug ? 1 : 0,
    spotifyID,
    encodeURI(gevondenArtiest.title),
    gevondenArtiest.genres,
    _eventDate,
    today,
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
  this._gevondenArtiesten[ga.title] = makeVolArtistVar(
    false, ga.resultaten?.spotRes?.id ?? null, ga, this._eventDate, this._today);
    
  this._allowedArtistsTemp[ga.title] = makeVolArtistVar(
    false, ga.resultaten?.spotRes?.id ?? null, ga, this._eventDate, this._today);
  if (ga.title !== ga.slug) {
    this._allowedArtistsTemp[ga.slug] = makeVolArtistVar(
      true, ga.resultaten?.spotRes?.id ?? null, ga, this._eventDate, this._today);        
  }
  return ga;
}
// #endregion GENRE API RESP MAP 2

export async function harvestArtists(
  title, slug, shortText, settings, eventDate, eventGenres = []) {
  const toScan = makeToScan(title, settings, shortText);
  const reedsGevonden = toScan.map((scan) => this.scanTextForAllowedArtists(scan, '')).filter((a) => Object.keys(a).length);

  // #region REEDS GEVONDEN
  let reedsGevondenHACK = {}; // TODO HACK
  Object.values(reedsGevonden).forEach((r) => {
    reedsGevondenHACK = Object.assign(reedsGevondenHACK, r);
  });
  const reedsGevondenNamen = reedsGevonden.map((g) => Object.keys(g)).flat(); 
  // #endregion REEDS GEVONDEN

  // #region VERDER SCANNEN
  const verderScannen = makeVerderScannen(toScan, reedsGevondenNamen);

  if (!verderScannen.length) {
    this.consoleGroup(`Niets te vinden dat reeds bekende namen in hA2`, { title, bronTekst: toScan, reedsGevondenNamen }, 'harvestArtists', 'fgred');      
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
        this.refusedTemp[ga.title] = makeRefusedVar(false, eventDate, this.today);
        if (ga.title !== ga.slug) {
          this.refusedTemp[ga.slug] = makeRefusedVar(true, eventDate, this.today);
        }
        return false;
      } 
      this.unclearArtistsTemp[ga.title] = makeVolArtistVar(
        false, ga.resultaten?.spotRes?.id ?? null, ga, eventDate, this.today);
      if (ga.title !== ga.slug) {
        this.unclearArtistsTemp[ga.slug] = makeVolArtistVar(
          true, ga.resultaten?.spotRes?.id ?? null, ga, eventDate, this.today);
      }
      return false;
    })
    .map(genreAPIRespMap2, {
      _gevondenArtiesten: gevondenArtiesten,
      _eventDate: eventDate,
      _today: this.today,
      _allowedArtistsTemp: this.allowedArtistsTemp,
    }); 

  const artiestenInEvent = { ...reedsGevondenHACK, ...gevondenArtiesten };

  this.consoleGroup(`harvest artist debug bundel hA99`, {
    eventTitle: title,
    alBekendeArtists: reedsGevonden,
    namenAlBekendeArtists: reedsGevondenNamen,
    rawTextToScan: toScan,
    naVerwBekendeArtists: verderScannen,
    naSplitsenOpruimenBron: potentieeleOverigeTitels,
    APIResponseArtists: genreAPIResp,
  }, 'harvestArtist', 'fggreen');

  return this.post({
    success: true,
    data: artiestenInEvent,
    reason: `succesvolle harvest hA6`,
  });
}

export default null;
