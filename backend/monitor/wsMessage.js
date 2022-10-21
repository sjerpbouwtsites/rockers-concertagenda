/**
 * wsMessage is de wrapper die om iedere websocket boodschap gaat.
 * construct: type (string) en data.
 * verstuur als msg.json (je krijgt de json)
 * type kan zijn: process|server-log|update
 * als type = process data string is 'close-client' of 'closed'
 * als type = update:
 *    en subtype = terminal-error. is als server vastloopt. print error.
 *    en subtype = scraper-error. is als scraper piept.
 *    ,,     ,,  = scraper-terminal-error. is als scraper echt vastloopt
 *    ,,     ,,  = message-roll. komt bovenaan veld met andere berichten.
 *    ,,     ,,  = scraper-results. object met één of meerdere records van huidige aantallen.
 *    ,,     ,,  = workers-status
 */
export default class wsMessage {
  type = null
  subtype = null;
  messageData = null
  constructor(type, subtype, messageData) {

    this.type = type;
    this.subtype = subtype;
    this.messageData = messageData;
  }
  get json() {
    return JSON.stringify({
      type: this.type,
      subtype: this.subtype,
      messageData: this.messageData
    })
  }
}