import fs from "fs";
import fsDirections from "./fs-directions.js";

export const AbstractWorkerConfig = {
    CPUReq: "normal",
    workerConcurrent: 2,
    index: null,
    path: null,
    name: null,
    family: null,
    workerCount: null
};

export const workerConfig = {
    // "013": {
    //     workerCount: 3,
    //     CPUReq: "low",
    //     workerConcurrent: 1,
    //     forceSet: 0
    // },
    // afaslive: {
    //     workerCount: 1,
    //     workerConcurrent: 2,
    //     forceSet: 0,
    //     CPUReq: "high"
    // }
    //baroeg: { workerCount: 1, workerConcurrent: 2, forceSet: 0 }
    //bibelot: { workerCount: 1, workerConcurrent: 1, forceSet: 1 }
    cpunt: { workerCount: 1, workerConcurrent: 1, forceSet: 1 }
    // dbs: {
    //     workerCount: 3,
    //     workerConcurrent: 3,
    //     CPUReq: "high",
    //     forceSet: 1
    // },
    // dehelling: {
    //     workerCount: 1,
    //     workerConcurrent: 1,
    //     forceSet: 2
    // },
    // doornroosje: {
    //     workerCount: 1,
    //     workerConcurrent: 1,
    //     CPUReq: "high",
    //     forceSet: 2
    // },
    // effenaar: {
    //     workerCount: 3,
    //     CPUReq: "high",
    //     workerConcurrent: 2,
    //     forceSet: 3
    // },
    // gebouwt: {
    //     workerCount: 1,
    //     workerConcurrent: 1,
    //     CPUReq: "high",
    //     forceSet: 3
    // },
    // gebrdenobel: {
    //     workerCount: 1,
    //     workerConcurrent: 1,
    //     CPUReq: "high",
    //     forceSet: 3
    // },
    // dynamo: { workerCount: 2, workerConcurrent: 1, forceSet: 3 },
    // groeneengel: { workerCount: 1, workerConcurrent: 1, forceSet: 3 },
    // iduna: { workerCount: 1, workerConcurrent: 1, forceSet: 4 },
    // kavka: {
    //     workerCount: 1,
    //     workerConcurrent: 2,
    //     forceSet: 4,
    //     CPUReq: "high"
    // },
    // littledevil: {
    //     workerCount: 1,
    //     workerConcurrent: 2,
    //     forceSet: 4
    // },
    // melkweg: {
    //     workerCount: 2,
    //     CPUReq: "high",
    //     workerConcurrent: 1,
    //     forceSet: 4
    // },
    // metalfan: { workerCount: 1, CPUReq: "low", workerConcurrent: 1 },
    // metropool: {
    //     workerCount: 2,
    //     workerConcurrent: 1,
    //     CPUReq: "high",
    //     forceSet: 4
    // },
    // neushoorn: { workerCount: 2, workerConcurrent: 1, forceSet: 5 },
    // nieuwenor: { workerCount: 1, workerConcurrent: 2, forceSet: 5 },
    // occii: {
    //     workerCount: 1,
    //     workerConcurrent: 1,
    //     forceSet: 5
    // },
    // oosterpoort: { workerCount: 1, workerConcurrent: 1, forceSet: 5 },
    // p60: { workerCount: 1, workerConcurrent: 1, forceSet: 5 },
    // patronaat: {
    //     workerCount: 2,
    //     workerConcurrent: 1,
    //     forceSet: 6,
    //     CPUReq: "high"
    // },
    // paradiso: {
    //     workerCount: 2,
    //     workerConcurrent: 2,
    //     forceSet: 5,
    //     CPUReq: "high"
    // },
    // tivolivredenburg: {
    //     workerCount: 1,
    //     workerConcurrent: 1,
    //     forceSet: 6,
    //     CPUReq: "low"
    // },
    // victorie: { workerCount: 1, workerConcurrent: 2, forceSet: 6 },
    // volt: { workerCount: 1, workerConcurrent: 1, forceSet: 6 },
    // willemeen: { workerCount: 2, workerConcurrent: 2, forceSet: 6 }
};

// deflux: { workerCount: 1, workerConcurrent: 1, forceSet: 2 },
// boerderij: {
//   workerCount: 1,
//   workerConcurrent: 1,
//   forceSet: 1,
// },
// ticketmaster: {
//   workerCount: 2,
//   workerConcurrent: 1,
//   forceSet: 6,
// },

export const workerNames = Object.keys(workerConfig);

class WorkerListConf {
    data = [];

    familyNames = Object.keys(workerConfig);

    static _self = null;

    curDay = new Date().toISOString().split("T")[0].replaceAll(/-/g, "");

    constructor() {
        if (WorkerListConf._self instanceof WorkerListConf) {
            return WorkerListConf._self;
        }
        this._self = this;
        this.setBaseEventLists();
        this.run();
    }

    get highCpuWorkerExists() {
        return this.data.find((conf) => conf.CPUReq === "high");
    }

    setBaseEventLists() {
        this.baseEventlistsStart = fs.readdirSync(fsDirections.baseEventlists);
    }

    listCopy() {
        return [...this.data];
    }

    create(config) {
        // const forceArg = this.shellArguments?.force ?? "";
        // const forceSetNo = this.shellArguments?.forceset ? Number(this.shellArguments?.forceset) : null;
        // const forced = forceArg.includes(config.family) || forceArg.includes("all") || config.forceSet === forceSetNo;

        const mergedConfig = {
            ...AbstractWorkerConfig,
            ...config
        };
        mergedConfig.path = fsDirections.scrapers[config.family];

        for (let i = 0; i < config.workerCount; i++) {
            mergedConfig.index = i;
            mergedConfig.name = `${config.family}-${i}`;
            this.data.push({
                ...mergedConfig
            });
        }
    }

    get numberOfWorkers() {
        return this.data.length;
    }

    shuffleArray() {
        let currentIndex = this.numberOfWorkers;
        let randomIndex;
        while (currentIndex != 0) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
            [this.data[currentIndex], this.data[randomIndex]] = [
                this.data[randomIndex],
                this.data[currentIndex]
            ];
        }
        return this.data;
    }

    workerNeedsWork(familyName) {
        if (!this.baseEventlistsStart.join("").includes(familyName))
            return true;
        const actueelGevonden = this.baseEventlistsStart.find(
            (baseEventList) =>
                baseEventList.includes(familyName) &&
                baseEventList.includes(this.curDay)
        );
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

    takeBackRejected(reject) {
        this.data.push(reject);
    }

    backIntoLine(completeConfig) {
        this.data.push(completeConfig);
    }
}

export default function getWorkerConfig() {
    return new WorkerListConf();
}
