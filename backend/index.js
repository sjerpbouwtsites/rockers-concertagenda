import fs from 'fs';
import { Worker } from "worker_threads";
import WorkerStatus from "./mods/WorkerStatus.js";
import EventsList from "./mods/events-list.js";
import fsDirections from "./mods/fs-directions.js";
import { handleError, errorAfterSeconds, getShellArguments } from "./mods/tools.js";
import { printLocationsToPublic } from "./mods/locations.js";
import initMonitorBackend from "./monitor/backend.js"
import wsMessage from './monitor/wsMessage.js';
import RockWorker from "./mods/rock-worker.js";
import {WorkerMessage} from "./mods/rock-worker.js";

const shellArguments = getShellArguments();
let monitorWebsocketServer = null;

async function init() {
  const monitorWebsocketServer = await initMonitorBackend();
  WorkerStatus.monitorWebsocketServer = monitorWebsocketServer;

  houseKeeping();

  WorkerStatus.monitorCPUS();

  let workerList = [];

  if (EventsList.isOld("metalfan", shellArguments?.force) || true) {
    workerList.push([fsDirections.scrapeMetalfan, "metalfan", 0]);
  }
  if (EventsList.isOld("baroeg", shellArguments?.force) || true) {
    workerList.push([fsDirections.scrapeBaroeg, "baroeg", 0]);
    workerList.push([fsDirections.scrapeBaroeg, "baroeg", 1]);
    // workerList.push([fsDirections.scrapeBaroeg, "baroeg", 2]);
    // workerList.push([fsDirections.scrapeBaroeg, "baroeg", 3]);
    // workerList.push([fsDirections.scrapeBaroeg, "baroeg", 4]);
    // workerList.push([fsDirections.scrapeBaroeg, "baroeg", 5]);
    // workerList.push([fsDirections.scrapeBaroeg, "baroeg", 6]);
    // workerList.push([fsDirections.scrapeBaroeg, "baroeg", 7]);
    // workerList.push([fsDirections.scrapeBaroeg, "baroeg", 8]);
  }

  // if (EventsList.isOld("patronaat", shellArguments?.force)) {
  //   workerList.push([fsDirections.scrapePatronaat, "patronaat", 0]);
  //   workerList.push([fsDirections.scrapePatronaat, "patronaat", 1]);
  //   workerList.push([fsDirections.scrapePatronaat, "patronaat", 2]);
  // }

  // if (EventsList.isOld("013", shellArguments?.force)) {
  //   workerList.push([fsDirections.scrape013, "013", 0]);
  //   workerList.push([fsDirections.scrape013, "013", 1]);
  //   workerList.push([fsDirections.scrape013, "013", 2]);
  //   workerList.push([fsDirections.scrape013, "013", 3]);
  // }

  // if (EventsList.isOld("effenaar", shellArguments?.force)) {
  //   workerList.push([fsDirections.scrapeEffenaar, "effenaar", 0]);
  //   // workerList.push([fsDirections.scrapeEffenaar, "effenaar", 1]);
  //   // workerList.push([fsDirections.scrapeEffenaar, "effenaar", 2]);
  //   // workerList.push([fsDirections.scrapeEffenaar, "effenaar", 3]);
  // }

  // if (EventsList.isOld("tivolivredenburg", shellArguments?.force)) {
  //   workerList.push([
  //     fsDirections.scrapeTivolivredenburg,
  //     "tivolivredenburg",
  //     0,
  //   ]);
  //   workerList.push([
  //     fsDirections.scrapeTivolivredenburg,
  //     "tivolivredenburg",
  //     1,
  //   ]);
  //   workerList.push([
  //     fsDirections.scrapeTivolivredenburg,
  //     "tivolivredenburg",
  //     2,
  //   ]);
  //   workerList.push([
  //     fsDirections.scrapeTivolivredenburg,
  //     "tivolivredenburg",
  //     3,
  //   ]);
  // }

  // if (EventsList.isOld("doornroosje", shellArguments?.force)) {
  //   workerList.push([fsDirections.scrapeDoornroosje, "doornroosje", 0]);
  //   workerList.push([fsDirections.scrapeDoornroosje, "doornroosje", 1]);
  //   workerList.push([fsDirections.scrapeDoornroosje, "doornroosje", 2]);
  //   workerList.push([fsDirections.scrapeDoornroosje, "doornroosje", 3]);
  //   workerList.push([fsDirections.scrapeDoornroosje, "doornroosje", 4]);
  //   workerList.push([fsDirections.scrapeDoornroosje, "doornroosje", 5]);
  // }

  // if (EventsList.isOld("metropool", shellArguments?.force)) {
  //   workerList.push([fsDirections.scrapeMetropool, "metropool", 0]);
  //   workerList.push([fsDirections.scrapeMetropool, "metropool", 1]);
  //   workerList.push([fsDirections.scrapeMetropool, "metropool", 2]);
  //   workerList.push([fsDirections.scrapeMetropool, "metropool", 3]);
  // }

  // if (EventsList.isOld("boerderij", shellArguments?.force)) {
  //   workerList.push([fsDirections.scrapeBoerderij, "boerderij", 0]);
  // }

  // if (EventsList.isOld("occii", shellArguments?.force)) {
  //   workerList.push([fsDirections.scrapeOccii, "occii", 0]);
  //   workerList.push([fsDirections.scrapeOccii, "occii", 1]);
  // }
  // if (EventsList.isOld("dynamo", shellArguments?.force)) {
  //   workerList.push([fsDirections.scrapeDynamo, "dynamo", 0]);
  //   workerList.push([fsDirections.scrapeDynamo, "dynamo", 1]);
  // }

  // if (EventsList.isOld("melkweg", shellArguments?.force)) {
  //   workerList.push([fsDirections.scrapeMelkweg, "melkweg", 0, true]);
  //   workerList.push([fsDirections.scrapeMelkweg, "melkweg", 1, true]);
  //   workerList.push([fsDirections.scrapeMelkweg, "melkweg", 2, true]);
  // }

  // if (EventsList.isOld("bibelot", shellArguments?.force)) {
  //   workerList.push([fsDirections.scrapeBibelot, "bibelot", 0]);
  // }

  // if (EventsList.isOld("dbs", shellArguments?.force)) {
  //   workerList.push([fsDirections.scrapeDbs, "dbs", 0]);
  //   workerList.push([fsDirections.scrapeDbs, "dbs", 1]);
  //   workerList.push([fsDirections.scrapeDbs, "dbs", 2]);
  // }

  // if (EventsList.isOld("gebrdenobel", shellArguments?.force)) {
  //   workerList.push([fsDirections.scrapeGebrdenobel, "gebrdenobel", 0]);
  // }

  // if (EventsList.isOld("neushoorn", shellArguments?.force)) {
  //   workerList.push([fsDirections.scrapeNeushoorn, "neushoorn", 0]);
  // }

  // if (EventsList.isOld("afaslive", shellArguments?.force)) {
  //   workerList.push([fsDirections.scrapeAfaslive, "afaslive", 0]);
  //   workerList.push([fsDirections.scrapeAfaslive, "afaslive", 1]);
  //   workerList.push([fsDirections.scrapeAfaslive, "afaslive", 2]);
  //   workerList.push([fsDirections.scrapeAfaslive, "afaslive", 3]);
  // }

  // if (EventsList.isOld("iduna", shellArguments?.force)) {
  //   workerList.push([fsDirections.scrapeIduna, "iduna", 0]);
  // }

  // if (EventsList.isOld("kavka", shellArguments?.force)) {
  //   workerList.push([fsDirections.scrapeKavka, "kavka", 0]);
  // }

  // if (EventsList.isOld("depul", shellArguments?.force)) {
  //   workerList.push([fsDirections.scrapeDepul, "depul", 0]);
  //   workerList.push([fsDirections.scrapeDepul, "depul", 1]);
  //   workerList.push([fsDirections.scrapeDepul, "depul", 2]);
  // }

  // if (EventsList.isOld("paradiso", shellArguments?.force)) {
  //   workerList.push([fsDirections.scrapeParadiso, "paradiso", 0]);
  //   workerList.push([fsDirections.scrapeParadiso, "paradiso", 1]);
  //   workerList.push([fsDirections.scrapeParadiso, "paradiso", 2]);
  //   workerList.push([fsDirections.scrapeParadiso, "paradiso", 3]);
  // }

  // if (EventsList.isOld("volt", shellArguments?.force)) {
  //   workerList.push([fsDirections.scrapeVolt, "volt", 0]);
  //   workerList.push([fsDirections.scrapeVolt, "volt", 1]);
  //   workerList.push([fsDirections.scrapeVolt, "volt", 2]);
  // }

  // if (EventsList.isOld("duycker", shellArguments?.force)) {
  //   workerList.push([fsDirections.scrapeDuycker, "duycker", 0]);
  // }

  workerList = shuffleArray(workerList);
  WorkerStatus.totalWorkers = workerList.length;

  walkThroughWorkerList(workerList);

  if (!WorkerStatus.checkIfAllDone()) {
    WorkerStatus.reportOnActiveWorkers();
  }

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
  const thisWorker = new RockWorker(workerPath, workerFamily, workerIndex);
  thisWorker.postMessage(WorkerMessage.quick("process", "command-start"));

  WorkerStatus.registerWorker(thisWorker.name);
  addWorkerMessageHandler(thisWorker);
  if (highCapacity) {
    if (!WorkerStatus.OSHasSpace) {
      WorkerStatus.waitingWorkers.push(thisWorker.name);
      setTimeout(() => {
        startWorker(workerPath, workerFamily, workerIndex);
      }, 250);
      return true;
    }
  } else {
    if (!WorkerStatus.OSHasALotOfSpace) {
      WorkerStatus.waitingWorkers.push(thisWorker.name);
      setTimeout(() => {
        startWorker(workerPath, workerFamily, workerIndex);
      }, 250);
      return true;
    }
  }
  return true;
}

/**
 * @param {Worker} thisWorker instantiated worker with path etc
 */
function addWorkerMessageHandler(thisWorker) {
  thisWorker.on("message", (message) => {
    if (message?.status) {
      // change worker status
      // and trigger message propagation to monitor / console
      console.log("OUDE SYSTEEM!!!");
      console.log(message);
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
    } else {
      const parsedMessaged = JSON.parse(message);
      parsedMessaged.messageData.workerName = thisWorker.name;
      // to check integrity
      const wsMsgInst = new wsMessage(
        parsedMessaged?.type,
        parsedMessaged?.subtype,
        parsedMessaged?.messageData
      );
      if (wsMsgInst.type === "process") {
        if (wsMsgInst?.subtype === "workers-status") {
          const statusString = wsMsgInst?.messageData?.content?.status ?? null;
          WorkerStatus.change(
            thisWorker.name,
            statusString,
            wsMsgInst.messageData
          );
        }
      }
      if (wsMsgInst.type === "update") {
        if (wsMsgInst?.subtype === "scraper-results") {
          WorkerStatus.change(
            thisWorker.name,
            "todo",
            wsMsgInst?.messageData?.todo
          );
        }

        if (wsMsgInst.subtype.includes("error")) {
          WorkerStatus.change(thisWorker.name, "error", wsMsgInst.messageData);
          WorkerStatus.mwss.broadcast(wsMsgInst.json);
        }

        if (
          wsMsgInst.subtype.includes("message-roll") ||
          wsMsgInst.subtype.includes("debugger")
        ) {
          WorkerStatus.mwss.broadcast(wsMsgInst.json);
        }

        if (wsMsgInst.subtype.includes("todo")) {
          WorkerStatus.todo(thisWorker.name, wsMsgInst.messageData?.todo);
          WorkerStatus.mwss.broadcast(wsMsgInst.json);
        }
      }
    }
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



