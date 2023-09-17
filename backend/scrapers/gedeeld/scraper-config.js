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
    singlePage: {
      waitUntil: 'domcontentloaded',
      timeout: 5001,
    },
    mainPage: {
      waitUntil: 'domcontentloaded',
      timeout: 15001,
      url: null,
    },
    app: {
      // in deze eigen app
      mainPage: {
        // make base events
        requiredProperties: [], // waarop base events worden gecontroleerd
        enforceMusicEventType: true, // geeft MusicEvent opdracht om properties te trimmen
        useCustomScraper: false, // geen puppeteer, geen page aangemaakt
        asyncCheck: ['refused', 'allowed', 'forbidden-terms', 'good-terms'],
      },
      singlePage: {
        // get page info
        useCustomScraper: null, // geen puppeteer, geen page aangemaakt
        requiredProperties: [], // waarop page Info word gecontroleerd
        enforceMusicEventType: false, // geeft MusicEvent opdracht om properties te trimmen.
      },
    },
  };

  // SETTINGS.
  _s = {
    mainPage: {},
    singlePage: {},
    app: {
      mainPage: {},
      singlePage: {},
    },
    workerData: null,
  };

  get workerData() {
    return this._s.workerData;
  }

  constructor(obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, 'workerData')) {
      throw new Error('geen workerData scraperConfig');
    }
    const bc = ScraperConfig.baseConfig;
    this._s.singlePage = {
      timeout: obj?.singlePage?.timeout ?? bc.singlePage.timeout,
      waitUntil: obj?.singlePage?.waitUntil ?? bc.singlePage.waitUntil,
    };

    this._s.mainPage = {
      timeout: obj?.mainPage?.timeout ?? bc.mainPage.timeout,
      waitUntil: obj?.mainPage?.waitUntil ?? bc.mainPage.waitUntil,
      url: obj?.mainPage?.url ?? bc.mainPage.url,
    };

    this._s.app.mainPage = {
      useCustomScraper: obj?.app?.mainPage?.useCustomScraper ?? bc.app.mainPage.useCustomScraper,
      requiredProperties:
        obj?.app?.mainPage?.requiredProperties ?? bc.app.mainPage.requiredProperties,
    };

    this._s.app.singlePage = {
      useCustomScraper:
        obj?.app?.singlePage?.useCustomScraper ?? bc.app.singlePage.useCustomScraper,
      requiredProperties:
        obj?.app?.singlePage?.requiredProperties ?? bc.app.singlePage.requiredProperties,
    };
  }
}
