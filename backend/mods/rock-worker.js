import { Worker } from "worker_threads";

export default class RockWorker extends Worker{
  family = null;
  index = null;
  highCapacity = false;
  constructor(path, family, index){
    super(path, { workerData: {
      family,
      index,
      name: `${family}-${index}`
    } });
    this.family = family;
    this.index = index;
  }
  get name(){
    return `${this.family}-${this.index}`;
  }
  get workerName(){
    console.warn('OUDE METHODE');
    return this.name;
  }
  postToWorkerThread(message){

  }
}

/**
 * class om snel berichten te versturen vanuit de worker.
 * voegt standaard workerData mee in workerDone, debugger etc.
 * schrijf voor ieder slag bericht een andere methode
 */
export class QuickWorkerMessage {
  constructor(workerData) {
   this.workerData = workerData
  }
  error(error){
    return WorkerMessage.quick("update", 'error', {
      content: {
        workerData: this.workerData,
        status: 'error',
        text: error.message
      },
    })
  }
  workerDone(){
    return WorkerMessage.quick("process", 'workers-status', {
      content: {
        workerData: this.workerData,
        status: "done"
      },
    })
  }
  debugger(toDebug){
    return WorkerMessage.quick("update", 'debugger', {
      content: {
        workerData: this.workerData,
        debug: toDebug 
      }
    })
  }
}

export class WorkerMessage {
  type = null
  subtype = null; // command 
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
  static quick(...config){
    const thisMessage = new WorkerMessage(...config);
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
      case 'process':
        this.subtype.split(' ').map(thisSubtype => {
          return !['close-client', 'closed', 'workers-status', 'command-start'].includes(thisSubtype)
        }).find(subtypeFout => {
          return subtypeFout;
        }) && this.throwSubtypeError();
         break;
         case 'update':
          this.subtype?.split(' ').map(thisSubtype => {
            return !['error', 'message-roll', 'scraper-results', 'debugger'].includes(thisSubtype)
          }).find(subtypeFout => {
            return subtypeFout;
          })
           && this.throwSubtypeError();
          break;   
      default:
        console.log(this);
        throw new Error("ONBEKEND TYPE WorkerMessage!");
        break;
    return true;
    }
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