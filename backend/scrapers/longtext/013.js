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
    standaardSelectorConfig
} from "../gedeeld/longHTML.js";

export default async function longTextSocialsIframes(page, event) {
    //013 hacks
    await page.evaluate(() => {
        document.querySelector("article h1").parentNode.parentNode.id =
            "textbody";
    });

    const res = {
        mediaForHTML: null,
        textForHTML: null
    };
    // in standaard removeEls saveTheseAttrsFirst removeAttrsLastStep
    // removeHTMLWithStrings htmlElementsWithStringsToRemove
    const selectors = {
        ...standaardSelectorConfig,
        textBody: "#textbody .prose",
        mediaEls: '.swiper-slide a[href*="youtube"]',
        removeEmptyHTMLFrom: "#textbody .prose"
    };

    await ongewensteHTMLUitHeleDocument(page, selectors);

    await eersteLadingOverbodigeAttributesWeg(page, selectors);

    res.mediaForHTML = await maakMediaHTMLBronnen(page, selectors);

    await hinderlijkeTekstenEruitSlopen(page, selectors);

    await formatHTMLTextBodyNaarEenSpatieMax(page, selectors);

    await legeHTMLElementenVerwijderen(page, selectors);

    res.textForHTML = await maakTekstBlokHTML(page, selectors);

    return res;
}
