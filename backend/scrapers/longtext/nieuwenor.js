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
    removeElementsRecursive
} from "../gedeeld/longHTML.js";

export default async function longTextSocialsIframes(page, event) {
    await page.evaluate(() => {
        // mobile versie weg
        Array.from(
            document.querySelectorAll("#pageContent section > div")
        ).forEach((a, i) => {
            if (i > 0) a.parentNode.removeChild(a);
        });

        // iets van semantiek hahaha
        document.querySelectorAll("span").forEach((span) => {
            const t = span.textContent
                .toLowerCase()
                .trim()
                .replaceAll(/\W/g, "")
                .substring(0, 10);
            if (!t) return;
            span.classList.add(t);
        });

        // weg reclame
        const reclame =
            document.querySelector(".iets + .voor + .jou")?.parentNode
                .parentNode ?? null;
        if (reclame) reclame.parentNode.removeChild(reclame);
    });

    const res = {
        mediaForHTML: null,
        textForHTML: null
    };
    // in standaard removeEls saveTheseAttrsFirst removeAttrsLastStep
    // removeHTMLWithStrings htmlElementsWithStringsToRemove
    const selectors = {
        ...standaardSelectorConfig,
        textBody: "#pageContent #heroSlider ~ *",
        mediaEls: [
            `#pageContent #heroSlider ~ * iframe[src*="spotify"]`,
            `#pageContent #heroSlider ~ * iframe[src*="youtube"]`
        ].join(", "),
        removeEmptyHTMLFrom: "#pageContent #heroSlider ~ *",
        removeHTMLWithStrings: ["Iets voor jou"]
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
