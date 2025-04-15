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
        textBody: ".post-content",
        mediaEls: [
            ".su-youtube iframe",
            ".su-spotify iframe",
            ".su-bandcamp iframe",
            ".post-content h2 a[href*='bandcamp']",
            ".post-content h2 a[href*='spotify']"
        ].join(", "),
        removeEmptyHTMLFrom: ".post-content"
    };
    selectors.removeEls.concat([
        ".post-content h3",
        ".post-content .wpt_listing",
        ".post-content .su-youtube",
        ".post-content .su-spotify",
        ".post-content .su-button",
        ".post-content h2 a[href*='facebook']",
        ".post-content h2 a[href*='instagram']",
        ".post-content h2 a[href*='bandcamp']",
        ".post-content h2 a[href*='spotify']",
        ".post-content .su-button-center"
    ]);

    res.mediaForHTML = await maakMediaHTMLBronnen(page, selectors);

    await ongewensteHTMLUitHeleDocument(page, selectors);

    await eersteLadingOverbodigeAttributesWeg(page, selectors);

    await hinderlijkeTekstenEruitSlopen(page, selectors);

    await formatHTMLTextBodyNaarEenSpatieMax(page, selectors);

    await removeElementsRecursive(page, selectors);

    await legeHTMLElementenVerwijderen(page, selectors);

    res.textForHTML = await maakTekstBlokHTML(page, selectors);

    return res;
}
