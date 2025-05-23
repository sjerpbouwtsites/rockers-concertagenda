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
    const res = {
        mediaForHTML: null,
        textForHTML: null
    };
    // in standaard removeEls saveTheseAttrsFirst removeAttrsLastStep
    // removeHTMLWithStrings htmlElementsWithStringsToRemove
    const selectors = {
        ...standaardSelectorConfig,
        textBody: ".wp-block-dynamo-eindhoven-container",
        mediaEls: [
            ".wp-block-dynamo-eindhoven-container .rll-youtube-player img, .wp-block-dynamo-eindhoven-container iframe"
        ].join(", "),
        removeEmptyHTMLFrom: ".wp-block-dynamo-eindhoven-container",
        removeHTMLWithStrings: ["Net bevestigd"]
    };

    await waitTime(50);

    await page.evaluate(() => {
        window.scrollBy(0, 250);
    });
    await waitTime(50);

    await page.evaluate(() => {
        window.scrollBy(0, 250);
    });

    //selectors.removeEls.concat(["#gerelateerd"]);

    await page.evaluate(() => {
        const r = document.getElementById("gerelateerd");
        if (r) {
            r.parentNode.removeChild(r);
        }
        const i = document.getElementById("info");
        if (i) {
            i.parentNode.removeChild(i);
        }
    });

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

async function waitTime(wait = 500) {
    if (wait > 100) {
        this.dirtyTalk(
            `${workerData.family} ${workerData.index} waiting ${wait}`
        );
    }

    return new Promise((res) => {
        setTimeout(res, wait);
    });
}
