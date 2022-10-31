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
 * als type = update:
 *    en subtype = terminal-error. is als server vastloopt. print error. LEGACY
 *    en subtype = scraper-error. is als scraper piept.                  LEGACY
 *    ,,     ,,  = scraper-terminal-error. is als scraper echt vastloopt LEGACY
 *    ,,     ,,  = error. in messageData: ernst, data, etc. 
 *    ,,     ,,  = message-roll. komt bovenaan veld met andere berichten.
 *    ,,     ,,  = scraper-results. object met één of meerdere records van huidige aantallen.
 *    ,,     ,,  = workers-status
 *    ,,     ,,  = debugger. Komt in de debug rol terecht, en in de console.
 * @property {string} type process|server-log|update|app-overview
 * @property {string} subtype terminal-error|scraper-error|scraper-terminal-error|message-roll|scraper-results|workers-status|all-workers
 * @property {*} messageData bevat data van message.
 */
export default class wsMessage {
  type = null
  subtype = null;
  messageData = null
  constructor(type, subtype, messageData) {
    this.type = type;
    this.subtype = subtype;
    this.messageData = messageData;
    this.check();
  }
  /**
   * Converteer een config in één keer in een wsMessage json object.
   * @param {*} config as in constructor
   * @returns {JSON} output of json getter wsMessage.
   */
  static quick(config){
    const thisMessage = new wsMessage(config);
    return thisMessage.json
  }
  throwSubtypeError(){
    throw new Error(`subtype ${typeof this.subtype} ${this.subtype.length ? ` lengte ${this.subtype.length}` : ''} ${this.subtype} niet toegestaan bij type ${this.type}`)
  }
  check(){

    if (typeof this.type !== 'string') {
      console.log(this);
      throw new Error('type moet string zijn')
    }
    if (this.subtype && typeof this.subtype !== 'string') {
      console.log(this);
      throw new Error('subtype moet string zijn')      
    }

    switch (this.type) {
      case "app-overview":
        !this.subtype.includes("all-workers") && this.throwSubtypeError();
        return true;
        break;
      case "process":
        this.subtype
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
          }) && this.throwSubtypeError();
        break;
      case "clients-html":
        typeof this.subtype !== "string" ||
          (this.subtype.length &&
            this.subtype.length < 1 &&
            this.throwSubtypeError());
        break;
      case "update":
        this.subtype
          .split(" ")
          .map((thisSubtype) => {
            return ![
              "error",
              "terminal-error",
              "scraper-error",
              "scraper-terminal-error",
              "message-roll",
              "scraper-results",
              "workers-status",
              "debugger",
            ].includes(thisSubtype);
          })
          .find((subtypeFout) => {
            return subtypeFout;
          }) && this.throwSubtypeError();
        break;
      case "server-log":
        // niets te doen.
        break;
      default:
        console.log(this);
        throw new Error("ONBEKEND TYPE wsMessage!");
        break;
    }
    return true;
  }
  
  /**
   * data is checked by constructor.
   * @returns JSON object of {type, subtype, messageData}
   */
  get json() {
    return JSON.stringify({
      type: this.type,
      subtype: this.subtype,
      messageData: this.messageData
    }, null, 2)
  }
}