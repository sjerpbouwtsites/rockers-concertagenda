/* eslint-disable  */
/* eslint-disable indent */
/* global document */

import {
  handleError,
  ongewensteHTMLUitHeleDocument,
  eersteLadingOverbodigeAttributesWeg,
  maakMediaHTMLBronnen,
  hinderlijkeTekstenEruitSlopen,
  formatHTMLTextBodyNaarEenSpatieMax,
  legeHTMLElementenVerwijderen,
  maakTekstBlokHTML,
  standaardSelectorConfig,
  removeElementsRecursive,
} from "../gedeeld/longHTML.js";

export default async function longTextSocialsIframes(page, event) {
  const res = {
    mediaForHTML: null,
    textForHTML: null,
  };
  // in standaard removeEls saveTheseAttrsFirst removeAttrsLastStep
  // removeHTMLWithStrings htmlElementsWithStringsToRemove

  const ts = ".block-system-main-block .group-header .container .kmtContent";
  const selectors = {
    ...standaardSelectorConfig,
    textBody: ts,
    mediaEls: [
      ".video-embed-field-lazy",
      "iframe[src*='bandcamp']",
      "iframe[src*='spotify']",
    ].join(", "),
    removeEmptyHTMLFrom: ts,
    removeHTMLWithStrings: [],
  };

  selectors.removeEls.concat([`${ts} .video-embed-field-lazy`]);

  res.mediaForHTML = await maakMediaHTMLBronnen(page, selectors, event);

  await ongewensteHTMLUitHeleDocument(page, selectors);

  await eersteLadingOverbodigeAttributesWeg(page, selectors);

  await hinderlijkeTekstenEruitSlopen(page, selectors);

  await formatHTMLTextBodyNaarEenSpatieMax(page, selectors);

  await removeElementsRecursive(page, selectors);

  await legeHTMLElementenVerwijderen(page, selectors);

  res.textForHTML = await maakTekstBlokHTML(page, selectors);

  return res;
}
