import os from "os-utils";
import EventsList from "./events-list.js";

export default class WorkerStatus {
  static _workers = {};
  static CPUFree = 100;
  static waitingWorkers = [];
  static registerWorker(newWorkerName) {
    if (WorkerStatus.waitingWorkers.indexOf(newWorkerName) !== -1) {
      WorkerStatus.waitingWorkers = WorkerStatus.waitingWorkers.filter(
        (workerName) => {
          return newWorkerName !== workerName;
        }
      );
    }

    WorkerStatus._workers[newWorkerName] = {
      status: "working",
      message: null,
      todo: null,
    };
  }

  static monitorCPUS() {
    os.cpuFree(function (v) {
      WorkerStatus.CPUFree = v * 100;
    });
    if (
      Object.keys(WorkerStatus._workers).length === 0 ||
      WorkerStatus.currentNotDone > 0
    ) {
      setTimeout(() => {
        WorkerStatus.monitorCPUS();
      }, 50);
    }
  }

  static get OSHasSpace() {
    return WorkerStatus.currentNotDone.length < 7 && WorkerStatus.CPUFree > 20;
  }

  static get OSHasALotOfSpace() {
    return WorkerStatus.currentNotDone.length < 3 && WorkerStatus.CPUFree > 50;
  }

  static change(name, status, message, worker) {
    WorkerStatus._workers[name].status = status;
    WorkerStatus._workers[name].message = message;

    const statusses = status.split(" ");

    if (statusses.includes("done")) {
      console.log("");
      console.log(`${name} done.`.padStart(20, " ").padStart(30, "✔️"));
      if (statusses.includes("dirty")) {
        console.log(
          `${name} dirty dirty.`.padStart(20, " ").padStart(30, "🚮🌁")
        );
      }
      WorkerStatus.checkIfAllDone();
    }

    if (statusses.includes("error")) {
      console.log("");
      console.error(`${name} ERROR.`.padStart(20, " ").padStart(30, "💣"));
      console.error(message);
    }

    if (statusses.includes("working")) {
      console.log("");
      console.log(`${name}: ${message}`);
    }

    if (statusses.includes("console")) {
      console.log("");
      console.log(`${name}`.padStart(20, " ").padStart(30, "💬"));
      console.log(message);
    }

    if (statusses.includes("todo")) {
      WorkerStatus._workers[name].todo = message;
    }
  }

  static get currentNotDone() {
    const notDone = Object.entries(WorkerStatus._workers)
      .map(([workerName, workerData]) => {
        workerData.name = workerName;
        return workerData;
      })
      .filter((workerData) => {
        return !workerData.status.includes("done");
      });
    return notDone;
  }

  static get currentDone() {
    const notDone = Object.entries(WorkerStatus._workers)
      .map(([workerName, workerData]) => {
        workerData.name = workerName;
        return workerData;
      })
      .filter((workerData) => {
        return workerData.status.includes("done");
      });
    return notDone.length;
  }

  static checkIfAllDone() {
    const notDone = WorkerStatus.currentNotDone;
    if (notDone.length === 0 && WorkerStatus.waitingWorkers.length === 0) {
      console.log(" ");
      console.log("All workers done");
      WorkerStatus.programEnd();
    }
  }

  static reportOnActiveWorkers() {
    const notDone = WorkerStatus.currentNotDone;
    console.log("Currently active:");
    notDone.forEach((notDoneWorker) => {
      const todoMSG = notDoneWorker.todo ? ` todo: ${notDoneWorker.todo}` : " initializing";
      console.log(`${notDoneWorker.name}${todoMSG}`);
    });
    if (notDone.length > 0 || WorkerStatus.waitingWorkers.length !== 0) {
      setTimeout(() => {
        WorkerStatus.reportOnActiveWorkers();
      }, 2000);
    }
  }
  static programEnd() {
    EventsList.printAllToJSON();
    console.log("PROGRAM END");
    setTimeout(() => {
      process.exit();
    }, 10000);
  }
}
