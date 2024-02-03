import fs from 'fs';
import Artists from './artists.js';

const ArtistInst = new Artists(
  {
    modelPath: "./", 
    storePath: "../store", 
  },
);
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
    slug:_slug,
  };
}

const { title, slug } = slugify('the fall of troy + the godfathers en therapy? samen op een ticket!');
const eventDate = '240203';
const artistInstAns = ArtistInst.do({
  request: 'scanTitleForAllowedArtists',
  data: {
    title: title.length < 10 ? title + eventDate : title,
    slug: slug.length < 10 ? slug + eventDate : slug,
  },
});

console.log(artistInstAns);
