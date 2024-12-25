import debugSettings from "./debug-settings.js";

async function _getPriceFromHTML({ _this, page, event, pageInfo, selectors }) {
    const priceRes = {
        price: null,
        errors: []
    };

    const workingEventObj = { ...event, ...pageInfo };
    const pi = `${workingEventObj.anker}`;

    if (!page || !workingEventObj || !selectors.length) {
        priceRes.errors.push({
            error: new Error("geen page, workingEventObj, selectors")
        });
        debugSettings.debugPrice &&
            _this.dirtyTalk(
                `price €${priceRes.price} ${`${workingEventObj.title}`}`
            );
        return priceRes;
    }

    const selectorsCopy = [...selectors];
    const firstSelector = selectorsCopy.shift();

    const testText = await page.evaluate((selector) => {
        if (!document.querySelector(selector)) return false;
        return Array.from(document.querySelectorAll(selector))
            .map((el) => el?.textContent)
            .join("");
    }, firstSelector);

    if (!testText && selectorsCopy.length) {
        return await _this.getPriceFromHTML({
            page,
            event,
            pageInfo,
            selectors: selectorsCopy
        });
    }

    if (!testText) {
        if (testText === false) {
            if (workingEventObj.soldOut) {
                priceRes.price = 0;
                if (_this.debugPrice) {
                    priceRes.errors.push({
                        error: new Error(
                            `uitverkocht. vergeef geen price ${pi}`
                        )
                    });
                }
            } else {
                const e = new Error(`geen el price`);
                priceRes.errors.push({
                    error: e,
                    remarks: `geen el in ${firstSelector} ${pi}`,
                    errorLevel: "notice"
                });
            }
        } else {
            priceRes.errors.push({
                error: new Error(`lege tc in ${firstSelector} ${pi}`)
            });
        }
        return priceRes;
    }

    if (testText.match(/start/i)) {
        priceRes.price = null;
        _this.debugPrice &&
            _this.dirtyDebug({
                pi,
                price: priceRes.price,
                type: "NOG ONBEKEND"
            });
        return priceRes;
    }

    const priceMatch = testText.match(
        /(?<euros>\d{1,3})\s?(?<scheiding>[,.]?)\s?(?<centen>\d+|-)/
    );

    const priceMatchEuros = testText.match(/\d+/);

    const euros = priceMatch?.groups?.euros ?? null;
    const centen = priceMatch?.groups?.centen ?? null;
    const scheiding = priceMatch?.groups?.scheiding ?? null;
    const backupEuros = Array.isArray(priceMatchEuros)
        ? priceMatchEuros[0]
        : null;
    let priceStringR = null;
    try {
        if (testText.includes("€")) {
            const tm = testText.match(/€\d{1,3}\s?[,.]?(\d{1,3}|-)/);
            priceStringR = tm[0];
        }
    } catch (error) {
        //
    }
    if (Array.isArray(priceMatch) && !priceStringR) {
        priceStringR = priceMatch[0];
    } else if (!priceStringR) {
        if (euros) {
            priceStringR += euros;
        }
        if (scheiding) {
            if (centen) {
                if (centen.includes("-")) {
                    priceStringR += "00";
                } else {
                    priceStringR += centen;
                }
            } else {
                priceStringR += "00";
            }
        } else {
            priceStringR += "00";
        }
    }

    const priceString = priceStringR
        .replace(",", ".")
        .replace("-", "00")
        .replaceAll(/\s/g, "")
        .replace("€", "");

    const debugIncl = {
        euros,
        centen,
        scheiding,
        backupEuros,
        pi,
        testText,
        priceMatchEuros,
        priceStringR
    };

    if (_this.debugPrice) {
        _this.dirtyLog(debugIncl);
    }

    if (
        testText.match(/gratis|free/i) &&
        !Array.isArray(priceMatch) &&
        !Array.isArray(priceMatchEuros)
    ) {
        priceRes.price = 0;
        _this.debugPrice &&
            _this.dirtyDebug({
                price: priceRes.price,
                type: "GRATIS"
            });
        return priceRes;
    }

    if (!Array.isArray(priceMatch) && !Array.isArray(priceMatchEuros)) {
        if (selectorsCopy.length) {
            return await _this.getPriceFromHTML({
                page,
                event,
                pageInfo,
                selectors: selectorsCopy
            });
        }
        if (testText.match(/tba/i)) {
            priceRes.price = "onbekend";
            _this.debugPrice &&
                _this.dirtyDebug({
                    price: "onbekend",
                    type: "PRIJS TBA"
                });
            return priceRes;
        }
        if (testText.match(/uitverkocht|sold\sout/i)) {
            priceRes.price = null;
            _this.debugPrice &&
                _this.dirtyDebug({
                    price: priceRes.price,
                    type: "UITVERKOCHT"
                });
            return priceRes;
        }
        priceRes.errors.push({
            error: new Error(`geen match met ${firstSelector} ${pi}`),
            toDebug: { testText, priceMatch }
        });
        return priceRes;
    }

    if (!Array.isArray(priceMatch) && Array.isArray(priceMatchEuros)) {
        priceRes.price = Number(priceMatchEuros[0]);
        checkIsNumber(priceRes, pi);
        _this.debugPrice &&
            _this.dirtyDebug({
                price: priceRes.price,
                type: "geen priceMatch wel matchEuros"
            });
        return priceRes;
    }

    try {
        priceRes.price = Number(priceString);

        checkIsNumber(priceRes, pi);
        const pii = pi.replace("</a>", ` €${priceRes.price.toFixed(2)}</a>`);
        _this.debugPrice && _this.dirtyDebug(pii);
        return priceRes;
    } catch (priceCalcErr) {
        if (selectorsCopy.length) {
            return await _this.getPriceFromHTML({
                page,
                event,
                pageInfo,
                selectors: selectorsCopy
            });
        }

        if (testText.match(/uitverkocht|sold\sout/i)) {
            priceRes.price = null;
            _this.debugPrice &&
                _this.dirtyDebug({
                    price: priceRes.price,
                    type: "UITVERKOCHT",
                    ...debugIncl
                });
            return priceRes;
        }
        priceRes.errors.push({
            error: priceCalcErr,
            remarks: `price calc err ${pi}`,
            toDebug: { debugIncl }
        });
        return priceRes;
    }
}

export async function checkIsNumber(priceRes, pi) {
    if (isNaN(priceRes.price)) {
        priceRes.errors.push({
            error: new Error(`NaN: ${priceRes.price} ${pi}`)
        });
        return false;
    }
    return true;
}
export default _getPriceFromHTML;
