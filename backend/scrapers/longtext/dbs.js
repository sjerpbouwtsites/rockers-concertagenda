/* eslint-disable  */
/* eslint-disable indent */
/* global document */
export default async function longTextSocialsIframes(page, event) {
    return page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ event }) => {
            const res = {};
            const textSelector = ".tribe-events-content";
            const mediaSelector = [`${textSelector} iframe`].join(", ");
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
                `${textSelector} [aria-label='Videospeler']`,
                `${textSelector} .video-shortcode`,
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
            const attributesToRemoveSecondRound = ["class", "id"];
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

            //  media obj maken voordat HTML verdwijnt
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
            removeHTMLWithStrings.length &&
                Array.from(
                    document.querySelectorAll(
                        `${textSelector} p, ${textSelector} span, ${textSelector} a`
                    )
                ).forEach((verwijder) => {
                    const heeftEvilString = !!removeHTMLWithStrings.find(
                        (evilString) =>
                            verwijder.textContent.includes(evilString)
                    );
                    if (heeftEvilString) {
                        verwijder.parentNode.removeChild(verwijder);
                    }
                });

            // lege HTML eruit cq HTML zonder tekst of getallen
            // document.querySelectorAll(`${removeEmptyHTMLFrom} > *`)
            //   .forEach(checkForEmpty => {
            //     const leeg = checkForEmpty?.textContent.replace('&nbsp;','').replaceAll(/[\s\r\t]/g, '').trim() === '';
            //     if (leeg){
            //       checkForEmpty.parentNode.removeChild(checkForEmpty)
            //     }
            //   })

            res.textForHTML = Array.from(
                document.querySelectorAll(textSelector)
            )
                .map((el) => el.innerHTML)
                .join("");

            document
                .querySelectorAll(textSelector)
                .forEach((ts) => ts.setAttribute("data-text", "1"));

            // laatste attributen eruit.
            document.querySelectorAll(textSocEnMedia).forEach((elToStrip) => {
                attributesToRemoveSecondRound.forEach((attr) => {
                    if (elToStrip.hasAttribute(attr)) {
                        elToStrip.removeAttribute(attr);
                    }
                });
            });

            // tekst
            res.textForHTML = Array.from(
                document.querySelectorAll("[data-text]")
            )
                .map((el) => el.innerHTML)
                .join("");
            return res;
        },
        { event }
    );
}
