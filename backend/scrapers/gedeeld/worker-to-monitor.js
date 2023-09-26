import { parentPort, workerData } from 'worker_threads';

export default class WorkerToMonitor {
  sendMessages = [];

  todo(numberToDo) {
    return WorkerMessage.quick('process', 'workers-status', {
      todo: numberToDo,
      content: {
        status: 'todo',
        workerData: this.workerData,
      },
    });
  }

  //   error(error) {
  //     return WorkerMessage.quick('update', 'error', workerData, {
  //       content: {
  //         workerData,
  //         status: 'error',
  //         text: error.message,
  //       },
  //     });
  //   }

  //   abstractQuickWorker(statusString = 'registered', moreData) {
  //     return WorkerMessage.quick('process', 'workers-status', {
  //       content: {
  //         workerData: this.workerData,
  //         status: statusString,
  //       },
  //       ...moreData,
  //     });
  //   }

  //   workerInitialized() {
  //     return this.abstractQuickWorker('init');
  //   }

  //   workerStarted() {
  //     return this.abstractQuickWorker('working');
  //   }

  //   workerDone(amountOfEvents) {
  //     const as = this.abstractQuickWorker('done', { amountOfEvents });
  //     return as;
  //   }

  //   /**
  //    * @param {*} toConsole
  //    * @returns {JSON} update debugger {content: workerData, debug}
  //    */
  //   toConsole(toConsole, type = 'dir') {
  //     return WorkerMessage.quick('clients-log', type, {
  //       content: {
  //         workerData: this.workerData,
  //         debug: toConsole ?? 'debugger heeft null meegekregen.',
  //       },
  //     });
  //   }

  //   /**
  //    * @param {*} toDebug
  //    * @param {string} title //TODO implementeren voorkant
  //    * @returns {JSON} update debugger {content: workerData, debug}
  //    */
  //   debugger(toDebug, title) {
  //     return WorkerMessage.quick('update', 'debugger', {
  //       title,
  //       content: {
  //         workerData: this.workerData,
  //         debug: toDebug,
  //       },
  //     });
  //   }

  //   /**
  //    * @param {any} text
  //    * @returns {JSON} update message-roll {content: workerData, text}
  //    */
  //   messageRoll(text) {
  //     return WorkerMessage.quick('update', 'message-roll', {
  //       content: {
  //         workerData: this.workerData,
  //         text: String(text),
  //       },
  //     });
  //   }
}
