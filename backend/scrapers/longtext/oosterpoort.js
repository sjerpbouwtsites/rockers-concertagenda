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

  const ts = ".event__language .layout--is-text";
  const selectors = {
    ...standaardSelectorConfig,
    textBody: ts,
    mediaEls: [
      ".layout--is-video .layout__media",
      "iframe[src*='bandcamp']",
      "iframe[src*='spotify']",
    ].join(", "),
    removeEmptyHTMLFrom: ts,
    removeHTMLWithStrings: [],
  };

  selectors.removeEls.concat([
    ".layout__info__link [href*='facebook'][href*='events']",
    ".layout--is-video .layout__media",
    "iframe[src*='bandcamp']",
    "iframe[src*='spotify']",
  ]);

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
