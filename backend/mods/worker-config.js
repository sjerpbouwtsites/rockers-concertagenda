import EventsList from "./events-list.js";
import { getShellArguments } from "./tools.js";
import fsDirections from "./fs-directions.js";

export const AbstractWorkerConfig = {
  
    CPUReq : 'normal',
    workerConcurrent : 2,
    index : null,
    path : null,
    name : null,
    family : null,
    workerCount : null,
    scraper : true   ,

  }


class WorkerListConf {
  data = []
  shellArguments = null
  static _self = null;
  constructor(){
    if (WorkerListConf._self instanceof WorkerListConf){
      return WorkerListConf._self;
    } else {
      this._self = this;
      this.shellArguments = getShellArguments();
      this.run();
    }
  }
  listCopy(){
    return [...this.data];
  }
  create (config){

    const forceArg = this.shellArguments?.force ?? "";
    const forced = forceArg.includes(config.family) || forceArg.includes("all");
    if (!EventsList.isOld(config.family, forced)) {
      return false;
    }

    const mergedConfig = {
      ...AbstractWorkerConfig,
      ...config
    }
    mergedConfig.path = fsDirections.scrapers[config.family];

    for (let i = 0; i < config.workerCount; i++){
      mergedConfig.index = i;
      mergedConfig.name = `${config.family}-${i}`;
      this.data.push({
        ...mergedConfig
      })
    }
  }
  get numberOfWorkers(){
    return this.data.length;
  }
  shuffleArray() {
    let currentIndex = this.numberOfWorkers, randomIndex;
    while (currentIndex != 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [this.data[currentIndex], this.data[randomIndex]] = [
        this.data[randomIndex], this.data[currentIndex]];
    }
    return this.data;
  }
  run(){
    // this.create({ family: "metalfan", workerCount: 1, CPUReq: "low" });
    // this.create({ family: "baroeg", workerCount: 8, workerConcurrent: 3 });
    // this.create({ family: "patronaat", workerCount: 3 });
    // this.create({ family: "013", workerCount: 4 });
    // this.create({ family: "effenaar", workerCount: 4 });
    // this.create({ family: "tivolivredenburg", workerCount: 4 });
    // this.create({ family: "doornroosje", workerCount: 3, workerConcurrent: 1 });
    // this.create({ family: "metropool", workerCount: 2 });
    // this.create({ family: "boerderij", workerCount: 1, CPUReq: "low" });
    // this.create({ family: "occii", workerCount: 2, workerConcurrent: 1 });
    // this.create({ family: "dynamo", workerCount: 2 });
    // this.create({
    //   family: "melkweg",
    //   workerCount: 3,
    //   CPUReq: "high",
    // });
    // this.create({ family: "bibelot", workerCount: 1 });
    // this.create({ family: "dbs", workerCount: 4, workerConcurrent: 1 });
    // this.create({ family: "gebrdenobel", workerCount: 1 });
    // this.create({ family: "neushoorn", workerCount: 1 });
    // this.create({
    //   family: "afaslive",
    //   workerCount: 2,
    //   CPUReq: "high",
    //   workerConcurrent: 1,
    // });
    this.create({ family: "iduna", workerCount: 1 });
    // this.create({family: 'kavka', workerCount: 1,workerConcurrent: 1, CPUReq: 'high' })
    // this.create({family: 'depul', workerCount: 3})
    // this.create({family: 'paradiso', workerCount: 4})
    // this.create({ family: "volt", workerCount: 1 });
    // this.create({family: 'duycker', workerCount: 1})
    this.shuffleArray();
  }
  get hasWorkerConfigs(){
    return this.numberOfWorkers > 0
  }
  firstOneLast(thisConfig){
    this.data.push(thisConfig)
  }
  get(){
    const next = this.data.shift();
    return next;
  }
  backIntoLine(completeConfig){
    this.data.push(completeConfig)
  }
};

export default function getWorkerConfig(){
  return new WorkerListConf();
}