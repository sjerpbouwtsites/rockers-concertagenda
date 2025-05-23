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

  const ts = ".event__top .event__content";
  const selectors = {
    ...standaardSelectorConfig,
    textBody: ts,
    mediaEls: [
      "iframe[src*='youtube']",
      "iframe[src*='bandcamp']",
      "iframe[src*='spotify']",
    ].join(", "),
    removeEmptyHTMLFrom: ts,
    removeHTMLWithStrings: ["Extra informatie", "Let op bij het kopen"],
  };

  selectors.removeEls.concat([]);

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
