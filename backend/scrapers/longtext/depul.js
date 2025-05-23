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
  const selectors = {
    ...standaardSelectorConfig,
    textBody: "#content-box",
    mediaEls: [".video-wrap iframe"].join(", "),
    removeEmptyHTMLFrom: "#content-box",
  };

  selectors.removeEls.concat([
    ".video-wrap",
    ".social-content",
    ".facebook-comments",
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
