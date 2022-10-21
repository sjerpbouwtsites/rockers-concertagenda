import os from "os-utils";
import EventsList from "./events-list.js";
import wsMessage from "../monitor/wsMessage.js";
import { parentPort } from "worker_threads";

export default class WorkerStatus {
  static _workers = {};
  static CPUFree = 100;
  static waitingWorkers = [];
  static totalWorkers = 0;
  static completedWorkers = 0;
  static monitorWebsocketServer = null;
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
    return WorkerStatus.currentNotDone.length < 5 && WorkerStatus.CPUFree > 50;
  }

  static change(name, status, message, worker) {
    WorkerStatus._workers[name].status = status;
    WorkerStatus._workers[name].message = message;

    const statusses = status.split(" ");

    if (statusses.includes("done")) {
      WorkerStatus.completedWorkers = WorkerStatus.completedWorkers + 1;
      if (WorkerStatus.monitorWebsocketServer) {
        const broadcastMsg = new wsMessage('update', 'message-roll', {
          workerName: name,
          text: `${name} done.`
        });
        WorkerStatus.monitorWebsocketServer.broadcast(broadcastMsg.json)
      }
      WorkerStatus.checkIfAllDone();
    }

    if (statusses.includes("error")) {
      if (WorkerStatus.monitorWebsocketServer) {
        const broadcastMsg = new wsMessage('update', 'scraper-error message-roll', {
          workerName: name,
          text: `Error in ${name}:
          ${message}`
        });
        WorkerStatus.monitorWebsocketServer.broadcast(broadcastMsg.json)
      }
    }

    if (statusses.includes("working")) {


      // TT!!! todu TODO

      console.log("");
      console.log(`${name}: ${message}`);
    }

    if (statusses.includes("console")) {
      if (WorkerStatus.monitorWebsocketServer) {
        const bullshit = new wsMessage('update', 'debugger', {
          workerName: name,
          worker: worker,
          text: message,
        })
        WorkerStatus.monitorWebsocketServer.broadcast(bullshit.json)
      } else {
        console.log("NOG NIET OPGESTART monitor websocket server")
      }
    }

    if (statusses.includes("todo")) {
      WorkerStatus._workers[name].todo = message;
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
      console.log("All workers done");
      WorkerStatus.programEnd();
      return true
    }
    return false;
  }

  static reportOnActiveWorkers() {
    const notDone = WorkerStatus.currentNotDone;
    const currentTodoMsg = notDone.map((notDoneWorker) => {
      const todoMSG = notDoneWorker.todo ? ` todo: ${notDoneWorker.todo}` : " init";
      return `${notDoneWorker.name}${todoMSG}`;
    }).join('; ');
    const consoleMessage = `Unfinished workers: ${WorkerStatus.countedWorkersToDo} 
    Active: ${currentTodoMsg}`;
    if (WorkerStatus.monitorWebsocketServer) {
      const wsMsg = new wsMessage('update', 'message-roll', { text: consoleMessage })
      WorkerStatus.monitorWebsocketServer.broadcast(wsMsg.json)
    }
    if (notDone.length > 0 || WorkerStatus.waitingWorkers.length !== 0) {
      setTimeout(() => {
        WorkerStatus.reportOnActiveWorkers();
      }, 2000);
    }
  }
  static programEnd() {
    if (WorkerStatus.monitorWebsocketServer) {
      const wsMsg2 = new wsMessage('process', 'closed')
      WorkerStatus.monitorWebsocketServer.broadcast(wsMsg2.json)
    }
    EventsList.printAllToJSON();
    setTimeout(() => {
      process.exit();
    }, 10000);
  }
}
