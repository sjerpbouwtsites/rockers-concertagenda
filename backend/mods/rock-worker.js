import { Worker } from 'worker_threads';

// @TODO

export default class RockWorker extends Worker {
  constructor(confObject, shellArguments) {
    super(confObject.path, {
      workerData: { ...confObject, shellArguments },
    });
    this.name = confObject.name;
    this.family = confObject.family;
    this.index = confObject.index;
  }

  get workerName() {
    console.warn('OUDE METHODE');
    return this.name;
  }
}

/**
 * class om snel berichten te versturen vanuit de worker.
 * voegt standaard workerData mee in workerDone, debugger etc.
 * schrijf voor ieder slag bericht een andere methode
 */
export class QuickWorkerMessage {
  constructor(workerData) {
    this.workerData = workerData;
  }

  /**
   * @param {Error} error
   * @returns update, error, {content: workerData, status, text}
   */
  error(error) {
    return WorkerMessage.quick('update', 'error', {
      content: {
        workerData: this.workerData,
        status: 'error',
        text: error.message,
      },
    });
  }

  abstractQuickWorker(statusString = 'registered', moreData) {
    return WorkerMessage.quick('process', 'workers-status', {
      content: {
        workerData: this.workerData,
        status: statusString,
      },
      ...moreData,
    });
  }

  workerInitialized() {
    return this.abstractQuickWorker('init');
  }

  workerStarted() {
    return this.abstractQuickWorker('working');
  }

  workerDone(amountOfEvents) {
    const as = this.abstractQuickWorker('done', { amountOfEvents });
    return as;
  }

  /**
   * ATTENTION
   * @param {Number} numberToDo
   * @returns {JSONArray} RETURNS TWO JSON OBJECTS FOR TWO CALLS.
   */ // @ Dit was een array van meuk. Nu is het een kutte API door de app heen. HJerstellen.
  todo(numberToDo) {
    console.log('LEGACY');
    return [
      WorkerMessage.quick('process', 'workers-status', {
        todo: numberToDo,
        content: {
          status: 'todo',
          workerData: this.workerData,
        },
      }),
    ];
  }

  todoNew(numberToDo) {
    return WorkerMessage.quick('process', 'workers-status', {
      todo: numberToDo,
      content: {
        status: 'todo',
        workerData: this.workerData,
      },
    });
  }

  /**
   * @param {*} toConsole
   * @returns {JSON} update debugger {content: workerData, debug}
   */
  toConsole(toConsole, type = 'dir') {
    return WorkerMessage.quick('clients-log', type, {
      content: {
        workerData: this.workerData,
        debug: toConsole ?? 'debugger heeft null meegekregen.',
      },
    });
  }

  /**
   * @param {*} toDebug
   * @param {string} title //TODO implementeren voorkant
   * @returns {JSON} update debugger {content: workerData, debug}
   */
  debugger(toDebug, title) {
    return WorkerMessage.quick('update', 'debugger', {
      title,
      content: {
        workerData: this.workerData,
        debug: toDebug,
      },
    });
  }

  /**
   * @param {any} text
   * @returns {JSON} update message-roll {content: workerData, text}
   */
  messageRoll(text) {
    return WorkerMessage.quick('update', 'message-roll', {
      content: {
        workerData: this.workerData,
        text: String(text),
      },
    });
  }
}

export class WorkerMessage {
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
    throw new Error(`subtype ${typeof this.subtype} ${this.subtype.length ? ` lengte ${this.subtype.length}` : ''} ${this.subtype} niet toegestaan bij type ${this.type}`);
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
          .map((thisSubtype) => ![
            'close-client',
            'closed',
            'workers-status',
            'command-start',
          ].includes(thisSubtype))
          .find((subtypeFout) => subtypeFout) && this.throwSubtypeError();
        break;
      case 'update':
        this.subtype
          ?.split(' ')
          .map((thisSubtype) => ![
            'error',
            'message-roll',
            'scraper-results',
            'debugger',
          ].includes(thisSubtype))
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
    return JSON.stringify({
      type: this.type,
      subtype: this.subtype,
      messageData: this.messageData,
    }, null, 2);
  }
}
