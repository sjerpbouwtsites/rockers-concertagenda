//https://en.concerts-metal.com/s-2429__Ragnarok_-_Bree.html

import { Worker } from "worker_threads";
import WorkerStatus from "./mods/WorkerStatus.js";
import EventsList from "./mods/events-list.js";
import fsDirections from "./mods/fs-directions.js";
import { handleError, errorAfterSeconds } from "./mods/tools.js";
import { printLocationsToPublic } from "./mods/locations.js";

function init() {
  WorkerStatus.monitorCPUS();

  const workerList = [];

  if (EventsList.isOld("metalfan")) {
    workerList.push([fsDirections.scrapeMetalfan, "metalfan", 0]);
  }
  if (EventsList.isOld("baroeg")) {
    try {
      workerList.push([fsDirections.scrapeBaroeg, "baroeg", 0]);
      workerList.push([fsDirections.scrapeBaroeg, "baroeg", 1]);
      workerList.push([fsDirections.scrapeBaroeg, "baroeg", 2]);
      workerList.push([fsDirections.scrapeBaroeg, "baroeg", 3]);
      workerList.push([fsDirections.scrapeBaroeg, "baroeg", 4]);
      workerList.push([fsDirections.scrapeBaroeg, "baroeg", 5]);
      workerList.push([fsDirections.scrapeBaroeg, "baroeg", 6]);
      workerList.push([fsDirections.scrapeBaroeg, "baroeg", 7]);
      workerList.push([fsDirections.scrapeBaroeg, "baroeg", 8]);
    } catch (error) {
      handleError(error);
    }
  }

  if (EventsList.isOld("patronaat")) {
    workerList.push([fsDirections.scrapePatronaat, "patronaat", 0]);
    workerList.push([fsDirections.scrapePatronaat, "patronaat", 1]);
    workerList.push([fsDirections.scrapePatronaat, "patronaat", 2]);
  }

  if (EventsList.isOld("013")) {
    workerList.push([fsDirections.scrape013, "013", 0]);
    workerList.push([fsDirections.scrape013, "013", 1]);
    workerList.push([fsDirections.scrape013, "013", 2]);
    workerList.push([fsDirections.scrape013, "013", 3]);
  }

  if (EventsList.isOld("effenaar")) {
    workerList.push([fsDirections.scrapeEffenaar, "effenaar", 0]);
    workerList.push([fsDirections.scrapeEffenaar, "effenaar", 1]);
    workerList.push([fsDirections.scrapeEffenaar, "effenaar", 2]);
    workerList.push([fsDirections.scrapeEffenaar, "effenaar", 3]);
  }

  if (EventsList.isOld("tivolivredenburg")) {
    workerList.push([
      fsDirections.scrapeTivolivredenburg,
      "tivolivredenburg",
      0,
    ]);
    workerList.push([
      fsDirections.scrapeTivolivredenburg,
      "tivolivredenburg",
      1,
    ]);
    workerList.push([
      fsDirections.scrapeTivolivredenburg,
      "tivolivredenburg",
      2,
    ]);
    workerList.push([
      fsDirections.scrapeTivolivredenburg,
      "tivolivredenburg",
      3,
    ]);
  }

  if (EventsList.isOld("doornroosje")) {
    workerList.push([fsDirections.scrapeDoornroosje, "doornroosje", 0]);
    workerList.push([fsDirections.scrapeDoornroosje, "doornroosje", 1]);
    workerList.push([fsDirections.scrapeDoornroosje, "doornroosje", 2]);
    workerList.push([fsDirections.scrapeDoornroosje, "doornroosje", 3]);
    workerList.push([fsDirections.scrapeDoornroosje, "doornroosje", 4]);
    workerList.push([fsDirections.scrapeDoornroosje, "doornroosje", 5]);
  }

  if (EventsList.isOld("metropool")) {
    workerList.push([fsDirections.scrapeMetropool, "metropool", 0]);
    workerList.push([fsDirections.scrapeMetropool, "metropool", 1]);
    workerList.push([fsDirections.scrapeMetropool, "metropool", 2]);
    workerList.push([fsDirections.scrapeMetropool, "metropool", 3]);
  }

  if (EventsList.isOld("boerderij")) {
    workerList.push([fsDirections.scrapeBoerderij, "boerderij", 0]);
  }

  if (EventsList.isOld("occii")) {
    workerList.push([fsDirections.scrapeOccii, "occii", 0]);
    workerList.push([fsDirections.scrapeOccii, "occii", 1]);
  }
  if (EventsList.isOld("dynamo")) {
    workerList.push([fsDirections.scrapeDynamo, "dynamo", 0]);
    workerList.push([fsDirections.scrapeDynamo, "dynamo", 1]);
  }

  if (EventsList.isOld("melkweg")) {
    workerList.push([fsDirections.scrapeMelkweg, "melkweg", 0, null, true]);
  }

  if (EventsList.isOld("bibelot")) {
    workerList.push([fsDirections.scrapeBibelot, "bibelot", 0]);
  }

  if (EventsList.isOld("dbs")) {
    workerList.push([fsDirections.scrapeDbs, "dbs", 0]);
    workerList.push([fsDirections.scrapeDbs, "dbs", 1]);
    workerList.push([fsDirections.scrapeDbs, "dbs", 2]);
  }

  if (EventsList.isOld("gebrdenobel")) {
    workerList.push([fsDirections.scrapeGebrdenobel, "gebrdenobel", 0]);
  }

  if (EventsList.isOld("neushoorn") || true) {
    workerList.push([fsDirections.scrapeNeushoorn, "neushoorn", 0]);
  }

  if (EventsList.isOld("afaslive")) {
    workerList.push([fsDirections.scrapeAfaslive, "afaslive", 0]);
    workerList.push([fsDirections.scrapeAfaslive, "afaslive", 1]);
    workerList.push([fsDirections.scrapeAfaslive, "afaslive", 2]);
    workerList.push([fsDirections.scrapeAfaslive, "afaslive", 3]);

  }

  walkThroughWorkerList(workerList);

  WorkerStatus.reportOnActiveWorkers();

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
  workerName,
  workerIndex = null,
  doneCallback = null,
  highCapacity = false
) {
  const workerNameWithIndex = `${workerName}-${workerIndex}`;
  if (highCapacity) {
    if (!WorkerStatus.OSHasSpace) {
      WorkerStatus.waitingWorkers.push(workerNameWithIndex);
      setTimeout(() => {
        startWorker(workerPath, workerName, workerIndex, doneCallback);
      }, 250);
      return true;
    }
  } else {
    if (!WorkerStatus.OSHasALotOfSpace) {
      WorkerStatus.waitingWorkers.push(workerNameWithIndex);
      setTimeout(() => {
        startWorker(workerPath, workerName, workerIndex, doneCallback);
      }, 250);
      return true;
    }
  }

  const thisWorker = new Worker(workerPath);
  thisWorker.workerName = workerNameWithIndex;
  thisWorker.postMessage({
    command: "start",
    data: {
      page: workerIndex,
    },
  });

  WorkerStatus.registerWorker(thisWorker.workerName);
  thisWorker.on("message", (messageData) => {
    if (messageData?.status) {
      WorkerStatus.change(
        thisWorker.workerName,
        messageData?.status,
        messageData?.message,
        thisWorker
      );
    }
    if (messageData?.status === "done") {
      if (messageData?.data) {
        EventsList.merge(messageData.data);
      }
      if (doneCallback) {
        doneCallback(workerIndex);
      }
      thisWorker.unref();
    }
  });
  return true;
}

init();
