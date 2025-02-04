/* eslint-disable  */
/* eslint-disable indent */
/* global document */
export default async function longTextSocialsIframes(page, event) {
    return page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ event }) => {
            // piemels hebben twee keer de ID EventSummary gebruikt en ook EventInfo.
            document
                .querySelectorAll(".contentblock-EventSummary")
                .forEach((el, index) => {
                    el.classList.add(`event-summary-count-${index + 1}`);
                    el.parentNode.classList.add(
                        `event-summary-parent-count-${index + 1}`
                    );
                });
            document
                .querySelectorAll(".contentblock-EventInfo")
                .forEach((el, index) => {
                    el.classList.add(`event-info-count-${index + 1}`);
                    el.parentNode.classList.add(
                        `event-info-parent-count-${index + 1}`
                    );
                });

            const res = {};

            const textSelector = ".event-summary-count-1";
            const mediaSelector = `.event-summary-parent-count-1 iframe, .event-info-parent-count-1 iframe`;
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
                `${textSelector} [data-udi]`,
                `${textSelector} form`,
                `${textSelector} img`,
                `${textSelector} iframe`,
                `${textSelector} .contentblock-Video`
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
