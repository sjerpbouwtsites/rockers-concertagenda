/* eslint-disable  */
/* eslint-disable indent */
/* global document */
export default async function longTextSocialsIframes(page, event) {
    return page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ event }) => {
            const res = {};

            const textSelector = '[class*="styles_event-info__text-column"]';
            const mediaSelector = [
                "[class*='styles_embed-list__list'] iframe"
            ].join(", ");
            const removeEmptyHTMLFrom = textSelector;

            const removeSelectors = [
                `${textSelector} [class*='icon-']`,
                `${textSelector} [class*='fa-']`,
                `${textSelector} [href*='instagram']`,
                `${textSelector} [href*='facebook']`,
                `${textSelector} .fa`,
                `${textSelector} script`,
                `${textSelector} noscript`,
                `${textSelector} style`,
                `${textSelector} meta`,
                `${textSelector} iframe`,
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

                          if (
                              bron.hasAttribute("src") &&
                              bron.getAttribute("src").includes("youtube")
                          ) {
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
