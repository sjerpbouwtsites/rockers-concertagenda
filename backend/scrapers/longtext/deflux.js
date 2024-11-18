/* eslint-disable  */
/* eslint-disable indent */
/* global document */
export default async function longTextSocialsIframes(page, event) {
    return page.evaluate(
        // eslint-disable-next-line no-shadow
        ({ event }) => {
            const res = {};
            const textSelector = ".eventon_desc_in";
            const mediaSelector = ["figure"].join(", ");
            const removeEmptyHTMLFrom = textSelector;
            const socialSelector = [".FacebookShare a", ".Twitter a"].join(
                ", "
            );
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
            const attributesToRemoveSecondRound = ["class", "id"];
            const removeHTMLWithStrings = [];

            // eerst onzin attributes wegslopen
            const socAttrRemSelAdd = `${socialSelector.length ? `, ${socialSelector}` : ""}`;
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
                if (bron.textContent.includes("https://www.youtube")) {
                    return {
                        outer: null,
                        src: bron.textContent
                            .trim()
                            .replace("watch?v=", "embed/"),
                        id: null,
                        type: "youtube"
                    };
                }

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

            // socials obj maken voordat HTML verdwijnt
            res.socialsForHTML = !socialSelector
                ? ""
                : Array.from(document.querySelectorAll(socialSelector)).map(
                      (el) => {
                          el.querySelectorAll("i, svg, img").forEach((rm) =>
                              rm.parentNode.removeChild(rm)
                          );
                          if (!el.textContent.trim().length) {
                              if (
                                  el.href.includes("facebook") ||
                                  el.href.includes("fb.me")
                              ) {
                                  if (el.href.includes("facebook.com/events")) {
                                      el.textContent = `FB event ${event.title}`;
                                  } else {
                                      el.textContent = "Facebook";
                                  }
                              } else if (el.href.includes("twitter")) {
                                  el.textContent = "Tweet";
                              } else if (el.href.includes("instagram")) {
                                  el.textContent = "Insta";
                              } else {
                                  el.textContent = "Social";
                              }
                          }
                          el.className = "long-html__social-list-link";
                          el.target = "_blank";
                          return el.outerHTML;
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
