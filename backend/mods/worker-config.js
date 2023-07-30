import EventsList from "./events-list.js";
import { getShellArguments } from "./tools.js";
import fsDirections from "./fs-directions.js";
import fs from 'fs';

export const AbstractWorkerConfig = {
  CPUReq: "normal",
  workerConcurrent: 2,
  index: null,
  path: null,
  name: null,
  family: null,
  workerCount: null,
  scraper: true, //TODO word dit gebruikt
};

export const workerConfig = {
  "013": { workerCount: 4, CPUReq: "low", workerConcurrent: 3, forceSet: 0 },
  afaslive: {
    workerCount: 1,
    CPUReq: "high",
    workerConcurrent: 1,
    forceSet: 0,
  },
  baroeg: { workerCount: 2, workerConcurrent: 2, forceSet: 0, },
  bibelot: { workerCount: 1, workerConcurrent: 1, forceSet: 1, },
  boerderij: { workerCount: 1, CPUReq: "low", workerConcurrent: 1, forceSet: 1, },
  cpunt: { workerCount: 1, workerConcurrent: 1, forceSet: 1, },
  dbs: { workerCount: 4, workerConcurrent: 4, CPUReq: "low", forceSet: 1, },
  deflux: { workerCount: 1, workerConcurrent: 1, forceSet: 2, },
  dehelling: { workerCount: 1, CPUReq: "low", workerConcurrent: 1, forceSet: 2 },
  depul: { workerCount: 2, workerConcurrent: 2, forceSet: 2, },
  doornroosje: { workerCount: 2, workerConcurrent: 1, CPUReq: "high", forceSet: 2, },
  dynamo: { workerCount: 2, workerConcurrent: 1, forceSet: 3,},
  effenaar: { workerCount: 4, workerConcurrent: 2, forceSet:3 },
  gebrdenobel: { workerCount: 1, workerConcurrent: 1, forceSet: 3, },
  groeneengel: { workerCount: 1, workerConcurrent: 1, forceSet: 3, },
  iduna: { workerCount: 1, workerConcurrent: 1, forceSet: 4, },
  kavka: {
    workerCount: 2,
    workerConcurrent: 2,
    forceSet: 4,
  },
  melkweg: {
    workerCount: 4,
    CPUReq: "low",
    workerConcurrent: 1,
    forceSet: 4,
  },
  metalfan: { workerCount: 1, CPUReq: "low", workerConcurrent: 1 },
  metropool: { workerCount: 3, workerConcurrent: 2, forceSet: 4, },
  neushoorn: { workerCount: 1, workerConcurrent: 1,forceSet: 5, },
  nieuwenor: { workerCount: 4, workerConcurrent: 2, forceSet: 5, },
  occii: {
    workerCount: 2,
    workerConcurrent: 1,forceSet: 5,
  },
  oosterpoort: { workerCount: 1, workerConcurrent: 1,forceSet: 5, },
  p60: { workerCount: 1, workerConcurrent: 1,forceSet: 5, },
  paradiso: { workerCount: 2, workerConcurrent: 2, CPUReq: "high", forceSet: 5, },
  patronaat: { workerCount: 2, workerConcurrent: 2, forceSet: 6, },
  tivolivredenburg: { workerCount: 4, workerConcurrent: 2, forceSet: 6, },
  ticketmaster: {
    workerCount: 2,
    workerConcurrent: 1,
    forceSet: 6,
  },
  volt: { workerCount: 1, workerConcurrent: 1, forceSet: 6, },
  willemeen: { workerCount: 2, workerConcurrent: 2, forceSet: 6, },
};

export const workerNames = Object.keys(workerConfig);

class WorkerListConf {
  data = [];
  shellArguments = null;
  static _self = null;
  curDay = (new Date()).toISOString().split('T')[0].replaceAll(/-/g,'')
  constructor() {
    if (WorkerListConf._self instanceof WorkerListConf) {
      return WorkerListConf._self;
    } else {
      this._self = this;
      this.shellArguments = getShellArguments();
      this.setBaseEventLists();
      this.run();
    }
  }
  setBaseEventLists(){
    this.baseEventlistsStart = fs.readdirSync(fsDirections.baseEventlists);
  }
  listCopy() {
    return [...this.data];
  }
  isForced() {}
  create(config) {
    // const forceArg = this.shellArguments?.force ?? "";
    // const forceSetNo = this.shellArguments?.forceset ? Number(this.shellArguments?.forceset) : null;
    // const forced = forceArg.includes(config.family) || forceArg.includes("all") || config.forceSet === forceSetNo;

    const mergedConfig = {
      ...AbstractWorkerConfig,
      ...config,
    };
    mergedConfig.path = fsDirections.scrapers[config.family];

    for (let i = 0; i < config.workerCount; i++) {
      mergedConfig.index = i;
      mergedConfig.name = `${config.family}-${i}`;
      this.data.push({
        ...mergedConfig,
      });
    }
  }
  get numberOfWorkers() {
    return this.data.length;
  }
  shuffleArray() {
    let currentIndex = this.numberOfWorkers,
      randomIndex;
    while (currentIndex != 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [this.data[currentIndex], this.data[randomIndex]] = [
        this.data[randomIndex],
        this.data[currentIndex],
      ];
    }
    return this.data;
  }
  workerNeedsWork(familyName){
    if (this.shellArguments?.force?.includes('all')) return true;
    if (this.shellArguments?.force?.includes(familyName)) return true;
    if (!this.baseEventlistsStart.join('').includes(familyName)) return true;
    const actueelGevonden = this.baseEventlistsStart.find(baseEventList =>{
      return baseEventList.includes(familyName) && baseEventList.includes(this.curDay)
    })
    if (!actueelGevonden) return true;
    return false;
  }
  run() {
    Object.entries(workerConfig).forEach(([familyName, values]) => {
      if (!this.workerNeedsWork(familyName)) return;
      this.create({ family: familyName, ...values });
    });

    this.shuffleArray();
  }
  get hasWorkerConfigs() {
    return this.numberOfWorkers > 0;
  }
  firstOneLast(thisConfig) {
    this.data.push(thisConfig);
  }
  get() {
    const next = this.data.shift();
    return next;
  }
  backIntoLine(completeConfig) {
    this.data.push(completeConfig);
  }
}

export default function getWorkerConfig() {
  return new WorkerListConf();
}
