import { parentPort, workerData } from "worker_threads";

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

// media HTML maken. CQ iframes eruit halen of construeren.
export async function maakMediaHTMLBronnen(page, selectors) {
    if (!selectors.mediaEls.length) return null;
    return await page
        .evaluate(
            ({ selectors }) => {
                return Array.from(document.querySelectorAll(selectors.mediaEls))
                    .map((bron) => {
                        // youtube link
                        const h = bron?.href ?? null;
                        if (!h) return null;
                        return {
                            outer: null,
                            src: h.substring(0, h.indexOf("?")),
                            id: null,
                            type: "youtube"
                        };
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
    const thtml =
        event.textForHTML
            ?.replaceAll("h6", "strong")
            .replaceAll("h5", "strong")
            .replaceAll("h4", "strong")
            .replaceAll("h3", "h4")
            .replaceAll("h1", "h2")
            .replaceAll("h2", "h3") ?? "";

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
