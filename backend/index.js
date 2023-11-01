// import * as dotenv from 'dotenv';
import WorkerStatus from './mods/WorkerStatus.js';
import { printLocationsToPublic } from './mods/locations.js';
import initMonitorBackend from './monitor/backend.js';
import RockWorker from './mods/rock-worker.js';
import getWorkerConfig from './mods/worker-config.js';
import houseKeeping from './housekeeping.js';

// dotenv.config();

let monitorWebsocketServer = null;

async function waitTime(wait = 500) {
  return new Promise((res) => {
    setTimeout(res, wait);
  });
}

async function startWorker(workerConfig) {
  if (!workerConfig.hasWorkerConfigs) {
    return true;
  }

  const toManyWorkersWorking = WorkerStatus.workersWorking() >= WorkerStatus.maxSimultaneousWorkers;
  if (toManyWorkersWorking) {
    //  console.log('to many workers');
    await waitTime(200);
    return startWorker(workerConfig);
  }

  const thisConfig = workerConfig.get();
  if (!thisConfig?.family) {
    console.log(thisConfig);
  }
  const workingThisFamily = WorkerStatus.workersWorkingOfFamily(thisConfig.family);
  // als er veel ruimte is, voorkeur voor hoog cpu
  if (
    WorkerStatus.OSHasALotOfSpace &&
    thisConfig.CPUReq !== 'high' &&
    workerConfig.highCpuWorkerExists
  ) {
    // console.log('find high user');
    workerConfig.takeBackRejected(thisConfig);
    return startWorker(workerConfig);
  }

  // of er momenteel nog een base event list gemaakt word
  if (!WorkerStatus.familyDoneWithBaseEvents(thisConfig.family) && workingThisFamily) {
    // console.log('base event needs to be finished solo');
    workerConfig.takeBackRejected(thisConfig);
    await waitTime(5);
    return startWorker(workerConfig);
  }

  // of nog niet alle families al werken
  if (
    workingThisFamily > 0 &&
    WorkerStatus.familyDoneWithBaseEvents.length !== WorkerStatus.numberOfFamilies
  ) {
    //  console.log('nog niet allen werken reeds');
    workerConfig.takeBackRejected(thisConfig);
    await waitTime(5);
    return startWorker(workerConfig);
  }

  // als er niet veel OS ruimte is maar deze veel nodig heeft
  if (!WorkerStatus.OSHasALotOfSpace && thisConfig.CPUReq === 'high') {
    // console.log('niet genoeg ruimte voor HIGH cpu');
    workerConfig.takeBackRejected(thisConfig);
    await waitTime(5);
    return startWorker(workerConfig);
  }

  // als er al teveel van deze familie werken

  if (thisConfig.workerConcurrent <= workingThisFamily) {
    // console.log('te veel van deze family concurrent');
    workerConfig.takeBackRejected(thisConfig);
    await waitTime(5);
    return startWorker(workerConfig);
  }

  // als er uberhaupt geen ruimte is
  if (!WorkerStatus.OSHasSpace) {
    // alleen zuinigen door
    if (!WorkerStatus.OSHasMinimalSpace && thisConfig.CPUReq === 'low') {
      //  console.log('zelfs geen ruimte voor kleine');
      workerConfig.takeBackRejected(thisConfig);
      await waitTime(5);
      return startWorker(workerConfig);
    }
    //  console.log('geen ruimte');
    workerConfig.takeBackRejected(thisConfig);
    await waitTime(5);
    return startWorker(workerConfig);
  }

  thisConfig.masterEnv = {
    TICKETMASTER_CONSUMER_KEY: process.env.TICKETMASTER_CONSUMER_KEY,
    TICKETMASTER_CONSUMER_SECRET: process.env.TICKETMASTER_CONSUMER_SECRET,
  };

  const thisWorker = new RockWorker(thisConfig);
  RockWorker.addWorkerMessageHandler(thisWorker);
  WorkerStatus.registerWorker(thisWorker);
  thisWorker.start();
  return startWorker(workerConfig);
}

async function recursiveStartWorkers(workerConfig) {
  if (!workerConfig.hasWorkerConfigs) {
    // console.log('workers op');
    
    return true;
  }
  await waitTime(10);
  return startWorker(workerConfig);
}

async function init() {
  await houseKeeping();
  monitorWebsocketServer = await initMonitorBackend();
  RockWorker.monitorWebsocketServer = monitorWebsocketServer;
  WorkerStatus.monitorWebsocketServer = monitorWebsocketServer; // TODO WEG

  WorkerStatus.monitorCPUS();
  const workerConfig = getWorkerConfig();
  WorkerStatus.totalWorkers = workerConfig.numberOfWorkers;
  WorkerStatus.registerAllWorkersAsWaiting(workerConfig.listCopy());
  recursiveStartWorkers(workerConfig);
  WorkerStatus.initializeReporting();
  printLocationsToPublic();
}

init();
