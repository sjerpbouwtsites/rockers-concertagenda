export default class WorkerMessage {
  type = null;

  subtype = null; // command

  messageData = null;

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
  static quick(...config) {
    const thisMessage = new WorkerMessage(...config);
    return thisMessage.json;
  }

  throwSubtypeError() {
    throw new Error(
      `subtype ${typeof this.subtype} ${
        this.subtype.length ? ` lengte ${this.subtype.length}` : ''
      } ${this.subtype} niet toegestaan bij type ${this.type}`,
    );
  }

  check() {
    if (typeof this.type !== 'string') {
      console.log(this);
      throw new Error('type moet string zijn');
    }

    if (this.subtype && typeof this.subtype !== 'string') {
      console.log(this);
      throw new Error('subtype moet string zijn');
    }

    switch (this.type) {
      case 'clients-log':
        return true;
      case 'process':
        this.subtype
          .split(' ')
          .map(
            (thisSubtype) =>
              !['close-client', 'closed', 'workers-status', 'command-start'].includes(thisSubtype),
          )
          .find((subtypeFout) => subtypeFout) && this.throwSubtypeError();
        break;
      case 'update':
        this.subtype
          ?.split(' ')
          .map(
            (thisSubtype) =>
              !['error', 'message-roll', 'scraper-results', 'debugger'].includes(thisSubtype),
          )
          .find((subtypeFout) => subtypeFout) && this.throwSubtypeError();
        break;
      default:
        console.log(this);
        throw new Error('ONBEKEND TYPE WorkerMessage!');
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
      2,
    );
  }
}
