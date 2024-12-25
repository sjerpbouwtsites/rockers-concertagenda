/* eslint-disable no-console */
import { exec } from "child_process";
import fs from "fs";
import os from "os-utils";
import wsMessage from "../monitor/wsMessage.js";
import fsDirections from "./fs-directions.js";
import { AbstractWorkerConfig, workerConfig } from "./worker-config.js";
import shell from "./shell.js";

export function AbstractWorkerData() {
    return {
        ...{
            ...AbstractWorkerConfig,
            status: null,
            todo: null,
            eventsRegistered: [],
            errors: []
        }
    };
}

export default class WorkerStatus {
    static _workers = {};

    static baseWorkerConfigs = workerConfig;

    static numberOfFamilies = Object.keys(workerConfig).length;

    static _familiesDoneWithBaseEvents = [];

    static CPUFree = 100;

    static _maxSimultaneousWorkers = 5;

    static get maxSimultaneousWorkers() {
        if (shell.workers) {
            return Number(shell.workers);
        }
        return WorkerStatus._maxSimultaneousWorkers;
    }

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

    debug = false;

    static registerFamilyDoneWithBaseEvents(family) {
        WorkerStatus._familiesDoneWithBaseEvents.push(family);
    }

    static familyDoneWithBaseEvents(family) {
        return WorkerStatus._familiesDoneWithBaseEvents.includes(family);
    }

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
                status: "waiting"
            };
        });
    }

    static workersWorkingOfFamily(family) {
        const a = Object.values(WorkerStatus._workers).filter(
            (worker) =>
                !["done", "waiting"].includes(worker.status) &&
                worker.family === family
        ).length;
        return a;
    }

    static workersWorking() {
        return Object.values(WorkerStatus._workers).filter(
            (worker) => !["done", "waiting"].includes(worker.status)
        ).length;
    }

    static isRegisteredWorker(workerName) {
        return (
            !!WorkerStatus._workers[workerName] &&
            !!(WorkerStatus._workers[workerName]?.status ?? null)
        );
    }

    static monitorCPUS() {
        setInterval(() => {
            os.cpuFree((v) => {
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

    static get OSHasMinimalSpace() {
        return WorkerStatus.CPUFree > 35;
    }

    static get OSHasSpace() {
        return WorkerStatus.CPUFree > 50;
    }

    static get OSHasALotOfSpace() {
        return WorkerStatus.CPUFree > 66;
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
        const statusses = status?.split(" ") ?? "";

        const thisWorker = WorkerStatus._workers[name];
        if (statusses.includes("done")) {
            thisWorker.status = "done";
            thisWorker.todo = 0;
            // console.group('worker status change');
            // console.log(thisWorker);
            // console.log(typeof thisWorker);
            // console.groupEnd();
            thisWorker.workerRef.end();

            WorkerStatus.completedWorkers += 1;
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

        const wf = shell.force && shell.force.includes(thisWorker.family);

        if (!statusses.includes("todo") && wf) {
            const forcedMessage = new wsMessage("update", "message-roll", {
                title: "Status update",
                content: `${name} is nu ${status}`
            });
            if (WorkerStatus.mwss) {
                WorkerStatus.mwss.broadcast(forcedMessage.json);
            }
        }
    }

    static async processError(name, message) {
        if (!WorkerStatus.isRegisteredWorker(name)) {
            console.log(message);
            throw new Error(`Error binnengekomen van onbekende worker ${name}`);
        }

        WorkerStatus._workers[name].errors.push(message);
        if (this.debug) {
            WorkerStatus.printWorkersToConsole();
        }
        const content = message?.content ?? null;
        const errorLevel = content?.level ?? null;
        if (!content || !errorLevel) return;
        console.log(errorLevel, message?.text?.substring(0, 30) ?? "");
        if (errorLevel === "close-app") {
            const serverStoptBoodschap = new wsMessage(
                "update",
                "message-roll",
                {
                    title: "SERVER STOPT",
                    content: `Terminale fout in ${name}`
                }
            );
            // TODO wordt niet goed opgepakt
            console.log(
                `%cSTOPPING SERVER\nbecause of ${name}`,
                "color: red; background: yellow; font-weight: bold; font-size: 24px"
            );
            const serverStoptProcess = new wsMessage("process", "closed", {
                content: `SERVER STOPT vanwege fout in ${name}`
            });
            if (WorkerStatus.mwss) {
                WorkerStatus.mwss.broadcast(serverStoptBoodschap.json);
                WorkerStatus.mwss.broadcast(serverStoptProcess.json);
            }
            setTimeout(() => {
                process.exit();
            }, 25);
        } else if (errorLevel === "close-thread") {
            console.log(
                `%cSTOPPING THREAD\n of ${name}`,
                "color: red; background: yellow; font-weight: bold; font-size: 18px"
            );
            WorkerStatus.change(name, "done", message);
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
            .map(([, workerData]) => workerData)
            .filter((workerData) => !workerData.status.includes("done"));
        return notDone;
    }

    static get currentDone() {
        const notDone = Object.entries(WorkerStatus._workers)
            .map(([, workerData]) => workerData)
            .filter((workerData) => workerData.status.includes("done"));
        return notDone.length;
    }

    static checkIfAllDone() {
        const notDone = WorkerStatus.currentNotDone;
        if (notDone.length === 0) {
            // TODO hier zou ergens iets gemeten moeten worden oid.
            setTimeout(() => {
                WorkerStatus.ArtistInst.persistNewRefusedAndRockArtists();
            }, 1000);
            setTimeout(() => {
                WorkerStatus.programEnd();
            }, 9000);
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
                CPUFree: WorkerStatus.CPUFree
            }
        );
        if (WorkerStatus.mwss) {
            WorkerStatus.mwss.broadcast(allWorkersStatussenMsg.json);
        }
    }

    static programEnd() {
        if (this.debug) {
            WorkerStatus.printWorkersToConsole();
        }
        console.log("All workers done");
        clearInterval(WorkerStatus.monitorCPUS);
        if (WorkerStatus.mwss) {
            const wsMsg2 = new wsMessage("process", "closed");
            WorkerStatus.mwss.broadcast(wsMsg2.json);
        }
        WorkerStatus.printAllToJSON();

        if (shell.debugLongHTML && shell.force) {
            console.log("debug long HTML");
            setTimeout(() => {
                shell.forceThese.forEach((forced) => {
                    fs.readdirSync(`../public/texts/${forced}`).forEach(
                        (forcedFile) => {
                            exec(
                                `prettier --config .prettierrc ../public/texts/${forced}/${forcedFile} --write; code ../public/texts/${forced}/${forcedFile}`
                            );
                        }
                    );
                });
            }, 1000);
            setTimeout(() => {
                process.exit();
            }, 5000);
        } else {
            setTimeout(() => {
                process.exit();
            }, 1000);
        }
    }

    static async printAllToJSON() {
        //    await waitABit();

        const pathToEventList = fsDirections.eventLists;
        const consolidatedLocations = {};
        const nowDateString = new Date();
        const nowDate = Number(
            nowDateString.toISOString().substring(0, 10).replace(/-/g, "")
        );
        const allEventListFiles = [];
        Object.entries(workerConfig).forEach(
            ([familyName, { workerCount }]) => {
                for (let i = 0; i < workerCount; i += 1) {
                    const pad = `${pathToEventList}/${familyName}/${i}.json`;
                    if (fs.existsSync(pad)) {
                        allEventListFiles.push(pad);
                    }
                }
            }
        );

        let consolidatedEvents = allEventListFiles
            .map((eventListFile) => {
                try {
                    const parsedEventFile = JSON.parse(
                        fs.readFileSync(eventListFile)
                    );
                    return parsedEventFile;
                } catch (error) {
                    console.log(`json parse error ${eventListFile}`);
                    console.log(error);
                    return [];
                }
            })
            .flat()
            .filter((event) => {
                const musicEventTime = Number(
                    event.start.substring(0, 10).replace(/-/g, "")
                );
                return musicEventTime >= nowDate;
            })
            .sort((eventA, eventB) => {
                let dataA;
                try {
                    dataA = Number(
                        eventA.start.substring(0, 10).replace(/-/g, "")
                    );
                } catch (error) {
                    dataA = 20501231;
                }
                let dataB;
                try {
                    dataB = Number(
                        eventB.start.substring(0, 10).replace(/-/g, "")
                    );
                } catch (error) {
                    dataB = 20501231;
                }

                if (dataA > dataB) {
                    return -1;
                }
                if (dataA < dataB) {
                    return 1;
                }
                return 0;
            });

        consolidatedEvents = consolidatedEvents.reverse();

        consolidatedEvents.forEach((eventUitLijst) => {
            const loc = eventUitLijst.location;
            if (!consolidatedLocations[loc]) {
                consolidatedLocations[loc] = {};
                consolidatedLocations[loc].name = loc;
                consolidatedLocations[loc].count = 0;
            }
            consolidatedLocations[loc].count += 1;
        });

        console.group("worker status double events");
        console.log("FUCKING HACK");
        console.groupEnd();
        const noDoubleEvents = consolidatedEvents
            .map((ev, index) => {
                if (index === 0) return ev;
                const laatste = consolidatedEvents[index - 1];
                const laatsteNaamDatum = laatste.title + laatste.start;
                const dezeNaamDatum = ev.title + ev.start;
                if (laatsteNaamDatum === dezeNaamDatum) return false;
                return ev;
            })
            .filter((a) => a);

        fs.writeFileSync(
            fsDirections.eventsListJson,
            JSON.stringify(noDoubleEvents, null, "  "),
            "utf-8"
        );
        // passMessageToMonitor(qwm.toConsole(consolidatedEvents), workerSignature);
        console.log(`saved ${noDoubleEvents.length} events`);

        fs.copyFileSync(
            fsDirections.eventsListJson,
            fsDirections.eventsListPublicJson
        );
    }

    static printWorkersToConsole() {
        console.log("");
        const sorted = Object.entries(WorkerStatus._workers)
            .map(([, w]) => `${w.name} - ${w.status}`)
            .sort((eventA, eventB) => {
                if (eventB > eventA) {
                    return -1;
                }
                if (eventB < eventA) {
                    return 1;
                }
                return 0;
            });

        const done = sorted.filter((w) => w.includes("done"));
        const waiting = sorted.filter((w) => w.includes("waiting"));
        const working = sorted.filter((w) => w.includes("working"));
        const error = sorted.filter((w) => w.includes("error"));

        console.log(
            "%cDONE WORKERS\r",
            "color: white; background: black; font-weight: bold; font-size: 18px"
        );
        console.log(done.join("\r"));
        console.log("");
        console.log(
            "%cWAITING WORKERS\r",
            "color: grey; background: black; font-weight: bold; font-size: 18px"
        );
        console.log(waiting.join("\r"));
        console.log("");
        console.log(
            "%cWORKING WORKERS\r",
            "color: gold; background: black; font-weight: bold; font-size: 18px"
        );
        console.log(working.join("\r"));
        console.log("");
        console.log(
            "%cERROR WORKERS\r",
            "color: red; background: black; font-weight: bold; font-size: 18px"
        );
        console.log(error.join("\r"));
        console.log("");
    }
}
