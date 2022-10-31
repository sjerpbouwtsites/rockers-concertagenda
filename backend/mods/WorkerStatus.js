import os from "os-utils";
import EventsList from "./events-list.js";
import wsMessage from "../monitor/wsMessage.js";
import { parentPort } from "worker_threads";

export default class WorkerStatus {
  static _workers = {};
  static CPUFree = 100;
  static waitingWorkers = [];
  /**
   * Niet een dynamische waarde maar éénmalig ingesteld
   */
  static totalWorkers = 0;
  /**
   * Teller van meldingen 'worker done' die binnenkomen.
   */
  static completedWorkers = 0;
  static monitorWebsocketServer = null;
  static reportingInterval = null;
  static registerWorker(newWorkerName) {
    if (WorkerStatus.waitingWorkers.indexOf(newWorkerName) !== -1) {
      WorkerStatus.waitingWorkers = WorkerStatus.waitingWorkers.filter(
        (workerName) => {
          return newWorkerName !== workerName;
        }
      );
    }

    WorkerStatus._workers[newWorkerName] = {
      status: "registered",
      todo: 0,
      errors: [],
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

  /**
   * monitorWebsocketServer
   */
  static get mwss() {
    return WorkerStatus.monitorWebsocketServer;
  }

  static get OSHasSpace() {
    return WorkerStatus.currentNotDone.length < 7 && WorkerStatus.CPUFree > 20;
  }

  static get OSHasALotOfSpace() {
    return WorkerStatus.currentNotDone.length < 5 && WorkerStatus.CPUFree > 50;
  }

  static initializeReporting() {
    WorkerStatus.reportingInterval = setInterval(
      WorkerStatus.reportOnActiveWorkers,
      1000
    );
  }

  static change(name, status, message) {
    // console.log("change WorkerStatus");
    // console.log(name, status, message);
    const statusses = status?.split(" ") ?? "";

    if (statusses.includes("done")) {
      WorkerStatus._workers[name].status = "done";
      WorkerStatus._workers[name].todo = 0;
      WorkerStatus.completedWorkers = WorkerStatus.completedWorkers + 1;
    }

    if (statusses.includes("error")) {
      WorkerStatus._workers[name].errors.push(message);
    }

    if (statusses.includes("working")) {
      WorkerStatus._workers[name].status = "working";
    }

    if (statusses.includes("todo")) {
      WorkerStatus._workers[name].todo = message.todo;
    }
  }

  static get countedWorkersToDo() {
    return WorkerStatus.totalWorkers - WorkerStatus.completedWorkers;
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
      WorkerStatus.programEnd();
      return true;
    }
    return false;
  }

  static reportOnActiveWorkers() {
    if (WorkerStatus.checkIfAllDone()) {
      clearInterval(WorkerStatus.reportingInterval);
    }
    const messageRollMsg = new wsMessage("update", "message-roll", {
      text: `${WorkerStatus.countedWorkersToDo} workers unfinished`,
    });

    const allWorkersStatussenMsg = new wsMessage(
      "app-overview",
      "all-workers",
      {
        workers: WorkerStatus._workers,
        CPUFree: WorkerStatus.CPUFree,
      }
    );
    if (WorkerStatus.mwss) {
      WorkerStatus.mwss.broadcast(messageRollMsg.json);
      WorkerStatus.mwss.broadcast(allWorkersStatussenMsg.json);
    }
  }
  static programEnd() {
    console.log("All workers done");
    if (WorkerStatus.mwss) {
      const wsMsg2 = new wsMessage("process", "closed");
      WorkerStatus.mwss.broadcast(wsMsg2.json);
    }
    EventsList.printAllToJSON();
    setTimeout(() => {
      process.exit();
    }, 10000);
  }
}
