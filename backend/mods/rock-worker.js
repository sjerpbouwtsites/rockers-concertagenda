/* eslint-disable no-console */
import { Worker } from 'worker_threads';
import shell from './shell.js';
import WorkerStatus from "./WorkerStatus.js";

export default class RockWorker extends Worker {
  static monitorWebsocketServer;

  constructor(confObject) {
    super(confObject.path, {
      workerData: { ...confObject, shell },
    });
    this.name = confObject.name;
    this.family = confObject.family;
    this.index = confObject.index;
  }

  get workerName() {
    return `${this.family}-${this.index}`;
  }

  start() {
    this.postMessage(JSON.stringify({
      type: 'process',
      subtype: 'command-start',
    }));
  }

  /**
 * @param {Worker} thisWorker instantiated worker with path etc
 */
  static addWorkerMessageHandler(thisWorker, ArtistInst) {
    thisWorker.on('message', (message) => {
      if (!RockWorker.monitorWebsocketServer) {
        throw Error('monitor niet klaar!');
      }

      // DE EIGENLIJKE BOODSCHAP NAAR MONITOR
      let parsedMessage;
      try {
        parsedMessage = JSON.parse(message);
      } catch (error) {
        console.log('fout parsen message rockWorker on message');
        console.log(message);
        throw error;
      }

      // BOODSCHAPPEN VOOR DB
      // hier praat de worker/scraper, via zijn wrapper rock-worker.js
      // met de artist-db die in de statische functie als referentie binnenkwam

      // 1.scraper praat rock-worker hoort
      if (parsedMessage.type === 'db-request') {
        // 2. geeft door aan DB en DB geeft 
        // meteen antwoord want is geen async functie
        ArtistInst.do({
          request: parsedMessage?.subtype,
          data: parsedMessage.messageData,
        }).then((artistRes) => {
          let par;
          try {
            par = JSON.parse(artistRes);
          } catch (error) {
            console.log('db message fucked');
            console.log(parsedMessage);
            console.log(artistRes);
            throw error;
          }
          // 2.5 hier heb je een zooitje van gemaakt
          // 3. rock-worker wrapper praat terug naar worker-scraper
          // met antwoord van DB
          thisWorker.postMessage(JSON.stringify({
            type: 'db-answer',
            subtype: parsedMessage?.subtype,
            messageData: par,
          })); 
        }).catch((err) => {
          console.log(`artistInst.do error`);
          console.log(err);
        });
       
        return;
      }

      RockWorker.monitorWebsocketServer.broadcast(JSON.stringify(
        parsedMessage,
        null,
        2,
      ));
      
      // DIT MOET HELEMAAL NAAR WORKER STATUS.
      if (parsedMessage.type === 'process' && parsedMessage?.subtype === 'workers-status') {
        const statusString = parsedMessage?.messageData?.content?.status ?? null;
        WorkerStatus.change(thisWorker.workerName, statusString, parsedMessage.messageData);
      }
      if (parsedMessage.type === 'update' && parsedMessage?.subtype === 'scraper-results') {
        WorkerStatus.change(thisWorker.workerName, 'todo', parsedMessage?.messageData?.todo);
      }
      if (parsedMessage.type.includes('update') && parsedMessage.subtype.includes('error')) {
        WorkerStatus.processError(thisWorker.workerName, parsedMessage.messageData);
      }
    });
  }
}
