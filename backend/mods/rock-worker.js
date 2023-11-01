import { Worker } from 'worker_threads';
import WorkerMessage from "./worker-message.js";
import shell from './shell.js';
import WorkerStatus from "./WorkerStatus.js";

// @TODO

export default class RockWorker extends Worker {
  static monitorWebsocketServer;

  constructor(confObject) {
    super(confObject.path, {
      workerData: { ...confObject, shell },
    });
    this.name = confObject.name;
    this.family = confObject.family;
    this.index = confObject.index;
  }

  get workerName() {
    return `${this.family}-${this.index}`;
  }

  start() {
    this.postMessage(WorkerMessage.quick('process', 'command-start'));
  }

  /**
 * @param {Worker} thisWorker instantiated worker with path etc
 */
  static addWorkerMessageHandler(thisWorker) {
    thisWorker.on('message', (message) => {
      if (!RockWorker.monitorWebsocketServer) {
        throw Error('monitor niet klaar!');
      }

      // BOODSCHAPPEN VOOR DB

      // DE EIGENLIJKE BOODSCHAP NAAR MONITOR
      const parsedMessage = JSON.parse(message);
      parsedMessage.messageData.workerName = thisWorker.workerName; // TODO veel te veel bewerking
      RockWorker.monitorWebsocketServer.broadcast(JSON.stringify(
        parsedMessage,
        null,
        2,
      ));

      // DIT MOET HELEMAAL NAAR WORKER STATUS.
      if (parsedMessage.type === 'process' && parsedMessage?.subtype === 'workers-status') {
        const statusString = parsedMessage?.messageData?.content?.status ?? null;
        WorkerStatus.change(thisWorker.workerName, statusString, parsedMessage.messageData);
      }
      if (parsedMessage.type === 'update' && parsedMessage?.subtype === 'scraper-results') {
        WorkerStatus.change(thisWorker.workerName, 'todo', parsedMessage?.messageData?.todo);
      }
      if (parsedMessage.type.includes('update') && parsedMessage.subtype.includes('error')) {
        WorkerStatus.processError(thisWorker.workerName, parsedMessage.messageData);
      }
    });
  }
}
