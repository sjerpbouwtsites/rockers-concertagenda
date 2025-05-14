// import * as dotenv from 'dotenv';
import fs from "fs";
import WorkerStatus from "./mods/WorkerStatus.js";
import { printLocationsToPublic } from "./mods/locations.js";
import initMonitorBackend from "./monitor/backend.js";
import RockWorker from "./mods/rock-worker.js";
import getWorkerConfig from "./mods/worker-config.js";
import HouseKeeping from "./housekeeping.js";
import Artists from "./artist-db/models/artists.js";
import fsDirections from "./mods/fs-directions.js";
import doeOnderhoudAanArtistDB from "./artist-db/models/onderhoud.js";

const ArtistInst = new Artists({
    modelPath: fsDirections.artistDBModels,
    storePath: fsDirections.artistDBstore
});

// dotenv.config();

let monitorWebsocketServer = null;

async function waitTime(wait = 500) {
    return new Promise((res) => {
        setTimeout(res, wait);
    });
}

async function startWorker(workerConfig) {
    if (!workerConfig.hasWorkerConfigs) {
        return true;
    }

    const toManyWorkersWorking =
        WorkerStatus.workersWorking() >= WorkerStatus.maxSimultaneousWorkers;
    if (toManyWorkersWorking) {
        await waitTime(200);
        return startWorker(workerConfig);
    }

    const thisConfig = workerConfig.get();
    const workingThisFamily = WorkerStatus.workersWorkingOfFamily(
        thisConfig.family
    );
    // als er veel ruimte is, voorkeur voor hoog cpu
    if (
        WorkerStatus.OSHasALotOfSpace &&
        thisConfig.CPUReq !== "high" &&
        workerConfig.highCpuWorkerExists
    ) {
        // console.log('find high user');
        workerConfig.takeBackRejected(thisConfig);
        return startWorker(workerConfig);
    }

    // of er momenteel nog een base event list gemaakt word
    // if (
    //     !WorkerStatus.familyDoneWithBaseEvents(thisConfig.family) &&
    //     workingThisFamily
    // ) {
    //     // console.log('base event needs to be finished solo');
    //     workerConfig.takeBackRejected(thisConfig);
    //     await waitTime(5);
    //     return startWorker(workerConfig);
    // }

    // of nog niet alle families al werken
    // if (
    //     workingThisFamily > 0 &&
    //     WorkerStatus.familyDoneWithBaseEvents.length !==
    //         WorkerStatus.numberOfFamilies
    // ) {
    //     //  console.log('nog niet allen werken reeds');
    //     workerConfig.takeBackRejected(thisConfig);
    //     await waitTime(5);
    //     return startWorker(workerConfig);
    // }

    // als er niet veel OS ruimte is maar deze veel nodig heeft
    if (!WorkerStatus.OSHasALotOfSpace && thisConfig.CPUReq === "high") {
        // console.log('niet genoeg ruimte voor HIGH cpu');
        workerConfig.takeBackRejected(thisConfig);
        await waitTime(5);
        return startWorker(workerConfig);
    }

    // als er al teveel van deze familie werken

    if (thisConfig.workerConcurrent <= workingThisFamily) {
        // console.log('te veel van deze family concurrent');
        workerConfig.takeBackRejected(thisConfig);
        await waitTime(5);
        return startWorker(workerConfig);
    }

    // als er uberhaupt geen ruimte is
    if (!WorkerStatus.OSHasSpace) {
        // alleen zuinigen door
        if (!WorkerStatus.OSHasMinimalSpace && thisConfig.CPUReq === "low") {
            //  console.log('zelfs geen ruimte voor kleine');
            workerConfig.takeBackRejected(thisConfig);
            await waitTime(5);
            return startWorker(workerConfig);
        }
        //  console.log('geen ruimte');
        workerConfig.takeBackRejected(thisConfig);
        await waitTime(5);
        return startWorker(workerConfig);
    }

    const thisWorker = new RockWorker(thisConfig);

    RockWorker.addWorkerMessageHandler(thisWorker, ArtistInst);
    WorkerStatus.registerWorker(thisWorker);
    thisWorker.start();
    return startWorker(workerConfig);
}

async function recursiveStartWorkers(workerConfig) {
    if (!workerConfig.hasWorkerConfigs) {
        // console.log('workers op');

        return true;
    }
    await waitTime(10);
    return startWorker(workerConfig);
}

async function checkSinglePageCacheExistsRecursive(familyNames) {
    const fCopy = [...familyNames];
    const checkFor = fCopy.shift();

    // check if cache folder exists
    if (!fs.existsSync(`${fsDirections.singlePagesCache}/${checkFor}`)) {
        fs.mkdirSync(`${fsDirections.singlePagesCache}/${checkFor}`);
    }
    if (fCopy.length) return checkSinglePageCacheExistsRecursive(fCopy);
    return true;
}

async function init() {
    new HouseKeeping().init();
    printLocationsToPublic();

    const workerConfig = getWorkerConfig();
    await checkSinglePageCacheExistsRecursive(workerConfig.familyNames);

    monitorWebsocketServer = await initMonitorBackend();
    RockWorker.monitorWebsocketServer = monitorWebsocketServer;
    WorkerStatus.monitorWebsocketServer = monitorWebsocketServer; // TODO WEG
    WorkerStatus.ArtistInst = ArtistInst;

    WorkerStatus.monitorCPUS();
    WorkerStatus.totalWorkers = workerConfig.numberOfWorkers;
    WorkerStatus.registerAllWorkersAsWaiting(workerConfig.listCopy());
    recursiveStartWorkers(workerConfig);
    WorkerStatus.initializeReporting();
    doeOnderhoudAanArtistDB(fsDirections);
}

init();
