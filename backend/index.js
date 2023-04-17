import fs from "fs";
import WorkerStatus from "./mods/WorkerStatus.js";
import EventsList from "./mods/events-list.js";
import fsDirections from "./mods/fs-directions.js";
import * as _t from "./mods/tools.js";
import passMessageToMonitor from "./monitor/pass-message-to-monitor.js";
import { printLocationsToPublic } from "./mods/locations.js";
import initMonitorBackend from "./monitor/backend.js";
import RockWorker from "./mods/rock-worker.js";
import getWorkerConfig from "./mods/worker-config.js";
import { WorkerMessage } from "./mods/rock-worker.js";
import * as dotenv from 'dotenv';
dotenv.config();

let monitorWebsocketServer = null;

async function init() {
  monitorWebsocketServer = await initMonitorBackend();
  WorkerStatus.monitorWebsocketServer = monitorWebsocketServer;
  houseKeeping();
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
    console.log("workers op");
    return true;
  }
  await _t.waitFor(150);
  return startWorker(workerConfig);
}

async function startWorker(workerConfig) {
  const toManyWorkersWorking = WorkerStatus.workersWorking() >= WorkerStatus.maxSimultaneousWorkers;
  if (toManyWorkersWorking) {
    await _t.waitFor(150);
    return recursiveStartWorkers(workerConfig);
  }

  const thisConfig = workerConfig.get();

  const shellArguments = _t.getShellArguments();

  thisConfig.masterEnv = {
    TICKETMASTER_CONSUMER_KEY: process.env.TICKETMASTER_CONSUMER_KEY,
    TICKETMASTER_CONSUMER_SECRET: process.env.TICKETMASTER_CONSUMER_SECRET
  }

  const workingThisFamily = WorkerStatus.workersWorkingOfFamily(
    thisConfig.family
  );
  const spaceForConcurrant = thisConfig.workerConcurrent > workingThisFamily;

  let startWorkerBool = false;
  if (thisConfig.CPUReq === "high") {
    startWorkerBool = spaceForConcurrant && WorkerStatus.OSHasALotOfSpace;
  } else if (thisConfig.CPUReq === "normal") {
    startWorkerBool = spaceForConcurrant && WorkerStatus.OSHasSpace;
  } else if (thisConfig.CPUReq === "low") {
    startWorkerBool = true;
  } else {
    throw new Error("verkeerde CPUReq");
  }

  if (!startWorkerBool) {
    workerConfig.firstOneLast(thisConfig);
    return recursiveStartWorkers(workerConfig);
  }

  const thisWorker = new RockWorker(thisConfig, shellArguments);
  thisWorker.postMessage(WorkerMessage.quick("process", "command-start"));
  WorkerStatus.registerWorker(thisWorker);
  addWorkerMessageHandler(thisWorker);
  return recursiveStartWorkers(workerConfig);
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
  });

  // fs.rmdirSync(fsDirections.publicTexts, {
  //   recursive: true
  // });
}

init();
