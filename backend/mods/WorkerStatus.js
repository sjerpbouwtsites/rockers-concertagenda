import os from "os-utils";
import EventsList from "./events-list.js";

export default class WorkerStatus {
  static _workers = {};
  static CPUFree = 100;
  static registerWorker(name) {
    WorkerStatus._workers[name] = {
      status: "working",
      message: null,
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
    return WorkerStatus.currentNotDone < 7 && WorkerStatus.CPUFree > 25;
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
    return notDone.length;
  }

  static checkIfAllDone() {
    const notDone = WorkerStatus.currentNotDone;

    if (!notDone.length) {
      console.log(" ");
      console.log("All workers done");
      WorkerStatus.programEnd();
    } else {
      console.log(
        "Currently active: " + notDone.map((not) => not.name).join(";")
      );
    }
  }

  static programEnd() {
    EventsList.printAllToJSON();
    console.log(" ");
    console.log("😎😎😎😎😎");
    console.log(" ");
    console.log("PROGRAM END");
    setTimeout(() => {
      process.exit();
    }, 10000);
  }
}
