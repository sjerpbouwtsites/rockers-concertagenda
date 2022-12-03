import fs from 'fs';
import { Worker } from "worker_threads";
import WorkerStatus from "./mods/WorkerStatus.js";
import EventsList from "./mods/events-list.js";
import fsDirections from "./mods/fs-directions.js";
import {
  getShellArguments,
  waitFor,
} from "./mods/tools.js";
import passMessageToMonitor from "./monitor/pass-message-to-monitor.js";
import { printLocationsToPublic } from "./mods/locations.js";
import initMonitorBackend from "./monitor/backend.js";
import RockWorker from "./mods/rock-worker.js";
import getWorkerConfig from './mods/worker-config.js';
import { WorkerMessage } from "./mods/rock-worker.js";

const shellArguments = getShellArguments();
let monitorWebsocketServer = null;

async function init() {
  const monitorWebsocketServer = await initMonitorBackend();
  WorkerStatus.monitorWebsocketServer = monitorWebsocketServer;
  houseKeeping();
  WorkerStatus.monitorCPUS();
  const workerConfig = getWorkerConfig();

  WorkerStatus.totalWorkers = workerConfig.numberOfWorkers;
  WorkerStatus.registerAllWorkersAsWaiting(workerConfig.listCopy())
  recursiveStartWorkers(workerConfig);
  WorkerStatus.initializeReporting();
  printLocationsToPublic();

}



async function recursiveStartWorkers(workerConfig) {
   if (!workerConfig.hasWorkerConfigs) {
    console.log('workers op')
    return true;
   }
   await wait150ms()
   return startWorker(workerConfig)

}

function wait150ms() {
  return new Promise((res, rej) => {
    setTimeout(() => {
      res();
    },666);
  });
}

async function startWorker(workerConfig
) {
  const toManyWorkersWorking = WorkerStatus.workersWorking() >= 5;
  if (toManyWorkersWorking){
    await wait150ms();
    return recursiveStartWorkers(workerConfig)
  }

  const thisConfig = workerConfig.get();
  
  const workingThisFamily = WorkerStatus.workersWorkingOfFamily(thisConfig.family);
  const spaceForConcurrant = thisConfig.workerConcurrent > workingThisFamily;
  
  let startWorkerBool = false;
  if (thisConfig.CPUReq ==='high') {
    startWorkerBool = spaceForConcurrant && WorkerStatus.OSHasALotOfSpace
  
  } else if (thisConfig.CPUReq ==='normal'){
    startWorkerBool = spaceForConcurrant && WorkerStatus.OSHasSpace

  } else if(thisConfig.CPUReq ==='low'){
    startWorkerBool = true;

  } else {
    throw new Error('verkeerde CPUReq')
  }
  
  if (!startWorkerBool) {
    workerConfig.firstOneLast(thisConfig);
    return recursiveStartWorkers(workerConfig)
  }

  const thisWorker = new RockWorker(thisConfig);
  thisWorker.postMessage(WorkerMessage.quick("process", "command-start"));
  WorkerStatus.registerWorker(thisConfig);
  addWorkerMessageHandler(thisWorker);
  return recursiveStartWorkers(workerConfig)  
}

/**
 * @param {Worker} thisWorker instantiated worker with path etc
 */
function addWorkerMessageHandler(thisWorker) {
  thisWorker.on("message", (message) => {
    if (message?.status) {
      // change worker status
      // and trigger message propagation to monitor / console
      console.log("OUDE SYSTEEM!!!", "indexjs addWorkerMessageHandler");

      WorkerStatus.change(
        thisWorker.name,
        message?.status,
        message?.message,
        thisWorker
      );

      // pass worker data to EventsList
      // free Worker thread and memory
      if (message?.status === "done") {
        if (message?.data) {
          EventsList.merge(message.data);
        }
        thisWorker.unref();
      }
    }

    passMessageToMonitor(message, thisWorker.name);
  });
}

function houseKeeping() {

  fs.rm(fsDirections.publicTexts, { recursive: true }, () => {
    fs.mkdirSync(fsDirections.publicTexts);
  })

  // fs.rmdirSync(fsDirections.publicTexts, {
  //   recursive: true
  // });
}



init();



