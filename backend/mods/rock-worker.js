import { Worker } from 'worker_threads';
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

  get workerName() {
    console.warn('OUDE METHODE');
    return this.name;
  }
}
