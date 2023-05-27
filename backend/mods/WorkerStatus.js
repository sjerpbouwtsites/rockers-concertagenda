import os from "os-utils";
import EventsList from "./events-list.js";
import wsMessage from "../monitor/wsMessage.js";
import { AbstractWorkerConfig } from "./worker-config.js";
import { getShellArguments } from "./tools.js";
import * as _t from "./tools.js"

export function AbstractWorkerData() {
  return {
    ...{
      ...AbstractWorkerConfig,
      status: null,
      todo: null,
      eventsRegistered: [],
      errors: [],
    },
  };
}

export default class WorkerStatus {
  static _workers = {};
  static CPUFree = 100;
  static shellArguments = getShellArguments();
  static maxSimultaneousWorkers = 7;

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
  static registerWorker(rockWorkerInstance) {
    const _w = WorkerStatus._workers[rockWorkerInstance.name];
    _w.status = "registered";
    _w.workerRef = rockWorkerInstance;
  }
  static getWorkerData(workerName) {
    return WorkerStatus._workers(workerName);
  }

  static registerAllWorkersAsWaiting(workerConfList) {
    workerConfList.forEach((workerConf) => {
      WorkerStatus._workers[workerConf.name] = {
        ...AbstractWorkerData(),
        ...workerConf,
        status: "waiting",
      };
    });
  }

  static workersWorkingOfFamily(family) {
    const a = Object.values(WorkerStatus._workers).filter((worker) => {
      return (
        !["done", "waiting"].includes(worker.status) && worker.family === family
      );
    }).length;
    return a;
  }

  static workersWorking() {
    return Object.values(WorkerStatus._workers).filter((worker) => {
      return !["done", "waiting"].includes(worker.status);
    }).length;
  }

  static isRegisteredWorker(workerName) {
    return (
      !!WorkerStatus._workers[workerName] &&
      !!(WorkerStatus._workers[workerName]?.status ?? null)
    );
  }

  static monitorCPUS() {
    setInterval(() => {
      os.cpuFree(function (v) {
        WorkerStatus.CPUFree = v * 100;
      });
    }, 50);
  }

  /**
   * monitorWebsocketServer
   */
  static get mwss() {
    if (!WorkerStatus.monitorWebsocketServer) {
      throw Error("websocket ontbreekt op WorkerStatus");
    }
    return WorkerStatus.monitorWebsocketServer;
  }

  static get OSHasSpace() {
    return WorkerStatus.CPUFree > 20;
  }

  static get OSHasALotOfSpace() {
    return WorkerStatus.CPUFree > 50;
  }

  // @TODO CREEER: tbv niet één familie meerdere tegelijk
  // static get currentWorkersOfThisFamily() {
  //   //
  // }

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

    const thisWorker = WorkerStatus._workers[name];
    if (statusses.includes("done")) {
      thisWorker.status = "done";
      thisWorker.todo = 0;
      WorkerStatus.completedWorkers = WorkerStatus.completedWorkers + 1;
    }

    if (statusses.includes("registered")) {
      thisWorker.status = "registered";
    }

    if (statusses.includes("working")) {
      thisWorker.status = "working";
    }

    if (statusses.includes("todo")) {
      thisWorker.todo = message.todo;
    }

    if (
      !statusses.includes("todo") &&
      (WorkerStatus?.shellArguments?.force?.includes(thisWorker.family) ?? null)
    ) {
      const forcedMessage = new wsMessage("update", "message-roll", {
        title: `Status update`,
        content: `${name} is nu ${status}`,
      });
      if (WorkerStatus.mwss) {
        WorkerStatus.mwss.broadcast(forcedMessage.json);
      }
    }
  }

  static async processError(name, message) {
    WorkerStatus._workers[name].errors.push(message);
    WorkerStatus.printWorkersToConsole()
    const content = message?.content ?? null;
    const errorLevel = content?.level ?? null;
    if (!content || !errorLevel) return;
    console.log(errorLevel, message?.text?.substring(0, 30) ?? '');
    if (errorLevel === 'close-app'){
      const serverStoptBoodschap = new wsMessage("update", "message-roll", {
        title: `SERVER STOPT`,
        content: `Terminale fout in ${name}`,
      });
      // TODO wordt niet goed opgepakt
      console.log(`%cSTOPPING SERVER\nbecause of ${name}`, 'color: red; background: yellow; font-weight: bold; font-size: 24px')
      const serverStoptProcess = new wsMessage("process", "closed", {
        content: `SERVER STOPT vanwege fout in ${name}`,
      });      
      if (WorkerStatus.mwss) {
        WorkerStatus.mwss.broadcast(serverStoptBoodschap.json);
        WorkerStatus.mwss.broadcast(serverStoptProcess.json);
      }     
      await _t.waitFor(25);
      process.exit()
    } else if (errorLevel === 'close-thread'){
      console.log(`%cSTOPPING THREAD\n of ${name}`, 'color: red; background: yellow; font-weight: bold; font-size: 18px')
      WorkerStatus.change(name, 'done', message)
      WorkerStatus.getWorkerData(name)?.workerRef?.terminate();
    } else {
      // is notice, verder afgehandeld.
    }
  }

  static get countedWorkersToDo() {
    return WorkerStatus.totalWorkers - WorkerStatus.completedWorkers;
  }

  static get currentNotDone() {
    const notDone = Object.entries(WorkerStatus._workers)
      .map(([, workerData]) => {
        return workerData;
      })
      .filter((workerData) => {
        return !workerData.status.includes("done");
      });
    return notDone;
  }

  static get currentDone() {
    const notDone = Object.entries(WorkerStatus._workers)
      .map(([, workerData]) => {
        return workerData;
      })
      .filter((workerData) => {
        return workerData.status.includes("done");
      });
    return notDone.length;
  }

  static checkIfAllDone() {
    const notDone = WorkerStatus.currentNotDone;
    if (notDone.length === 0) {
      WorkerStatus.programEnd();
      return true;
    }
    return false;
  }

  static reportOnActiveWorkers() {
    if (WorkerStatus.checkIfAllDone()) {
      clearInterval(WorkerStatus.reportingInterval);
    }
    const allWorkersStatussenMsg = new wsMessage(
      "app-overview",
      "all-workers",
      {
        workers: WorkerStatus._workers,
        CPUFree: WorkerStatus.CPUFree,
      }
    );
    if (WorkerStatus.mwss) {
      WorkerStatus.mwss.broadcast(allWorkersStatussenMsg.json);
    }
  }
  static programEnd() {
    console.log("All workers done");
    clearInterval(WorkerStatus.monitorCPUS);
    if (WorkerStatus.mwss) {
      const wsMsg2 = new wsMessage("process", "closed");
      WorkerStatus.mwss.broadcast(wsMsg2.json);
    }
    EventsList.printAllToJSON();
    setTimeout(() => {
      process.exit();
    }, 10000);
  }


  static printWorkersToConsole(){

    console.log('')
    const sorted = Object.entries(WorkerStatus._workers)
      .map(([,w])=>{
        return `${w.name} - ${w.status}`
      })
      .sort((eventA, eventB) => {
        if ( eventB > eventA) {
          return -1;
        } else if ( eventB < eventA) {
          return 1;
        } else {
          return 0;
        }    
      })
    
    const done = sorted.filter(w => w.includes('done'));
    const waiting = sorted.filter(w => w.includes('waiting'));
    const working = sorted.filter(w => w.includes('working'));
    const error = sorted.filter(w => w.includes('error'));
  
    console.log(`%cDONE WORKERS\r`, 'color: white; background: black; font-weight: bold; font-size: 18px')
    console.log(done.join(`\r`)) 
    console.log('')
    console.log(`%cWAITING WORKERS\r`, 'color: grey; background: black; font-weight: bold; font-size: 18px')
    console.log(waiting.join(`\r`)) 
    console.log('')
    console.log(`%cWORKING WORKERS\r`, 'color: gold; background: black; font-weight: bold; font-size: 18px')
    console.log(working.join(`\r`)) 
    console.log('')
    console.log(`%cERROR WORKERS\r`, 'color: red; background: black; font-weight: bold; font-size: 18px')
    console.log(error.join(`\r`))             
    console.log('')    
  }  
}

