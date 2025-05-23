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
    // custom effenaar
    await page.evaluate(() => {
        document.querySelectorAll("#main .blocks .block").forEach((block) => {
            if (block.querySelector(".embed"))
                block.classList.add("heeft-embed");
            if (block.querySelector(".cta")) block.classList.add("heeft-cta");
        });
    });

    // end custom effenaar

    const res = {
        mediaForHTML: null,
        textForHTML: null
    };
    // in standaard removeEls saveTheseAttrsFirst removeAttrsLastStep
    // removeHTMLWithStrings htmlElementsWithStringsToRemove
    const selectors = {
        ...standaardSelectorConfig,
        textBody: "#main .blocks .block",
        mediaEls: ".embed iframe",
        removeEmptyHTMLFrom: "#main .blocks .block"
    };

    //await ongewensteHTMLUitHeleDocument(page, selectors); // TODO HACK NIET NETJES EFFENAAR HTML UIT DOC LONG HTML

    res.mediaForHTML = await maakMediaHTMLBronnen(page, selectors, event);
    //await eersteLadingOverbodigeAttributesWeg(page, selectors);

    await hinderlijkeTekstenEruitSlopen(page, selectors);

    await formatHTMLTextBodyNaarEenSpatieMax(page, selectors);

    await removeElementsRecursive(page, selectors);

    await legeHTMLElementenVerwijderen(page, selectors);

    res.textForHTML = await maakTekstBlokHTML(page, selectors);

    return res;
}

// /* eslint-disable  */
// /* eslint-disable indent */
// /* global document */
// export default async function longTextSocialsIframes(page, event) {
//     return page.evaluate(
//         // eslint-disable-next-line no-shadow
//         ({ event }) => {
//             const res = {};

//             const textSelector = "#main .blocks .block";
//             const mediaSelector = ["#main .blocks iframe"].join(", ");
//             const removeEmptyHTMLFrom = textSelector;

//             const removeSelectors = [
//                 `${textSelector} [class*='icon-']`,
//                 `${textSelector} [class*='fa-']`,
//                 `${textSelector} .fa`,
//                 `${textSelector} script`,
//                 `${textSelector} noscript`,
//                 `${textSelector} style`,
//                 `${textSelector} meta`,
//                 `${textSelector} svg`,
//                 `${textSelector} form`,
//                 ".heeft-embed",
//                 `${textSelector} img`,
//                 ".heeft-cta"
//             ].join(", ");

//             const attributesToRemove = [
//                 "style",
//                 "hidden",
//                 "_target",
//                 "frameborder",
//                 "onclick",
//                 "aria-hidden",
//                 "allow",
//                 "allowfullscreen",
//                 "data-deferlazy",
//                 "width",
//                 "height"
//             ];
//             const attributesToRemoveSecondRound = ["class", "id"];
//             const removeHTMLWithStrings = [];

//             // custom effenaar
//             document
//                 .querySelectorAll("#main .blocks .block")
//                 .forEach((block) => {
//                     if (block.querySelector(".embed"))
//                         block.classList.add("heeft-embed");
//                     if (block.querySelector(".cta"))
//                         block.classList.add("heeft-cta");
//                 });
//             // end custom effenaar

//             const mediaAttrRemSelAdd = `${
//                 mediaSelector.length
//                     ? `, ${mediaSelector} *, ${mediaSelector}`
//                     : ""
//             }`;
//             const textSocEnMedia = `${textSelector} ${mediaAttrRemSelAdd}`;
//             document.querySelectorAll(textSocEnMedia).forEach((elToStrip) => {
//                 attributesToRemove.forEach((attr) => {
//                     if (elToStrip.hasAttribute(attr)) {
//                         elToStrip.removeAttribute(attr);
//                     }
//                 });
//             });

//             // media obj maken voordat HTML verdwijnt
//             res.mediaForHTML = Array.from(
//                 document.querySelectorAll(mediaSelector)
//             ).map((bron) => {
//                 const src = bron?.src ? bron.src : "";
//                 bron.className = "";
//                 return {
//                     outer: bron.outerHTML,
//                     src,
//                     id: null,
//                     type: src.includes("spotify")
//                         ? "spotify"
//                         : src.includes("youtube")
//                         ? "youtube"
//                         : "bandcamp"
//                 };
//             });

//             // stript HTML tbv text
//             removeSelectors.length &&
//                 document
//                     .querySelectorAll(removeSelectors)
//                     .forEach((toRemove) =>
//                         toRemove.parentNode.removeChild(toRemove)
//                     );

//             // verwijder ongewenste paragrafen over bv restaurants
//             Array.from(
//                 document.querySelectorAll(
//                     `${textSelector} p, ${textSelector} span, ${textSelector} a`
//                 )
//             ).forEach((verwijder) => {
//                 const heeftEvilString = !!removeHTMLWithStrings.find(
//                     (evilString) => verwijder.textContent.includes(evilString)
//                 );
//                 if (heeftEvilString) {
//                     verwijder.parentNode.removeChild(verwijder);
//                 }
//             });

//             // lege HTML eruit cq HTML zonder tekst of getallen
//             document
//                 .querySelectorAll(`${removeEmptyHTMLFrom} > *`)
//                 .forEach((checkForEmpty) => {
//                     const leegMatch = checkForEmpty.innerHTML
//                         .replace("&nbsp;", "")
//                         .match(/[\w\d]/g);
//                     if (!Array.isArray(leegMatch)) {
//                         checkForEmpty.parentNode.removeChild(checkForEmpty);
//                     }
//                 });
//             document
//                 .querySelectorAll(textSelector)
//                 .forEach((ts) => ts.setAttribute("data-text", "1"));
//             // laatste attributen eruit.
//             document.querySelectorAll(textSocEnMedia).forEach((elToStrip) => {
//                 attributesToRemoveSecondRound.forEach((attr) => {
//                     if (elToStrip.hasAttribute(attr)) {
//                         elToStrip.removeAttribute(attr);
//                     }
//                 });
//             });

//             // tekst.
//             res.textForHTML = Array.from(
//                 document.querySelectorAll("[data-text]")
//             )
//                 .map((el) => el.innerHTML)
//                 .join("");
//             return res;
//         },
//         { event }
//     );
// }
