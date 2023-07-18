export default function makeScraperConfig(obj){
  return new MakeScraperConfig(obj)
}

/**
 * TODO
 *
 * @export
 * @param {*} obj 
 * @param {*} additional added to this
 * @return 
 */
export function MakeScraperConfig(obj){

  const basePuppeteerConfig = {
    singlePage: {
      waitUntil: 'domcontentloaded',
      timeout: 5001
    },
    mainPage: {
      waitUntil: 'domcontentloaded',
      timeout: 15001
    },
    app: { // in deze eigen app
      mainPage: { // make base events
        url: null,
        useCustomScraper: false, // geen puppeteer, geen page aangemaakt
        requiredProperties: [], //waarop base events worden gecontroleerd
        enforceMusicEventType: true, // geeft MusicEvent opdracht om properties te trimmen
      },
      singlePage: { // get page info
        useCustomScraper: null, // geen puppeteer, geen page aangemaakt
        requiredProperties: [], //waarop page Info word gecontroleerd
        enforceMusicEventType: false, // geeft MusicEvent opdracht om properties te trimmen.
        longHTMLnewStyle: true
      }
    }
  }
  
  if (!Object.prototype.hasOwnProperty.call(obj, 'workerData')){
    throw new Error(`geen workerData scraperConfig`);
  }

  this.maxExecutionTime = obj.maxExecutionTime ?? 30001;

  // basis
  this.puppeteerConfig = Object.assign({}, basePuppeteerConfig);
  this.workerData = obj.workerData;

  this.hasDecentCategorisation = obj.workerData || true // of singleRawEventCheck echt moet runnen
  
  this.puppeteerConfig.singlePage.timeout = obj?.puppeteerConfig?.singlePage?.timeout ?? this.puppeteerConfig.singlePage.timeout;
  this.puppeteerConfig.singlePage.waitUntil = obj?.puppeteerConfig?.singlePage?.waitUntil ?? this.puppeteerConfig.singlePage.waitUntil;
  
  this.puppeteerConfig.mainPage.timeout = obj?.puppeteerConfig?.mainPage?.timeout ?? this.puppeteerConfig.mainPage.timeout;
  this.puppeteerConfig.mainPage.waitUntil = obj?.puppeteerConfig?.mainPage?.waitUntil ?? this.puppeteerConfig.mainPage.waitUntil;

  this.puppeteerConfig.app.mainPage.url = obj?.puppeteerConfig?.app?.mainPage?.url ?? this.puppeteerConfig.app.mainPage.url
  this.puppeteerConfig.app.mainPage.useCustomScraper = obj?.puppeteerConfig?.app?.mainPage?.useCustomScraper ?? this.puppeteerConfig.app.mainPage.useCustomScraper
  this.puppeteerConfig.app.mainPage.requiredProperties = obj?.puppeteerConfig?.app?.mainPage?.requiredProperties ?? this.puppeteerConfig.app.mainPage.requiredProperties
  this.puppeteerConfig.app.mainPage.enforceMusicEventType = obj?.puppeteerConfig?.app?.mainPage?.enforceMusicEventType ?? this.puppeteerConfig.app.mainPage.enforceMusicEventType
  
  this.puppeteerConfig.app.singlePage.useCustomScraper = obj?.puppeteerConfig?.app?.singlePage?.useCustomScraper ?? this.puppeteerConfig.app.singlePage.useCustomScraper
  this.puppeteerConfig.app.singlePage.requiredProperties = obj?.puppeteerConfig?.app?.singlePage?.requiredProperties ?? this.puppeteerConfig.app.singlePage.requiredProperties
         
  return this;
  
}