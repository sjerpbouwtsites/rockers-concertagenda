import { Worker } from "worker_threads";
import WorkerStatus from "./mods/WorkerStatus.js";
import EventsList from "./mods/events-list.js";

function init() {
  if (EventsList.isOld("metalfan")) {
    startWorker("./mods/scrape-metalfan.js", "metalfan", 0);
  }
  if (EventsList.isOld("baroeg")) {
    startWorker("./mods/scrape-baroeg.js", "baroeg", 0, baroegDoneCallback);
    startWorker("./mods/scrape-baroeg.js", "baroeg", 1, baroegDoneCallback);
    startWorker("./mods/scrape-baroeg.js", "baroeg", 2, baroegDoneCallback);
  }

  if (EventsList.isOld("occii")) {
    startWorker("./mods/scrape-occii.js", "occii", 0);
    startWorker("./mods/scrape-occii.js", "occii", 1);
  }
  if (EventsList.isOld("boerderij")) {
    startWorker("./mods/scrape-boerderij.js", "boerderij", 0);
  }
  if (EventsList.isOld("dynamo")) {
    startWorker("./mods/scrape-dynamo.js", "dynamo", 0);
    startWorker("./mods/scrape-dynamo.js", "dynamo", 1);
  }
}

init();

function baroegDoneCallback(workerIndex) {
  if (workerIndex < 8) {
    const newWorkerIndex = workerIndex + 3;
    startWorker(
      "./mods/scrape-baroeg.js",
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
