/* global document */
import https from "https";
import fs from "fs";
// eslint-disable-next-line import/no-extraneous-dependencies
import sharp from "sharp";
import fsDirections from "../../mods/fs-directions.js";
import { parentPort, workerData } from "worker_threads";
function downloadImage(url, filepath, workerData) {
    return new Promise((resolve, reject) => {
        try {
            https.get(url, (res) => {
                if (res.statusCode === 200) {
                    res.pipe(fs.createWriteStream(filepath))
                        .on("error", reject)
                        .once("close", () => resolve(filepath));
                } else if (`${res.statusCode}`[0] === "3") {
                    resolve(
                        `${fsDirections.publicLocationImages}/${workerData.family}-vol.webp`
                    );
                } else {
                    res.resume();
                    console.log(res);
                    reject(
                        new Error(
                            `Request for ${url} Failed With a Status Code: ${res.statusCode} see <a href='vscode://vscode-remote/wsl+Ubuntu/home/sjerp/hosted/rockagenda/backend/temp/error.log:1:1'>the log</a>`
                        )
                    );
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}
async function downloadImageCompress({
    _this,
    image,
    workerData,
    imagePath,
    familyOverSchrijving = ""
}) {
    if (!image) {
        return "empty image";
    }

    let fam = "";
    if (familyOverSchrijving) {
        fam = familyOverSchrijving;
    } else {
        fam = workerData.family;
    }

    if (!fs.existsSync(`${_this.eventImagesFolder}/${fam}`)) {
        fs.mkdirSync(`${_this.eventImagesFolder}/${fam}`);
    }

    if (image.includes("event-images")) {
        return "image includes event images";
    }

    const extMatch = image.match(/.jpg|.jpeg|.png|.webp/);
    const extension = Array.isArray(extMatch) ? extMatch[0] : "onbekend";

    const diRes = await downloadImage(
        image,
        `${imagePath}-ori${extension}`,
        workerData
    )
        .then(() => {
            sharp(`${imagePath}-ori${extension}`)
                .resize(440, 250)
                .webp()
                .toFile(`${imagePath}-w440.webp`, () => {});

            sharp(`${imagePath}-ori${extension}`)
                .resize(750, 340)
                .webp()
                .toFile(`${imagePath}-w750.webp`, () => {});

            sharp(`${imagePath}-ori${extension}`)
                .webp()
                .toFile(`${imagePath}-vol.webp`, () => {});
        })
        .then(() => "success")
        .catch((err) => {
            return `err: ${err.message}`;
        });

    return diRes;
}

export async function getImageByCanvas(page, event, _this, selector) {
    const res = {
        errors: []
    };

    const dataURI = await page
        .evaluate((selector) => {
            const imageEL = document.querySelector(selector);
            const canv = document.createElement("canvas");
            canv.id = "rot-op-403";
            document.body.appendChild(canv);
            canv.height = imageEL.height;
            canv.width = imageEL.width;

            const ctx = canv.getContext("2d");

            canv.style = `position: fixed; top: 20px; left: 20px; z-index: 1000`;
            ctx.drawImage(imageEL, 0, 0, canv.width, canv.height);
            return document.querySelector("#rot-op-403").toDataURL();
        }, selector)
        .catch((err) => {
            console.log(err);
            handleError(
                err,
                `fout bij puppeteer getImageByCanvas <a _target='_blank' href='${event.venueEventUrl}'>${event.title}</a>`
            );
        });

    if (!dataURI) {
        handleError(
            new Error(
                `geen inhoud dataURI ${event.title} ${event.venueEventUrl}`
            )
        );
        return null;
    }

    // Extract the base64-encoded data
    const extension = dataURI.includes("png")
        ? ".png"
        : dataURI.includes("jpeg")
        ? ".jpeg"
        : ".jpg";
    const base64Data = dataURI.replace(/^data:image\/\w+;base64,/, "");

    // // Convert it into a buffer
    const imageBuffer = Buffer.from(base64Data, "base64");

    const base64String = Buffer.from(
        event.venueEventUrl.substring(
            event.venueEventUrl.length - 30,
            event.venueEventUrl.length
        )
    ).toString("base64");
    let imagePath = `${_this.eventImagesFolder}/${workerData.family}/${base64String}`;

    fs.writeFileSync(`${imagePath}-ori${extension}`, imageBuffer, "UTF-8");

    sharp(`${imagePath}-ori${extension}`)
        .resize(440, 250)
        .webp()
        .toFile(`${imagePath}-w440.webp`, () => {});

    sharp(`${imagePath}-ori${extension}`)
        .resize(750, 340)
        .webp()
        .toFile(`${imagePath}-w750.webp`, () => {});

    sharp(`${imagePath}-ori${extension}`)
        .webp()
        .toFile(`${imagePath}-vol.webp`, () => {});

    res.image = imagePath;
    return res;
}

export default async function getImage({
    _this,
    page,
    workerData,
    event,
    pageInfo,
    selectors,
    mode,
    directImageSrc = null
}) {
    if (mode === "direct-input") {
        return await getImageDirectInput(
            _this,
            page,
            event,
            pageInfo,
            workerData,
            directImageSrc
        );
    }

    if (!selectors || selectors === null) {
        selectors = [];
    }

    const res = {
        errors: []
    };

    const ogImage = await page
        .evaluate(() => {
            return (
                document.querySelector(`[property="og:image"]`)?.content ??
                false
            );
        })
        .catch((err) => handleError(err));

    try {
        await page.waitForSelector(selectors[0], {
            timeout: 1000
        });
    } catch (error) {
        try {
            if (selectors.length > 1) {
                await page.waitForSelector(selectors[1], {
                    timeout: 50
                });
            } else if (!ogImage) {
                res.errors.push({
                    error,
                    remarks: `geen ${selectors[0]} voor <a href='${event.venueEventUrl}'>${event.title}</a>`
                });
                return res;
            }
        } catch (error2) {
            try {
                if (selectors.length > 2) {
                    await page.waitForSelector(selectors[2], {
                        timeout: 250
                    });
                } else if (!ogImage) {
                    res.errors.push({
                        error: error2,
                        remarks: `geen ${selectors[0]} of ${selectors[1]} voor <a href='${event.venueEventUrl}'>${event.title}</a>`
                    });
                    return res;
                }
            } catch (error3) {
                if (!ogImage) {
                    res.errors.push({
                        error: error3,
                        remarks: `geen ${selectors[0]} of ${selectors[1]} of ${selectors[2]} voor <a href='${event.venueEventUrl}'>${event.title}</a>`
                    });
                    return res;
                }
            }
        }
    }

    const pi = pageInfo?.anker ? pageInfo?.anker : event?.pageInfo;
    let image = null;
    const selectorsCopy = [...selectors];
    if (mode === "image-src") {
        while (!image && selectorsCopy.length > 0) {
            const selector = selectorsCopy.shift();
            // eslint-disable-next-line no-await-in-loop
            image = await page
                .evaluate(
                    // eslint-disable-next-line no-shadow
                    ({ selector }) => {
                        const el = document.querySelector(selector);
                        let src = null;
                        if (!el?.src && el?.hasAttribute("data-src")) {
                            src = el.getAttribute("data-src");
                        } else if (!el?.src && el?.hasAttribute("srcset")) {
                            src = el.getAttribute("srcset").split(/\s/)[0];
                        } else {
                            src = el?.src ?? null;
                        }

                        if (src && !src.includes("https")) {
                            src = `${document.location.protocol}//${document.location.hostname}${src}`;
                        }

                        return src;
                    },
                    { selector }
                )
                .catch((err) => handleError(err));
        }
    } else if (mode === "background-src") {
        while (!image && selectorsCopy.length > 0) {
            const selector = selectorsCopy.shift();
            // eslint-disable-next-line no-await-in-loop
            image = await page
                .evaluate(
                    // eslint-disable-next-line no-shadow
                    ({ selector }) => {
                        const mmm =
                            document
                                .querySelector(selector)
                                ?.style.backgroundImage.match(
                                    /https.*.jpg|https.*.jpeg|https.*.png|https.*.webp/
                                ) ?? null;
                        if (!Array.isArray(mmm)) return null;
                        let src = mmm[0];
                        if (!src.includes("https")) {
                            src = `${document.location.protocol}//${document.location.hostname}${src}`;
                        }
                        return src;
                    },
                    { selector }
                )
                .catch((err) => handleError(err));
        }
    } else if (mode === "weird-attr") {
        while (!image && selectorsCopy.length > 0) {
            const selector = selectorsCopy.shift();
            // eslint-disable-next-line no-await-in-loop
            image = await page
                .evaluate(
                    // eslint-disable-next-line no-shadow
                    ({ selector }) => {
                        const el = document.querySelector(selector);
                        let src = null;
                        if (!el?.href && el?.hasAttribute("content")) {
                            src = el.getAttribute("content");
                        } else {
                            src = el?.href ?? null;
                        }

                        if (!src.includes("https")) {
                            src = `${document.location.protocol}//${document.location.hostname}${src}`;
                        }

                        return src;
                    },
                    { selector }
                )
                .catch((err) => handleError(err));
        }
    }

    res.mode = mode;

    if (!image && ogImage) {
        image = ogImage;
    }

    if (!image) {
        res.ditdan2 = "ook geen ogimage dus location jpg gepakt";
        image = `${fsDirections.publicLocationImages}/${event.location}.jpg`;
    }

    const base64String = Buffer.from(
        event.venueEventUrl.substring(
            event.venueEventUrl.length - 30,
            event.venueEventUrl.length
        )
    ).toString("base64");
    let imagePath = `${_this.eventImagesFolder}/${workerData.family}/${base64String}`;

    const afbeeldingBestaat = fs.existsSync(`${imagePath}-vol.webp`);
    if (afbeeldingBestaat) {
        res.image = imagePath;
        return res;
    }

    const diCompressRes = await downloadImageCompress({
        _this,
        image,
        workerData,
        imagePath
    }).catch((err) => handleError(err));
    res.diCompressRes = diCompressRes;
    if (!diCompressRes) {
        res.neeHe = "jaja";
        res.errors.push({
            remarks: `download compress ${event.title} ${image} fail`
        });
        imagePath = "";
    }

    res.image = imagePath;
    return res;
}

async function getImageDirectInput(
    _this,
    page,
    event,
    pageInfo,
    workerData,
    imageSrc = null
) {
    const res = {
        errors: []
    };
    res.arguments = arguments;

    const base64String = Buffer.from(
        event.venueEventUrl.substring(
            event.venueEventUrl.length - 30,
            event.venueEventUrl.length
        )
    ).toString("base64");
    res.imagePath = `${_this.eventImagesFolder}/${workerData.family}/${base64String}`;

    const afbeeldingBestaat = fs.existsSync(`${res.imagePath}-vol.webp`);
    if (afbeeldingBestaat) {
        res.image = res.imagePath;
        return res;
    }

    const diCompressRes = await downloadImageCompress({
        _this,
        image: imageSrc,
        workerData,
        imagePath: res.imagePath
    }).catch((err) => handleError(err));

    res.imageSrc = imageSrc;

    res.diCompressRes = diCompressRes;
    if (typeof diCompressRes === "string" && diCompressRes.includes("err")) {
        res.neeHe = "jaja";
        res.errors.push({
            error: new Error(diCompressRes),
            remarks: `download compress ${event.title} ${imageSrc} fail`
        });
        res.imagePath = imageSrc;
    }

    res.image = res.imagePath;
    return res;
}

// #endregion                                                 IMAGE

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
