/* eslint-disable  */
/* eslint-disable indent */
/* global document */
export default async function longTextSocialsIframes(page, event) {
    return page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ event }) => {
            const res = {};

            const mediaSelector = [
                ".su-youtube iframe",
                ".su-spotify iframe",
                ".su-bandcamp iframe",
                ".post-content h2 a[href*='bandcamp']",
                ".post-content h2 a[href*='spotify']"
            ].join(", ");
            const textSelector = ".post-content";
            const removeEmptyHTMLFrom = ".post-content";
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

            // lege HTML eruit cq HTML zonder tekst of getallen
            document
                .querySelectorAll(`${removeEmptyHTMLFrom} > *`)
                .forEach((checkForEmpty) => {
                    const leegMatch = checkForEmpty.innerHTML.match(/[\w\d]/g);
                    if (!Array.isArray(leegMatch)) {
                        checkForEmpty.parentNode.removeChild(checkForEmpty);
                    }
                });
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

            // tekst.
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
