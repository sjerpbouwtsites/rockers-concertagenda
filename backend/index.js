import * as dotenv from 'dotenv';
import WorkerStatus from './mods/WorkerStatus.js';
import EventsList from './mods/events-list.js';
import * as _t from './mods/tools.js';
import passMessageToMonitor from './monitor/pass-message-to-monitor.js';
import { printLocationsToPublic } from './mods/locations.js';
import initMonitorBackend from './monitor/backend.js';
import RockWorker, { WorkerMessage } from './mods/rock-worker.js';
import getWorkerConfig from './mods/worker-config.js';
import houseKeeping from './housekeeping.js';

dotenv.config();

let monitorWebsocketServer = null;

async function init() {
  await houseKeeping();
  monitorWebsocketServer = await initMonitorBackend();
  WorkerStatus.monitorWebsocketServer = monitorWebsocketServer;
  WorkerStatus.monitorCPUS();
  const workerConfig = getWorkerConfig();
  WorkerStatus.totalWorkers = workerConfig.numberOfWorkers;
  WorkerStatus.registerAllWorkersAsWaiting(workerConfig.listCopy());
  recursiveStartWorkers(workerConfig);
  WorkerStatus.initializeReporting();
  printLocationsToPublic();
}

async function recursiveStartWorkers(workerConfig) {
  if (!workerConfig.hasWorkerConfigs) {
    console.log('workers op');
    return true;
  }
  await _t.waitTime(150);
  return startWorker(workerConfig);
}

async function startWorker(workerConfig) {
  const shellArguments = _t.getShellArguments();

  const toManyWorkersWorking = WorkerStatus.workersWorking() >= WorkerStatus.maxSimultaneousWorkers;
  if (toManyWorkersWorking) {
    console.log('to many workers');
    await _t.waitTime(25);
    return recursiveStartWorkers(workerConfig);
  }

  const thisConfig = workerConfig.get();
  const workingThisFamily = WorkerStatus.workersWorkingOfFamily(
    thisConfig.family,
  );
  // als er veel ruimte is, voorkeur voor hoog cpu
  if (WorkerStatus.OSHasALotOfSpace && thisConfig.CPUReq === 'high') {
    console.log('find high user');
    workerConfig.takeBackRejected(thisConfig);
    return recursiveStartWorkers(workerConfig);
  }

  // of er momenteel nog een base event list gemaakt word
  if (!WorkerStatus.familyDoneWithBaseEvents(thisConfig.family) && workingThisFamily) {
    console.log('base event needs to be finished solo');
    workerConfig.takeBackRejected(thisConfig);
    await _t.waitTime(25);
    return recursiveStartWorkers(workerConfig);
  }

  // of nog niet alle families al werken
  if (workingThisFamily > 0 && (WorkerStatus.familyDoneWithBaseEvents.length !== WorkerStatus.numberOfFamilies)) {
    console.log('nog niet allen werken reeds');
    workerConfig.takeBackRejected(thisConfig);
    await _t.waitTime(5);
    return recursiveStartWorkers(workerConfig);
  }

  // als er niet veel OS ruimte is maar deze veel nodig heeft
  if (!WorkerStatus.OSHasALotOfSpace && thisConfig.CPUReq === 'high') {
    console.log('niet genoeg ruimte voor HIGH cpu');
    workerConfig.takeBackRejected(thisConfig);
    await _t.waitTime(50);
    return recursiveStartWorkers(workerConfig);
  }

  // als er al teveel van deze familie werken

  if (thisConfig.workerConcurrent <= workingThisFamily) {
    console.log('te veel van deze family concurrent');
    workerConfig.takeBackRejected(thisConfig);
    await _t.waitTime(25);
    return recursiveStartWorkers(workerConfig);
  }

  // als er uberhaupt geen ruimte is
  if (!WorkerStatus.OSHasSpace) {
    // alleen zuinigen door
    if (!WorkerStatus.OSHasMinimalSpace && thisConfig.CPUReq === 'low') {
      console.log('zelfs geen ruimte voor kleine');
      workerConfig.takeBackRejected(thisConfig);
      await _t.waitTime(100);
      return recursiveStartWorkers(workerConfig);
    }
    console.log('geen ruimte');
    workerConfig.takeBackRejected(thisConfig);
    await _t.waitTime(50);
    return recursiveStartWorkers(workerConfig);
  }

  thisConfig.masterEnv = {
    TICKETMASTER_CONSUMER_KEY: process.env.TICKETMASTER_CONSUMER_KEY,
    TICKETMASTER_CONSUMER_SECRET: process.env.TICKETMASTER_CONSUMER_SECRET,
  };

  const thisWorker = new RockWorker(thisConfig, shellArguments);
  thisWorker.postMessage(WorkerMessage.quick('process', 'command-start'));
  WorkerStatus.registerWorker(thisWorker);
  addWorkerMessageHandler(thisWorker);
  return recursiveStartWorkers(workerConfig);
}

/**
 * @param {Worker} thisWorker instantiated worker with path etc
 */
function addWorkerMessageHandler(thisWorker) {
  thisWorker.on('message', (message) => {
    if (message?.status) {
      // change worker status
      // and trigger message propagation to monitor / console
      console.log('OUDE SYSTEEM!!!', 'indexjs addWorkerMessageHandler');

      WorkerStatus.change(
        thisWorker.name,
        message?.status,
        message?.message,
        thisWorker,
      );

      // pass worker data to EventsList
      // free Worker thread and memory
      if (message?.status === 'done') {
        if (message?.data) {
          EventsList.merge(message.data);
        }
        thisWorker.unref();
      }
    }

    passMessageToMonitor(message, thisWorker.name);
  });
}

init();
