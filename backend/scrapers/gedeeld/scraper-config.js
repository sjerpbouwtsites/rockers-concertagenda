/**
 * TODO
 *
 * @export
 * @param {*} obj
 * @param {*} additional added to this
 * @return
 */
export default class ScraperConfig {
    static baseConfig = {
        launchOptions: {},
        singlePage: {
            waitUntil: "domcontentloaded",
            timeout: 5001,
            useCache: true
        },
        mainPage: {
            waitUntil: "domcontentloaded",
            timeout: 15001,
            url: null
        },
        app: {
            harvest: {
                possiblePrefix: ".*:",
                dividers: [],
                dividerRex: null,
                artistsIn: ["title"]
            },
            // in deze eigen app
            mainPage: {
                // make base events
                requiredProperties: [], // waarop base events worden gecontroleerd
                useCustomScraper: false, // geen puppeteer, geen page aangemaakt
                asyncCheckFuncs: []
            },
            singlePage: {
                // get page info
                useCustomScraper: null, // geen puppeteer, geen page aangemaakt
                requiredProperties: [], // waarop page Info word gecontroleerd
                asyncCheckFuncs: []
            }
        }
    };

    // SETTINGS.
    _s = {
        launchOptions: {},
        mainPage: {},
        singlePage: {},
        app: {
            splitting: {},
            mainPage: {},
            singlePage: {}
        },
        workerData: null
    };

    get workerData() {
        return this._s.workerData;
    }

    constructor(obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, "workerData")) {
            throw new Error("geen workerData scraperConfig");
        }
        const bc = ScraperConfig.baseConfig;
        this._s.launchOptions = obj?.launchOptions ?? bc.launchOptions;
        this._s.singlePage = {
            timeout: obj?.singlePage?.timeout ?? bc.singlePage.timeout,
            waitUntil: obj?.singlePage?.waitUntil ?? bc.singlePage.waitUntil
        };

        this._s.mainPage = {
            timeout: obj?.mainPage?.timeout ?? bc.mainPage.timeout,
            waitUntil: obj?.mainPage?.waitUntil ?? bc.mainPage.waitUntil,
            url: obj?.mainPage?.url ?? bc.mainPage.url
        };

        this._s.app.harvest = {
            dividers: obj?.app?.harvest?.dividers ?? bc.app.harvest.dividers,
            dividerRex:
                obj?.app?.harvest?.dividerRex ?? bc.app.harvest.dividerRex,
            possiblePrefix:
                obj?.app?.harvest?.possiblePrefix ??
                bc.app.harvest.possiblePrefix,
            artistsIn: obj?.app?.harvest?.artistsIn ?? bc.app.harvest.artistsIn
        };

        this._s.app.mainPage = {
            useCustomScraper:
                obj?.app?.mainPage?.useCustomScraper ??
                bc.app.mainPage.useCustomScraper,
            requiredProperties:
                obj?.app?.mainPage?.requiredProperties ??
                bc.app.mainPage.requiredProperties,
            asyncCheckFuncs:
                obj?.app?.mainPage?.asyncCheckFuncs ??
                bc.app.mainPage.asyncCheckFuncs
        };

        this._s.app.singlePage = {
            useCustomScraper:
                obj?.app?.singlePage?.useCustomScraper ??
                bc.app.singlePage.useCustomScraper,
            requiredProperties:
                obj?.app?.singlePage?.requiredProperties ??
                bc.app.singlePage.requiredProperties,
            asyncCheckFuncs:
                obj?.app?.singlePage?.asyncCheckFuncs ??
                bc.app.singlePage.asyncCheckFuncs
        };
    }
}
