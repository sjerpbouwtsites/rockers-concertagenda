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
  gewoonBerichtDumpen,
} from "../gedeeld/longHTML.js";

export default async function longTextSocialsIframes(page, event) {
  //bibelot hack
  const bibelotKrijgEenZiekte = await page.evaluate(() => {
    document.querySelectorAll("[data-src]").forEach((el) => {
      el.src = el.getAttribute("data-src");
    });

    const youtubeIDHTML = Array.from(document.querySelectorAll("video-embed"))
      .map((a) => a.innerHTML)
      .join("");
    const ytMatches = youtubeIDHTML.matchAll(/src=\"(.*)\"/g);
    const ytMatchesArray = Array.from(new Set(ytMatches));
    return [youtubeIDHTML, ytMatchesArray];
  });

  let ditIsDeImgURL = null;
  let ditIsDeYoutubeID = null;
  try {
    if (Array.isArray(bibelotKrijgEenZiekte)) {
      if (bibelotKrijgEenZiekte.length > 1) {
        const a = bibelotKrijgEenZiekte[1];
        if (Array.isArray(a) && a.length) {
          const b = a[0];
          if (Array.isArray(b) && b.length) {
            ditIsDeImgURL = b[1];
          }
        }
      }
    }
  } catch (error) {
    handleError(error);
  }

  if (ditIsDeImgURL) {
    ditIsDeYoutubeID = ditIsDeImgURL
      .replace(`https://i.ytimg.com/vi/`, "")
      .replace(`/sddefault.jpg`, "");
    ("https://i.ytimg.com/vi/ewcVSP81ZpI/sddefault.jpg");
  }

  const res = {
    mediaForHTML: null,
    textForHTML: null,
  };
  // in standaard removeEls saveTheseAttrsFirst removeAttrsLastStep
  // removeHTMLWithStrings htmlElementsWithStringsToRemove
  const selectors = {
    ...standaardSelectorConfig,
    textBody: ".programmainfo-block .large-order-1",
    mediaEls: null,
    removeEmptyHTMLFrom: ".programmainfo-block .large-order-1",
  };

  await ongewensteHTMLUitHeleDocument(page, selectors);

  await eersteLadingOverbodigeAttributesWeg(page, selectors);

  //res.mediaForHTML = await maakMediaHTMLBronnen(page, selectors, event);
  // bibelot HACK!!!
  if (ditIsDeYoutubeID) {
    res.mediaForHTML = [
      {
        outer: null,
        src: null,
        id: ditIsDeYoutubeID,
        type: "youtube",
      },
    ];
  }
  gewoonBerichtDumpen({
    ditIsDeImgURL,
    title: event.title,
    mediaData: res.mediaForHTML,
  });

  await hinderlijkeTekstenEruitSlopen(page, selectors);

  await formatHTMLTextBodyNaarEenSpatieMax(page, selectors);

  await removeElementsRecursive(page, selectors);

  await legeHTMLElementenVerwijderen(page, selectors);

  res.textForHTML = await maakTekstBlokHTML(page, selectors);

  return res;
}
