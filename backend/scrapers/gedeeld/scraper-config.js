export default function makeScraperConfig(obj){
  return new MakeScraperConfig(obj)
}

export function MakeScraperConfig(obj){

  this.baseEventTimeout = obj.baseEventTimeout ?? 15000;
  this.singlePageTimeout = obj.singlePageTimeout ?? 5000;
  this.maxExecutionTime = obj.maxExecutionTime ?? 30000;
  const basePuppeteerConfig = {
    singlePage: {
      waitUntil: 'domcontentloaded',
      timeout: this.singlePageTimeout || this.baseEventTimeout
    },
    mainPage: {
      waitUntil: 'domcontentloaded',
      timeout: this.baseEventTimeout
    },
    app: { // in deze eigen app
      mainPage: { // make base events
        url: null,
        useCustomScraper: false, // geen puppeteer, geen page aangemaakt
        requiredProperties: [] //waarop base events worden gecontroleerd
      },
      singlePage: { // get page info
        useCustomScraper: null, // geen puppeteer, geen page aangemaakt
        requiredProperties: [] //waarop page Info word gecontroleerd
      }
    }
  }

  if (!Object.prototype.hasOwnProperty.call(obj, 'workerData')){
    throw new Error(`geen workerData scraperConfig`);
  }

  // basis
  this.puppeteerConfig = Object.assign({}, basePuppeteerConfig);
  this.workerData = Object.assign({}, obj.workerData);

  // puppeteerConfig.singlePage & puppeteerConfig.mainPage
  if (!Object.prototype.hasOwnProperty.call(obj, 'puppeteerConfig')){
    return this;
  }
  if (Object.prototype.hasOwnProperty.call(obj.puppeteerConfig, 'singlePage')) {
    this.puppeteerConfig.singlePage = Object.assign(this.puppeteerConfig.singlePage, obj.puppeteerConfig.singlePage)
  }
  if (Object.prototype.hasOwnProperty.call(obj.puppeteerConfig, 'mainPage')) {
    this.puppeteerConfig.mainPage = Object.assign(this.puppeteerConfig.mainPage, obj.puppeteerConfig.mainPage)
  }

  // puppeteerConfig.app
  if (!Object.prototype.hasOwnProperty.call(obj.puppeteerConfig, 'app')){
    return this;
  }
  if (Object.prototype.hasOwnProperty.call(obj.puppeteerConfig.app, 'singlePage')) {
    this.puppeteerConfig.app.singlePage = Object.assign(this.puppeteerConfig.app.singlePage, obj.puppeteerConfig.app.singlePage)
  }
  if (Object.prototype.hasOwnProperty.call(obj.puppeteerConfig.app, 'mainPage')) {
    this.puppeteerConfig.app.mainPage = Object.assign(this.puppeteerConfig.app.mainPage, obj.puppeteerConfig.app.mainPage)
  }      
         
  return this;
  
}