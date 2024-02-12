/**
   * geeft de twee dingen terug nodig voor verwerken titel: getrimde lowercase, en slug
   * @param {string} eventTitle rauwe titel van event. 
   * @returns {workTitle: string, slug: string}
   */
export function slugify(eventTitle, possiblePrefix = null) {
  const workTitle = ((possiblePrefix && possiblePrefix.length)
    ? eventTitle.replace(new RegExp(possiblePrefix), '') 
    : eventTitle)
    .trim().toLowerCase();
  const slug = String(workTitle)
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
    workTitle,
    slug,
    HADHARVESTSETTINGS: possiblePrefix,
  };
}
export default function workTitleAndSlug(event, possiblePrefix = null) {
  const s = slugify(event.title, possiblePrefix);
  // eslint-disable-next-line no-param-reassign
  return Object.assign(event, s);
}
