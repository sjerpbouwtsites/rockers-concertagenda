/**
 * wsMessage is de wrapper die om iedere websocket boodschap gaat.
 * NIET DE WRAPPER van worker naar main thread.
 * Data word gecontroleerd. 
 * construct: type (string) en data.
 * verstuur als msg.json (je krijgt de json)
 * type kan zijn: process|server-log|update|app-overview
 * als type = app-overview dan subtype is all-workers
 * als type = process data string is 'close-client' of 'closed'
 * als type = clients-html, dan subtype moet zijn string niet null.
 * als type = clients-log , dan weet ik veel
 * als type = update:
 *    en subtype = terminal-error. is als server vastloopt. print error. LEGACY
 *    en subtype = scraper-error. is als scraper piept.                  LEGACY
 *    ,,     ,,  = scraper-terminal-error. is als scraper echt vastloopt LEGACY
 *    ,,     ,,  = error. in messageData: ernst, data, etc. 
 *    ,,     ,,  = message-roll. komt bovenaan veld met andere berichten.
 *    ,,     ,,  = scraper-results. object met één of meerdere records van huidige aantallen.
 *    ,,     ,,  = workers-status
 *    ,,     ,,  = debugger. Komt in de debug rol terecht, en in de console.
 * @property {string} type process|server-log|clients-log|update|app-overview
 * @property {string} subtype terminal-error|scraper-error|scraper-terminal-error|message-roll|scraper-results|workers-status|all-workers
 * @property {*} messageData bevat data van message.
 */
export default class wsMessage {
  constructor(type, subtype, messageData) {
    this.checkType = {};
    this.setCheckType();
    this.type = type;
    this.subtype = subtype;
    this.messageData = messageData;
    this.initCheck();
  }
  /**
   * Converteer een config in één keer in een wsMessage json object.
   * @param {*} config as in constructor
   * @returns {JSON} output of json getter wsMessage.
   */
  static quick(config) {
    const thisMessage = new wsMessage(config);
    return thisMessage.json;
  }
  throwSubtypeError() {
    throw new Error(
      `subtype ${typeof this.subtype} ${
        this.subtype.length ? ` lengte ${this.subtype.length}` : ""
      } ${this.subtype} niet toegestaan bij type ${this.type}`
    );
  }
  initCheck() {
    if (typeof this.type !== "string") {
      throw new Error(`type moet string zijn, nu ${typeof this.type} ${this.type}`);
    }
    if (this.subtype && typeof this.subtype !== "string") {
      throw new Error(`subtype moet string zijn, nu ${typeof this.subtype} ${this.subtype}`);
    }
    if (!Object.prototype.hasOwnProperty.call(this.checkType, this.type)) {
      throw new Error(`Onbekend type: ${this.type}`)
    } 
    return this.checkType[this.type](this.subtype)
    
  }
  setCheckType(){
    this.checkType['app-overview'] = subtype =>{
      if (!subtype.includes("all-workers")) {
        this.throwSubtypeError();
      }
      return true;
    }
    this.checkType['process'] = subtype =>{
      if(subtype
        .split(" ")
        .map((thisSubtype) => {
          return ![
            "close-client",
            "closed",
            "workers-status",
            "command-start",
          ].includes(thisSubtype);
        })
        .find((subtypeFout) => {
          return subtypeFout;
        })) {
        this.throwSubtypeError();
      } return true
    }
    this.checkType['clients-html'] = subtype =>{
      if (typeof subtype !== "string" ||
      (subtype.length &&
        subtype.length < 1)){

        this.throwSubtypeError();
      } return true;
    }
    this.checkType['update'] = subtype =>{
      if (subtype
        .split(" ")
        .map((subtypeSplit) => {
          return ![
            "error",
            "terminal-error",
            "scraper-error",
            "scraper-terminal-error",
            "message-roll",
            "scraper-results",
            "workers-status",
            "debugger",
          ].includes(subtypeSplit);
        })
        .find((subtypeFout) => {
          return subtypeFout;
        }) ) {
        this.throwSubtypeError();
      } return true;
    }
    this.checkType['server-log'] = () =>{
      return true;
    }
    this.checkType['clients-log'] = () =>{
      return true;
    }
    
  }

  /**
   * data is checked by constructor.
   * @returns JSON object of {type, subtype, messageData}
   */
  get json() {
    return JSON.stringify(
      {
        type: this.type,
        subtype: this.subtype,
        messageData: this.messageData,
      },
      null,
      2
    );
  }
}