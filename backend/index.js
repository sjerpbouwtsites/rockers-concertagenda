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
import { WorkerMessage } from "./mods/rock-worker.js";

const shellArguments = getShellArguments();
let monitorWebsocketServer = null;

async function init() {
  const monitorWebsocketServer = await initMonitorBackend();
  WorkerStatus.monitorWebsocketServer = monitorWebsocketServer;

  houseKeeping();

  WorkerStatus.monitorCPUS();

  let workerList = [];

  // @TODO maak hier mooie configuratie objecten van
  if (EventsList.isOld("metalfan", shellArguments?.force)) {
    workerList.push([fsDirections.scrapers.metalfan, "metalfan", 0]);
  }

  if (EventsList.isOld("baroeg", shellArguments?.force)) {
    workerList.push([fsDirections.scrapers.baroeg, "baroeg", 0]);
    workerList.push([fsDirections.scrapers.baroeg, "baroeg", 1]);
    workerList.push([fsDirections.scrapers.baroeg, "baroeg", 2]);
    workerList.push([fsDirections.scrapers.baroeg, "baroeg", 3]);
    workerList.push([fsDirections.scrapers.baroeg, "baroeg", 4]);
    workerList.push([fsDirections.scrapers.baroeg, "baroeg", 5]);
    workerList.push([fsDirections.scrapers.baroeg, "baroeg", 6]);
    workerList.push([fsDirections.scrapers.baroeg, "baroeg", 7]);
    workerList.push([fsDirections.scrapers.baroeg, "baroeg", 8]);
  }

  if (EventsList.isOld("patronaat", shellArguments?.force)) {
    workerList.push([fsDirections.scrapers.patronaat, "patronaat", 0]);
    workerList.push([fsDirections.scrapers.patronaat, "patronaat", 1]);
    workerList.push([fsDirections.scrapers.patronaat, "patronaat", 2]);
  }

  if (EventsList.isOld("013", shellArguments?.force)) {
    workerList.push([fsDirections.scrapers['013'], "013", 0]);
    workerList.push([fsDirections.scrapers['013'], "013", 1]);
    workerList.push([fsDirections.scrapers['013'], "013", 2]);
    workerList.push([fsDirections.scrapers['013'], "013", 3]);
  }

  if (EventsList.isOld("effenaar", shellArguments?.force)) {
    workerList.push([fsDirections.scrapers.effenaar, "effenaar", 0]);
    workerList.push([fsDirections.scrapers.effenaar, "effenaar", 1]);
    workerList.push([fsDirections.scrapers.effenaar, "effenaar", 2]);
    workerList.push([fsDirections.scrapers.effenaar, "effenaar", 3]);
  }

  if (EventsList.isOld("tivolivredenburg", shellArguments?.force)) {
    workerList.push([
      fsDirections.scrapers.tivolivredenburg,
      "tivolivredenburg",
      0,
    ]);
    workerList.push([
      fsDirections.scrapers.tivolivredenburg,
      "tivolivredenburg",
      1,
    ]);
    workerList.push([
      fsDirections.scrapers.tivolivredenburg,
      "tivolivredenburg",
      2,
    ]);
    workerList.push([
      fsDirections.scrapers.tivolivredenburg,
      "tivolivredenburg",
      3,
    ]);
  }

  if (EventsList.isOld("doornroosje", shellArguments?.force)) {
    workerList.push([fsDirections.scrapers.doornroosje, "doornroosje", 0]);
    workerList.push([fsDirections.scrapers.doornroosje, "doornroosje", 1]);
    workerList.push([fsDirections.scrapers.doornroosje, "doornroosje", 2]);
    workerList.push([fsDirections.scrapers.doornroosje, "doornroosje", 3]);
    workerList.push([fsDirections.scrapers.doornroosje, "doornroosje", 4]);
    workerList.push([fsDirections.scrapers.doornroosje, "doornroosje", 5]);
  }

  if (EventsList.isOld("metropool", shellArguments?.force)) {
    workerList.push([fsDirections.scrapers.metropool, "metropool", 0]);
    workerList.push([fsDirections.scrapers.metropool, "metropool", 1]);
    workerList.push([fsDirections.scrapers.metropool, "metropool", 2]);
    workerList.push([fsDirections.scrapers.metropool, "metropool", 3]);
  }

  if (EventsList.isOld("boerderij", shellArguments?.force)) {
    workerList.push([fsDirections.scrapers.boerderij, "boerderij", 0]);
  }

  if (EventsList.isOld("occii", shellArguments?.force)) {
    workerList.push([fsDirections.scrapers.occii, "occii", 0]);
    workerList.push([fsDirections.scrapers.occii, "occii", 1]);
  }
  if (EventsList.isOld("dynamo", shellArguments?.force)) {
    workerList.push([fsDirections.scrapers.dynamo, "dynamo", 0]);
    workerList.push([fsDirections.scrapers.dynamo, "dynamo", 1]);
  }

  if (EventsList.isOld("melkweg", shellArguments?.force)) {
    workerList.push([fsDirections.scrapers.melkweg, "melkweg", 0, true]);
    workerList.push([fsDirections.scrapers.melkweg, "melkweg", 1, true]);
    workerList.push([fsDirections.scrapers.melkweg, "melkweg", 2, true]);
  }

  if (EventsList.isOld("bibelot", shellArguments?.force)) {
    workerList.push([fsDirections.scrapers.bibelot, "bibelot", 0]);
  }

  if (EventsList.isOld("dbs", shellArguments?.force)) {
    workerList.push([fsDirections.scrapers.dbs, "dbs", 0]);
    workerList.push([fsDirections.scrapers.dbs, "dbs", 1]);
    workerList.push([fsDirections.scrapers.dbs, "dbs", 2]);
  }

  if (EventsList.isOld("gebrdenobel", shellArguments?.force)) {
    workerList.push([fsDirections.scrapers.gebrdenobel, "gebrdenobel", 0]);
  }

  if (EventsList.isOld("neushoorn", shellArguments?.force)) {
    workerList.push([fsDirections.scrapers.neushoorn, "neushoorn", 0]);
  }

  if (EventsList.isOld("afaslive", shellArguments?.force)) {
    workerList.push([fsDirections.scrapers.afaslive, "afaslive", 0]);
    workerList.push([fsDirections.scrapers.afaslive, "afaslive", 1]);
    workerList.push([fsDirections.scrapers.afaslive, "afaslive", 2]);
    workerList.push([fsDirections.scrapers.afaslive, "afaslive", 3]);
  }

  if (EventsList.isOld("iduna", shellArguments?.force)) {
    workerList.push([fsDirections.scrapers.iduna, "iduna", 0]);
  }

  if (EventsList.isOld("kavka", shellArguments?.force)) {
    workerList.push([fsDirections.scrapers.kavka, "kavka", 0]);
  }

  if (EventsList.isOld("depul", shellArguments?.force)) {
     workerList.push([fsDirections.scrapers.depul, "depul", 0]);
    workerList.push([fsDirections.scrapers.depul, "depul", 1]);
    workerList.push([fsDirections.scrapers.depul, "depul", 2]);
  }

  if (EventsList.isOld("paradiso", shellArguments?.force)) {
    workerList.push([fsDirections.scrapers.paradiso, "paradiso", 0]);
    workerList.push([fsDirections.scrapers.paradiso, "paradiso", 1]);
    workerList.push([fsDirections.scrapers.paradiso, "paradiso", 2]);
    workerList.push([fsDirections.scrapers.paradiso, "paradiso", 3]);
  }

  if (EventsList.isOld("volt", shellArguments?.force)) {
    workerList.push([fsDirections.scrapers.volt, "volt", 0]);
    workerList.push([fsDirections.scrapers.volt, "volt", 1]);
    workerList.push([fsDirections.scrapers.volt, "volt", 2]);
  }

  if (EventsList.isOld("duycker", shellArguments?.force) || true) {
    workerList.push([fsDirections.scrapers.duycker, "duycker", 0]);
  }

  workerList = shuffleArray(workerList);
  WorkerStatus.totalWorkers = workerList.length;
  walkThroughWorkerList(workerList);
  WorkerStatus.initializeReporting();
  printLocationsToPublic();
}

function walkThroughWorkerList(workerList) {
  if (!workerList.length) return true;
  const workerListCopy = [...workerList];
  const singleWorkerConfig = workerListCopy.shift();
  return Promise.race([wait55ms(), startWorker(...singleWorkerConfig)]).then(
    () => {
      return walkThroughWorkerList(workerListCopy);
    }
  );
}

function wait55ms() {
  return new Promise((res, rej) => {
    setTimeout(() => {
      res();
    }, 55);
  });
}

async function startWorker(
  workerPath,
  workerFamily,
  workerIndex = null,
  highCapacity = false
) {
  if (highCapacity) {
    while (!WorkerStatus.OSHasALotOfSpace) {
      await waitFor(111);
    }
  } else {
    while (!WorkerStatus.OSHasALotOfSpace) {
      await waitFor(111);
    }
  }
  const thisWorker = new RockWorker(workerPath, workerFamily, workerIndex);
  thisWorker.postMessage(WorkerMessage.quick("process", "command-start"));
  WorkerStatus.registerWorker(thisWorker.name);
  addWorkerMessageHandler(thisWorker);
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

function shuffleArray(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }
  return array;
}

init();



