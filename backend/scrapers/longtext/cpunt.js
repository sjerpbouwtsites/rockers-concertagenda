/* eslint-disable  */
/* eslint-disable indent */
/* global document */
export default async function longTextSocialsIframes(page, event) {
    return page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ event }) => {
            const res = {};
            const mediaSelector = [".contentblock-Video iframe"].join(", ");
            const textSelector = ".contentblock-TextOneColumn";
            const removeEmptyHTMLFrom = textSelector;

            const removeSelectors = [
                `${textSelector} [class*='icon-']`,
                `${textSelector} [class*='fa-']`,
                `${textSelector} .fa`,
                `${textSelector} script`,
                `${textSelector} noscript`,
                `${textSelector} style`,
                `${textSelector} meta`,
                `${textSelector} svg`,
                `${textSelector} form`,
                `${textSelector} img`
            ].join(", ");

            const attributesToRemove = [
                "style",
                "hidden",
                "_target",
                "frameborder",
                "onclick",
                "aria-hidden"
            ];
            const attributesToRemoveSecondRound = ["id"];
            const removeHTMLWithStrings = [];

            const mediaAttrRemSelAdd = `${
                mediaSelector.length
                    ? `, ${mediaSelector} *, ${mediaSelector}`
                    : ""
            }`;
            const textSocEnMedia = `${textSelector} ${mediaAttrRemSelAdd}`;
            document.querySelectorAll(textSocEnMedia).forEach((elToStrip) => {
                attributesToRemove.forEach((attr) => {
                    if (elToStrip.hasAttribute(attr)) {
                        elToStrip.removeAttribute(attr);
                    }
                });
            });

            // media obj maken voordat HTML verdwijnt
            res.mediaForHTML = Array.from(
                document.querySelectorAll(mediaSelector)
            ).map((bron) => {
                const src = bron?.src ? bron.src : "";
                return {
                    outer: bron.outerHTML,
                    src,
                    id: null,
                    type: src.includes("spotify")
                        ? "spotify"
                        : src.includes("youtube")
                        ? "youtube"
                        : "bandcamp"
                };
            });

            // stript HTML tbv text
            removeSelectors.length &&
                document
                    .querySelectorAll(removeSelectors)
                    .forEach((toRemove) =>
                        toRemove.parentNode.removeChild(toRemove)
                    );

            // verwijder ongewenste paragrafen over bv restaurants
            Array.from(
                document.querySelectorAll(
                    `${textSelector} p, ${textSelector} span, ${textSelector} a`
                )
            ).forEach((verwijder) => {
                const heeftEvilString = !!removeHTMLWithStrings.find(
                    (evilString) => verwijder.textContent.includes(evilString)
                );
                if (heeftEvilString) {
                    verwijder.parentNode.removeChild(verwijder);
                }
            });

            // lege HTML eruit cq HTML zonder tekst of getallen
            document
                .querySelectorAll(`${removeEmptyHTMLFrom} > *`)
                .forEach((checkForEmpty) => {
                    const leegMatch = checkForEmpty.innerHTML.match(/[\w\d]/g);
                    if (!Array.isArray(leegMatch)) {
                        checkForEmpty.parentNode.removeChild(checkForEmpty);
                    }
                });

            // laatste attributen eruit.
            document.querySelectorAll(textSocEnMedia).forEach((elToStrip) => {
                attributesToRemoveSecondRound.forEach((attr) => {
                    if (elToStrip.hasAttribute(attr)) {
                        elToStrip.removeAttribute(attr);
                    }
                });
            });

            // tekst.
            res.textForHTML = Array.from(
                document.querySelectorAll(textSelector)
            )
                .map((el) => el.innerHTML)
                .join("");
            return res;
        },
        { event }
    );
}
