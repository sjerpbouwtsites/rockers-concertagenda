import EventsList from "./events-list.js";
import path from "path";
export default class WorkerStatus {
  static _workers = {};

  static registerWorker(name) {
    WorkerStatus._workers[name] = {
      status: null,
      message: null,
    };
  }

  static change(name, status, message, worker) {
    WorkerStatus._workers[name].status = status;
    WorkerStatus._workers[name].message = message;

    if (status === "done") {
      console.log(`- ${name} done. Message: ${message}`.padStart(80, "✔️ "));
      WorkerStatus.checkIfAllDone();
    }

    if (status === "error") {
      console.error(`${name} ERROR.`.padStart(80, "💣 "));
      console.error(message);
    }

    if (status === "working") {
      console.log(`${name}: ${message}`);
    }

    if (status === "console") {
      console.log(`${name}`);
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
        return workerData.status !== "done";
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
    EventsList.printAllToJSON(path.normalize("./"));
    console.log(" ");
    console.log("😎😎😎😎😎");
    console.log(" ");
    console.log("PROGRAM END");
    setTimeout(() => {
      process.exit();
    }, 10000);
  }
}
