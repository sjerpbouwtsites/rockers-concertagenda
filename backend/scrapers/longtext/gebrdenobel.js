/* eslint-disable  */
/* eslint-disable indent */
/* global document */
export default async function longTextSocialsIframes(page, event) {
    return page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ event }) => {
            const res = {};

            const textSelector = ".content--fields .column";
            const mediaSelector = [".column iframe"].join(", ");
            const removeEmptyHTMLFrom = textSelector;
            const socialSelector = [].join(", ");
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
                `${textSelector} iframe`,
                `#iFrameResizer0`,
                "#shop-frame"
            ].join(", ");

            const attributesToRemove = [
                "style",
                "hidden",
                "_target",
                "frameborder",
                "onclick",
                "aria-hidden",
                "allow",
                "allowfullscreen",
                "data-deferlazy",
                "width",
                "height"
            ];
            const attributesToRemoveSecondRound = ["class", "id"];
            const removeHTMLWithStrings = ["Om deze content te kunnnen zien"];

            // eerst onzin attributes wegslopen
            const socAttrRemSelAdd = `${
                socialSelector.length ? `, ${socialSelector}` : ""
            }`;
            const mediaAttrRemSelAdd = `${
                mediaSelector.length
                    ? `, ${mediaSelector} *, ${mediaSelector}`
                    : ""
            }`;
            const textSocEnMedia = `${textSelector} *${socAttrRemSelAdd}${mediaAttrRemSelAdd}`;
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
                bron.className = "";
                // custom gebr de nobel

                // DE VIDEO BIJ NOBEL IS EEN EIGEN IFRAME OM YOUTUBES IFRAME HEEN. VALT NIET UIT TE LEZEN.

                // if (bron.hasAttribute('data-video-id')) {
                //   return {
                //     outer: null,
                //     src: null,
                //     id: bron.getAttribute('data-video-id'),
                //     type: 'youtube',
                //   };
                // }
                if (bron.src.includes("spotify")) {
                    return {
                        outer: bron.outerHTML,
                        src: bron.src,
                        id: null,
                        type: "spotify"
                    };
                }
                // end custom gebr de nobel

                // terugval???? nog niet bekend met alle opties.
                return {
                    outer: bron.outerHTML,
                    src: bron.src,
                    id: null,
                    type: bron.src.includes("spotify")
                        ? "spotify"
                        : bron.src.includes("youtube")
                        ? "youtube"
                        : "bandcamp"
                };
            });

            // socials obj maken voordat HTML verdwijnt
            res.socialsForHTML = "";

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
                    const leegMatch = checkForEmpty.innerHTML
                        .replace("&nbsp;", "")
                        .match(/[\w\d]/g);
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
