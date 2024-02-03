/* eslint-disable no-console */
import fs from 'fs';
import Artists from './artists.js';

const ArtistInst = new Artists({
  modelPath: './',
  storePath: '../store',
});
/**
 * GERAUSCHT UIT ABSTRACT SCRAPER
 * geeft de twee dingen terug nodig voor verwerken titel: getrimde lowercase, en slug
 * @param {string} eventTitle rauwe titel van event.
 * @returns {workTitle: string, slug: string}
 */
function slugify(eventTitle) {
  const _eventTitle = eventTitle.trim().toLowerCase();
  const _slug = String(_eventTitle)
    .replaceAll(/[ÁÀÂàÂÄÃÅ]/gi, 'a')
    .replaceAll(/Ç/gi, 'c')
    .replaceAll(/[ÉÈÊË]/gi, 'e')
    .replaceAll(/[ÍÌÎÏ]/gi, 'i')
    .replaceAll(/Ñ/gi, 'n')
    .replaceAll(/[ÓÒÔÖÕØ]/gi, 'o')
    .replaceAll(/[ÚÙÛÜ]/gi, 'u')
    .replace(/[^a-zA-Z0-9]/gi, '')
    .replace(/\s+/gi, '')
    .replace(/-/gi, '')
    .replaceAll(/\u2013/gi, '-')
    .replaceAll(/[\u00ad|\u2009|\u200b|\u00a0]/gi, '')
    .replaceAll(/[\u2019|\u2018]/gi, "'");
  return {
    title: _eventTitle,
    slug: _slug,
  };
}

const nul013titels = [
  'HEDEX + blabal & mc smarry',
  'Jay Reeve',
  'The Rocketman',
  'Bad Omens',
  'Emil Bulls',
  'Simple Plan',
  'Absynthe Minded',
  "Cat's Cult",
  'Irste Kruikenconcert',
  'Twidde Kruikenconcert',
  'Kaia Kater',
  'Gladde Paling Presenteert: VISSA',
  'HARBOUR',
  'Vunzige Deuntjes',
  'Tjeukefist',
  'Currents',
  'Suzan & Freek',
  'Brihang',
  'Slope',
  'Suzan & Freek',
  'Thrice',
  'Kids With Buns',
  'Lijpe',
  'Suffocation',
  'Life of Agony',
  'Lionheart',
  'Therion',
  'Douwe Bob',
  "Quiz'm",
  'Kraantje Pappie',
  'BUG A BOO',
  'B-FRONT X PHUTURE NOIZE',
  'NACHTNET',
  'DragonForce & Amaranthe',
  'Frank Carter & The Rattlesnakes',
  'The Dean & Friends XXL',
  'Duncan Laurence',
  'Pijn',
  'Subquake x Hospitality',
  'TLM AIRLINES',
  'REBØUNCE',
  'NE-YO',
  'Gallus',
  "Cat's Cult",
  'Jiri11',
  'Froukje',
  'VOLTAGE',
  'The Dirty Daddies',
  'Vroeg Pieken',
  'Skryptonite',
  'MIKE',
  'Joost',
  'Queen Must Go On',
  'Skálmöld',
  'Joost',
  'Nachtcollege',
  'Bumble B. Boy',
  'Back To The Disco',
  'Zoë Tauran',
  'DESIRE',
  'FLEMMING',
  'Lowest Creature',
  'Prins S. en de Geit',
  'King Nun',
  'Afro Gasm',
  'Claude',
  'Pierce The Veil',
  'Terror + Nasty',
  'CultuurTeelt',
  "Cat's Cult",
  'RONDÉ',
  'Tank and The Bangas & Metropole Orkest',
  'Club Tropicana ft. Whamania!',
  'TRI POLOSKI XL',
  'The Hillbilly Moonshiners',
  'The Elvis Concert 2024',
  'Kraak & Smaak (live)',
  'WC Experience',
  'CHO',
  'The Spark',
  'Roadburn Festival 2024',
  'Roadburn Festival 2024',
  'Roadburn Festival 2024',
  'Roadburn Festival 2024',
  'Bryson Tiller',
  'Vroeg Pieken',
  "Cat's Cult",
  "Fun Lovin' Criminals + Rudeboy plays UDS",
  'Train',
  'Tusky',
  'Lysistrata',
  'BKJN events presents Bulletproof',
  'VV',
  'Jon Allen & The Luna Kings',
  'Leela James',
 
  'DI-RECT',
  'Voyager',
  'MEUTE',
  'Nena',
  'Beartooth',
  'Beartooth',
  'Edwin Evers Band',
  'Moving Pictures',
  'De Unie',
  'Classic Hits In Concert',
  'The Dirty Daddies',
  'Veul Gère',
  'Veul Gère',
  'Tokio Hotel',
];
// eslint-disable-next-line no-console

console.log(); console.log(); console.log();

let namenTeDoen = ['DragonForce & Amaranthe'];
const heeftSplitser = namenTeDoen[0].match(/\+|&/gi);
if (Array.isArray(heeftSplitser)) {
  const splits = namenTeDoen[0].split(/\+|&/);
  namenTeDoen = namenTeDoen.concat(splits.map((a) => a.trim()));
}
console.log(namenTeDoen);

async function doeAlleNamen(lijst, resultaten = []) {
  const deze = lijst.shift();
  console.log(`deze is ${deze}`);
  const { title, slug } = slugify(deze);
  const artistInstAns = await ArtistInst.do({
    request: 'APICallsForGenre',
    data: {
      title,
      slug,
    },
  });
  resultaten.push(artistInstAns);
  
  console.log(JSON.parse(artistInstAns));
  
  if (lijst.length) {
    return doeAlleNamen(lijst, resultaten);
  }
  return resultaten;
}

async function init() {
  const namenRes = await doeAlleNamen(namenTeDoen);
  console.log(namenRes);
  console.log('klaar');
}

init();
