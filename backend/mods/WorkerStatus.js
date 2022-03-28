import EventsList from "./events-list.js";
import path from "path";
export default class WorkerStatus {
  static _workers = {};

  static registerWorker(name) {
    WorkerStatus._workers[name] = {
      status: "working",
      message: null,
    };
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

  static checkIfAllDone() {
    const notDone = Object.entries(WorkerStatus._workers)
      .map(([workerName, workerData]) => {
        workerData.name = workerName;
        return workerData;
      })
      .filter((workerData) => {
        return !workerData.status.includes("done");
      });

    if (!notDone.length) {
      console.log(" ");
      console.log("All workers done");
      WorkerStatus.programEnd();
    } else {
      console.log("Waiting for: " + notDone.map((not) => not.name).join(";"));
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
