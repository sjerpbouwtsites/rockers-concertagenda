import { Worker } from "worker_threads";
import WorkerStatus from "./mods/WorkerStatus.js";
import EventsList from "./mods/events-list.js";
import fsDirections from "./mods/fs-directions.js";
import { handleError, errorAfterSeconds } from "./mods/tools.js";

function init() {
  if (EventsList.isOld("metalfan")) {
    startWorker(fsDirections.scrapeMetalfan, "metalfan", 0);
  }
  if (EventsList.isOld("baroeg")) {
    try {
      Promise.race([
        startWorker(fsDirections.scrapeBaroeg, "baroeg", 0, baroegDoneCallback),
        errorAfterSeconds(240000),
      ]);
      Promise.race([
        startWorker(fsDirections.scrapeBaroeg, "baroeg", 1, baroegDoneCallback),
        errorAfterSeconds(240000),
      ]);
      Promise.race([
        startWorker(fsDirections.scrapeBaroeg, "baroeg", 2, baroegDoneCallback),
        errorAfterSeconds(240000),
      ]);
    } catch (error) {
      handleError(error);
    }
  }

  if (EventsList.isOld("patronaat")) {
    startWorker(fsDirections.scrapePatronaat, "patronaat", 0);
    startWorker(fsDirections.scrapePatronaat, "patronaat", 1);
    startWorker(fsDirections.scrapePatronaat, "patronaat", 2);
  }

  if (EventsList.isOld("nuldertien")) {
    startWorker(fsDirections.scrapeNuldertien, "nuldertien", 0);
    startWorker(fsDirections.scrapeNuldertien, "nuldertien", 1);
    startWorker(fsDirections.scrapeNuldertien, "nuldertien", 2);
    startWorker(fsDirections.scrapeNuldertien, "nuldertien", 3);
  }

  if (EventsList.isOld("effenaar")) {
    startWorker(fsDirections.scrapeEffenaar, "effenaar", 0);
    startWorker(fsDirections.scrapeEffenaar, "effenaar", 1);
    startWorker(fsDirections.scrapeEffenaar, "effenaar", 2);
    startWorker(fsDirections.scrapeEffenaar, "effenaar", 3);
  }

  if (EventsList.isOld("tivolivredenburg")) {
    startWorker(fsDirections.scrapeTivolivredenburg, "tivolivredenburg", 0);
    startWorker(fsDirections.scrapeTivolivredenburg, "tivolivredenburg", 1);
    startWorker(fsDirections.scrapeTivolivredenburg, "tivolivredenburg", 2);
    startWorker(fsDirections.scrapeTivolivredenburg, "tivolivredenburg", 3);
  }

  // if (EventsList.isOld("doornroosje")) {
  //   startWorker(fsDirections.scrapeDoornroosje, "doornroosje", 0);
  //   startWorker(fsDirections.scrapeDoornroosje, "doornroosje", 1);
  //   startWorker(fsDirections.scrapeDoornroosje, "doornroosje", 2);
  //   startWorker(fsDirections.scrapeDoornroosje, "doornroosje", 3);
  // }

  if (EventsList.isOld("boerderij")) {
    startWorker(fsDirections.scrapeBoerderij, "boerderij", 0);
  }

  if (EventsList.isOld("occii")) {
    startWorker(fsDirections.scrapeOccii, "occii", 0);
    startWorker(fsDirections.scrapeOccii, "occii", 1);
  }
  if (EventsList.isOld("dynamo")) {
    startWorker(fsDirections.scrapeDynamo, "dynamo", 0);
    startWorker(fsDirections.scrapeDynamo, "dynamo", 1);
  }
}

init();

function baroegDoneCallback(workerIndex) {
  if (workerIndex + 3 < 8) {
    const newWorkerIndex = workerIndex + 3;
    startWorker(
      fsDirections.scrapeBaroeg,
      "baroeg",
      newWorkerIndex,
      baroegDoneCallback
    );
  }
}

function startWorker(
  workerPath,
  workerName,
  workerIndex = null,
  doneCallback = null
) {
  const thisWorker = new Worker(workerPath);
  thisWorker.workerName = `${workerName}-${workerIndex}`;
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
}
