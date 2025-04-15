import { parentPort, workerData } from "worker_threads";

import QuickWorkerMessage from "../../mods/quick-worker-message.js";
const qwm = new QuickWorkerMessage(workerData);

function youtubeSRCToIframe(src) {
    return `<iframe width="380" data-zelfgebouwd height="214" src="${src}" frameborder="0" allowfullscreen></iframe>`;
}

function youtubeIDToIframe(id) {
    return `<iframe width="380" data-zelfgebouwd height="214" src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen></iframe>`;
}
/**
 * KOPIE VAN ABSTRACT SCRAPER
 *
 * @param {} error
 * @param {*} remarks
 * @param {*} errorLevel
 * @param {*} toDebug
 */
export function handleError(
    error,
    remarks = null,
    errorLevel = "notify",
    toDebug = null
) {
    // TODO link errors aan debugger
    const updateErrorMsg = {
        type: "update",
        subtype: "error",
        messageData: {
            workerData,
            remarks,
            status: "error",
            errorLevel,
            text: `${error?.message}\n${error?.stack}\nlevel:${errorLevel}`
        }
    };

    const clientsLogMsg = {
        type: "clients-log",
        subtype: "error",
        messageData: { error, workerData }
    };
    let debuggerMsg;
    if (toDebug) {
        debuggerMsg = {
            type: "update",
            subtype: "debugger",
            messageData: {
                workerData,
                debug: toDebug
            }
        };
        debuggerMsg.messageData.workerName = workerData.name;
    }
    updateErrorMsg.messageData.workerName = workerData.name;
    clientsLogMsg.messageData.workerName = workerData.name;
    parentPort.postMessage(JSON.stringify(updateErrorMsg));
    parentPort.postMessage(JSON.stringify(clientsLogMsg));
    if (toDebug) parentPort.postMessage(JSON.stringify(debuggerMsg));
}

export const standaardSelectorConfig = {
    removeEls: [
        `script`,
        `noscript`,
        `style`,
        `meta`,
        `svg`,
        `form`,
        `h1`,
        `img`,
        `iframe`
    ].join(", "),
    captureTextRemoveEls: [
        "div",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "strong",
        "i",
        "span",
        "a",
        "b"
    ],
    saveTheseAttrsFirst: ["id", "class", "href", "src", "data-src"],
    removeAttrsLastStep: ["class", "id"],
    removeHTMLWithStrings: [],
    htmlElementsWithStringsToRemove: ["p", "span", "a"]
};

// eerst de ongewenste HTML uit het hele document.
export async function ongewensteHTMLUitHeleDocument(page, selectors) {
    return await page
        .evaluate(
            ({ selectors }) => {
                document
                    .querySelectorAll(selectors.removeEls)
                    .forEach((ongewenst) => {
                        ongewenst.parentNode.removeChild(ongewenst);
                    });
            },
            { selectors }
        )
        .catch((err) => {
            handleError(err);
        });
}

// dan de eerste lading overbodige attributes wegslopen.
export async function eersteLadingOverbodigeAttributesWeg(page, selectors) {
    await page
        .evaluate(
            ({ selectors }) => {
                // dit wordt gekopieerd ^^
                function removeAllAttrs(element, selectors) {
                    const filteredAttributes = Array.from(
                        element.attributes
                    ).filter(
                        (attr) => !selectors.saveTheseAttrsFirst.includes(attr)
                    );
                    for (var i = filteredAttributes.length; i-- > 0; )
                        element.removeAttributeNode(filteredAttributes[i]);
                }

                document
                    .querySelectorAll(
                        `${selectors.textBody} *, ${selectors.mediaEls} *`
                    )
                    .forEach((elementTeStrippen) => {
                        removeAllAttrs(elementTeStrippen, selectors);
                    });
            },
            { selectors }
        )
        .catch((err) => {
            handleError(err);
        });
}

export async function gewoonBerichtDumpen(bericht, hoedan) {
    if (hoedan === "console") {
        parentPort.postMessage(qwm.toConsole(bericht));
    } else {
        parentPort.postMessage(qwm.debugger(bericht));
    }
}

// media HTML maken. CQ iframes eruit halen of construeren.
export async function maakMediaHTMLBronnen(page, selectors, event) {
    if (!selectors.mediaEls.length) return null;

    return await page
        .evaluate(
            ({ selectors }) => {
                return Array.from(document.querySelectorAll(selectors.mediaEls))
                    .map((bron) => {
                        const isYoutubeAnchor =
                            bron.hasAttribute("href") &&
                            bron.href.includes("youtube");
                        const isSpotifyIframe =
                            bron.hasAttribute("src") &&
                            bron.src.includes("spotify");
                        const isYoutubeIframe =
                            bron.hasAttribute("src") &&
                            bron.src.includes("youtube");
                        const isBandcampIframe =
                            bron.hasAttribute("src") &&
                            bron.src.includes("bandcamp");
                        const isYoutubeImg =
                            bron.hasAttribute("src") &&
                            bron.src.includes("ytimg.com");

                        if (isYoutubeAnchor) {
                            return {
                                outer: null,
                                src: bron.href.substring(
                                    0,
                                    bron.href.indexOf("?")
                                ),
                                id: null,
                                type: "youtube"
                            };
                        } else if (isSpotifyIframe) {
                            return {
                                outer: bron.outerHTML,
                                src: bron.src,
                                id: null,
                                type: "spotify"
                            };
                        } else if (isYoutubeIframe) {
                            return {
                                outer: bron.outerHTML,
                                src: bron.src,
                                id: null,
                                type: "youtube"
                            };
                        } else if (isBandcampIframe) {
                            return {
                                outer: bron.outerHTML,
                                src: bron.src,
                                id: null,
                                type: "bandcamp"
                            };
                        } else if (isYoutubeImg) {
                            const idMatch = bron.src.match(/vi\/(.*)\//);
                            if (Array.isArray(idMatch)) {
                                return {
                                    outer: null,
                                    src: null,
                                    id: idMatch[1],
                                    type: "youtube"
                                };
                            }
                            return {
                                outer: bron.outerHTML,
                                src: bron.src,
                                id: null,
                                type: "bandcamp"
                            };
                        } else {
                            throw new Error(
                                `niet herkende media element ${bron?.src} ${bron?.href} ${bron?.id} ${bron?.className}`
                            );
                        }
                    })
                    .filter((a) => a);
            },
            { selectors }
        )
        .catch((err) => {
            handleError(err);
        });
}

// indien aanwezig hinderlijke teksten eruit slopen
export async function hinderlijkeTekstenEruitSlopen(page, selectors) {
    return await page
        .evaluate(
            ({ selectors }) => {
                const checkForBadStringSelectors =
                    selectors.htmlElementsWithStringsToRemove
                        .map((elType) => {
                            return `${selectors.textBody} ${elType}`;
                        })
                        .join(", ");
                document
                    .querySelectorAll(checkForBadStringSelectors)
                    .forEach((verwijderUit) => {
                        const heeftEvilString =
                            !!selectors.removeHTMLWithStrings.find(
                                (evilString) =>
                                    verwijderUit.textContent.includes(
                                        evilString
                                    )
                            );
                        if (heeftEvilString) {
                            verwijderUit.parentNode.removeChild(verwijderUit);
                        }
                    });
            },
            { selectors }
        )
        .catch((err) => {
            handleError(err);
        });
}

/**
 * removeElementsRecursive
 * vervang elementen door hun inhoud.
 *
 * @param {Page} page
 * @param {Array} selectors config
 * @param {Array} tagsList
 * @returns {bool} true
 */
export async function removeElementsRecursive(
    page,
    selectors,
    tagsListCopy = null
) {
    if (!tagsListCopy) tagsListCopy = [...selectors.captureTextRemoveEls];
    const thisTag = tagsListCopy.shift();

    await page.evaluate(
        ({ tag, selectors }) => {
            // Selecteer alle div-elementen
            let theseTags = document.querySelectorAll(
                `${selectors.textBody} ${tag}`
            );

            // Itereer door de geselecteerde div-elementen
            theseTags.forEach((tag) => {
                // Vervang de tag door zijn inhoud
                while (tag.firstChild) {
                    tag.parentNode.insertBefore(tag.firstChild, tag);
                }
                // Verwijder de lege tag
                tag.parentNode.removeChild(tag);
            });
        },
        { tag: thisTag, selectors }
    );
    if (tagsListCopy.length) {
        return removeElementsRecursive(page, selectors, tagsListCopy);
    }
    return true;
}

// en dan formatten we nu de hele HTML van de tekstBody naar één spatie max
export async function formatHTMLTextBodyNaarEenSpatieMax(page, selectors) {
    return await page
        .evaluate(
            ({ selectors }) => {
                document.querySelectorAll(selectors.textBody).forEach((tb) => {
                    const nweHTML = tb.innerHTML
                        .replace("&nbsp;", " ")
                        .replaceAll(/\s+\s/g, " ");
                    tb.innerHTML = nweHTML;
                });
            },
            { selectors }
        )
        .catch((err) => {
            handleError(err);
        });
}

// wrapper en ruis elementen verwijderen maar text eruit bewaren
export async function vangTekstUitElsEnVerwijderEl(page, selector) {}

// lege HTML elementen verwijderen.
export async function legeHTMLElementenVerwijderen(page, selectors) {
    return await page
        .evaluate(
            // eslint-disable-next-line no-shadow
            ({ selectors }) => {
                const fakeRecursiveCheckForChildren = (checkForEmptyHTML) => {
                    if (checkForEmptyHTML.children.length) {
                        return Array.from(checkForEmptyHTML.children);
                    }
                    return checkForEmptyHTML;
                };

                Array.from(
                    document.querySelectorAll(selectors.removeEmptyHTMLFrom)
                )
                    .map(fakeRecursiveCheckForChildren)
                    .flat()
                    .map(fakeRecursiveCheckForChildren)
                    .flat()
                    .map(fakeRecursiveCheckForChildren)
                    .flat()
                    .forEach((fuckThis) => {
                        if (fuckThis.textContent.trim().length < 1) {
                            fuckThis.parentNode.removeChild(fuckThis);
                        }
                    });
            },
            { selectors }
        )
        .catch((err) => {
            handleError(err);
        });
}
// tenslotte het textBlok maken.
export async function maakTekstBlokHTML(page, selectors) {
    return await page
        .evaluate(
            ({ selectors }) => {
                return Array.from(document.querySelectorAll(selectors.textBody))
                    .map((textBodyBlock) => {
                        textBodyBlock.querySelectorAll("*").forEach((ster) => {
                            ster.hasAttribute("class") &&
                                ster.removeAttribute("class");
                            ster.hasAttribute("id") &&
                                ster.removeAttribute("id");
                        });
                        return textBodyBlock.innerHTML;
                    })
                    .join("");
            },
            { selectors }
        )
        .catch((err) => {
            handleError(err);
        });
}

export default function makeLongHTML(event) {
    const mediaHTML = !Array.isArray(event.mediaForHTML)
        ? ""
        : event.mediaForHTML
              .map((bron) => {
                  if (bron.outer && bron.type === "youtube") {
                      return `<div class='iframe-wrapper-16-9'>${bron.outer}</div>`;
                  }
                  if (bron.outer && bron.type === "spotify") {
                      return `<div class='iframe-wrapper-152px'>${bron.outer}</div>`;
                  }
                  if (bron.outer && bron.type === "bandcamp") {
                      return `<div class='iframe-wrapper-152px'>${bron.outer}</div>`;
                  }
                  if (bron.outer) {
                      return `<div class='iframe-wrapper-generiek'>${bron.outer}</div>`;
                  }
                  if (bron.src && bron.type === "youtube") {
                      return `<div class='iframe-wrapper-16-9'>${youtubeSRCToIframe(
                          bron.src
                      )}</div>`.replace('"=""', ""); //TODO hack
                  }
                  if (bron.id && bron.type === "youtube") {
                      return `<div class='iframe-wrapper-16-9'>${youtubeIDToIframe(
                          bron.id
                      )}</div>`;
                  }
                  if (bron.src && bron.type !== "youtube") {
                      return `onbekende type ${bron.type}`;
                  }
                  return JSON.stringify(bron);
              })
              .join("");

    const mediaSection = mediaHTML
        ? `<section class='long-html__music-videos'>${mediaHTML}</section>`
        : "";

    // headings omlaag gooien.
    const thtml = event.textForHTML;

    const reshtml = `
    <div class='long-html'>
    <section class='long-html__text'>
    ${thtml}
    </section>
    ${mediaSection}
    </div>
  `;

    return reshtml;
}
