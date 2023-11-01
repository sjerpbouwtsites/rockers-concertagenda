import WorkerMessage from "./worker-message.js";

/**
 * class om snel berichten te versturen vanuit de worker.
 * voegt standaard workerData mee in workerDone, debugger etc.
 * schrijf voor ieder slag bericht een andere methode
 */
export default class QuickWorkerMessage {
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
