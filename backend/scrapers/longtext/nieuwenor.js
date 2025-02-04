/* eslint-disable  */
/* eslint-disable indent */
/* global document */
export default async function longTextSocialsIframes(page, event) {
    return page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ event }) => {
            const res = {};

            const textSelector = "#pageContent #heroSlider ~ *";

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

            // alles alleen voor mobiel met foutieve selector ook nog
            document
                .querySelectorAll("[class*='sm:hidden']")
                .forEach((die) => die.parentNode.removeChild(die));

            const mediaSelector = [
                `${textSelector} iframe[src*="spotify"]`,
                `${textSelector} iframe[src*="youtube"]`
            ].join(", ");
            const removeEmptyHTMLFrom = textSelector;
            const socialSelector = [
                ".external-link a[href*='facebook']",
                ".external-link a[href*='instagram']"
            ].join(", ");
            const removeSelectors = [
                `${textSelector} [class*='icon-']`,
                `${textSelector} [class*='fa-']`,
                `${textSelector} .fa`,
                `${textSelector} script`,
                `${textSelector} figure`,
                `${textSelector} noscript`,
                `${textSelector} style`,
                `${textSelector} meta`,
                `${textSelector} iframe`,
                `${textSelector} svg`,
                `${textSelector} form`,
                `${textSelector} section > div:first-child`,
                `${textSelector} section > div:last-child`,
                `${textSelector} img`,
                ".heeft-cta"
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
            const removeHTMLWithStrings = ["Iets voor jou"];

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

                if (
                    bron?.src &&
                    (bron.src.includes("bandcamp") ||
                        bron.src.includes("spotify"))
                ) {
                    return {
                        outer: bron.outerHTML,
                        src: bron.src,
                        id: null,
                        type: bron.src.includes("bandcamp")
                            ? "bandcamp"
                            : "spotify"
                    };
                }
                if (bron?.src && bron.src.includes("youtube")) {
                    return {
                        outer: bron.outerHTML,
                        src: bron.src,
                        id: null,
                        type: "youtube"
                    };
                }

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

            // // lege HTML eruit cq HTML zonder tekst of getallen
            // document.querySelectorAll(`${removeEmptyHTMLFrom} > *`)
            //   .forEach(checkForEmpty => {
            //     const leegMatch = checkForEmpty.innerHTML.replace('&nbsp;','').match(/[\w\d]/g);
            //     if (!Array.isArray(leegMatch)){
            //       checkForEmpty.parentNode.removeChild(checkForEmpty)
            //     }
            //   })

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
