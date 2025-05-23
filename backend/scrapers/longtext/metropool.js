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
        document
            .querySelectorAll(".contentblock-EventSummary")
            .forEach((el, index) => {
                el.classList.add(`event-summary-count-${index + 1}`);
                el.parentNode.classList.add(
                    `event-summary-parent-count-${index + 1}`
                );
            });
        document
            .querySelectorAll(".contentblock-EventInfo")
            .forEach((el, index) => {
                el.classList.add(`event-info-count-${index + 1}`);
                el.parentNode.classList.add(
                    `event-info-parent-count-${index + 1}`
                );
            });
    });

    const res = {
        mediaForHTML: null,
        textForHTML: null
    };
    // in standaard removeEls saveTheseAttrsFirst removeAttrsLastStep
    // removeHTMLWithStrings htmlElementsWithStringsToRemove
    const selectors = {
        ...standaardSelectorConfig,
        textBody: ".event-summary-count-1",
        mediaEls: `.event-summary-parent-count-1 iframe, .event-info-parent-count-1 iframe`,
        removeEmptyHTMLFrom: ".event-summary-count-1",
        removeHTMLWithStrings: []
    };

    selectors.removeEls.concat([`.contentblock-Video`]);

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
