/* eslint-disable  */
/* eslint-disable indent */
/* global document */
export default async function longTextSocialsIframes(page, event) {
    return page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ event }) => {
            const res = {};

            const textSelector = ".event__language .layout--is-text";
            const mediaSelector = [
                ".layout--is-video .layout__media",
                "iframe[src*='bandcamp']",
                "iframe[src*='spotify']"
            ].join(", ");
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
                `${textSelector} [href*='instagram']`,
                `${textSelector} [href*='facebook']`,
                `${textSelector} [href*='fb.me']`,
                `${textSelector} a[href*='bandcamp.com']`,
                `${textSelector} h1`,
                `${textSelector} img`,
                ".layout__info__link [href*='facebook'][href*='events']",
                ".layout--is-video .layout__media",
                "iframe[src*='bandcamp']",
                "iframe[src*='spotify']",
                "svg"
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
            res.mediaForHTML = !mediaSelector.length
                ? ""
                : Array.from(document.querySelectorAll(mediaSelector)).map(
                      (bron) => {
                          bron.className = "";

                          if (bron?.src && bron.src.includes("bandcamp")) {
                              return {
                                  outer: bron.outerHTML,
                                  src: bron.src,
                                  id: null,
                                  type: "bandcamp"
                              };
                          }

                          if (bron?.src && bron.src.includes("spotify")) {
                              return {
                                  outer: bron.outerHTML,
                                  src: bron.src,
                                  id: null,
                                  type: "spotify"
                              };
                          }

                          if (bron?.hasAttribute("data-video-embed")) {
                              return {
                                  outer: null,
                                  src: bron.getAttribute("data-video-embed"),
                                  id: null,
                                  type: "youtube"
                              };
                          }
                      }
                  );

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
