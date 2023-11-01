import { Worker } from 'worker_threads';
import passMessageToMonitor from '../monitor/pass-message-to-monitor.js';
import WorkerMessage from "./worker-message.js";
import shell from './shell.js';

// @TODO

export default class RockWorker extends Worker {
  constructor(confObject) {
    super(confObject.path, {
      workerData: { ...confObject, shell },
    });
    this.name = confObject.name;
    this.family = confObject.family;
    this.index = confObject.index;
  }

  start() {
    this.postMessage(WorkerMessage.quick('process', 'command-start'));
  }

  /**
 * @param {Worker} thisWorker instantiated worker with path etc
 */
  static addWorkerMessageHandler(thisWorker) {
    thisWorker.on('message', (message) => {
      passMessageToMonitor(message, thisWorker.name);
    });
  }
}
