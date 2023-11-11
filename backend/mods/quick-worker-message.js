/**
 * class om snel berichten te versturen vanuit de worker.
 * voegt standaard workerData mee in workerDone, debugger etc.
 * schrijf voor ieder slag bericht een andere methode
 */
export default class QuickWorkerMessage {
  constructor(workerData) {
    this.workerData = workerData;
  }

  quickMessage(type, subtype, messageData) {
    return JSON.stringify({
      type,
      subtype,
      messageData,
    });
  }

  /**
   * @param {Error} error
   * @returns update, error, {content: workerData, status, text}
   */
  error(error) {
    return this.quickMessage('update', 'error', {
      content: {
        workerData: this.workerData,
        status: 'error',
        text: error.message,
      },
    });
  }

  abstractQuickWorker(statusString = 'registered', moreData = null) {
    return this.quickMessage('process', 'workers-status', {
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
      this.quickMessage('process', 'workers-status', {
        todo: numberToDo,
        content: {
          status: 'todo',
          workerData: this.workerData,
        },
      }),
    ];
  }

  todoNew(numberToDo) {
    return this.quickMessage('process', 'workers-status', {
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
    return this.quickMessage('clients-log', type, {
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
    return this.quickMessage('update', 'debugger', {
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
    return this.quickMessage('update', 'message-roll', {
      content: {
        workerData: this.workerData,
        text: String(text),
      },
    });
  }
}
