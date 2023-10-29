import { isMainThread, parentPort } from 'worker_threads';
import fs from 'fs';
import WorkerMessage from './worker-message.js';
import fsDirections from './fs-directions.js';
import passMessageToMonitor from '../monitor/pass-message-to-monitor.js';

async function writeToErrorFile(workerData, error) {
  const time = new Date();
  const curErrorLog = fs.readFileSync(fsDirections.errorLog) || '';
  const newErrorLog = `
  ${workerData?.name} Error - ${time.toLocaleTimeString()}
  ${error.stack} 
  ${error.message}
  
  ${curErrorLog}`;
  fs.writeFile(fsDirections.errorLog, newErrorLog, 'utf-8', null);
}

async function sendErrorMessagesAndDebug({
  updateErrorMsg,
  workerData,
  clientsLogMsg,
  toDebug,
  debuggerMsg,
}) {
  if (isMainThread) {
    passMessageToMonitor(updateErrorMsg, workerData.name);
    passMessageToMonitor(clientsLogMsg, workerData.name);
    if (toDebug) {
      passMessageToMonitor(debuggerMsg, workerData.name);
    }
  } else {
    parentPort.postMessage(updateErrorMsg);
    parentPort.postMessage(clientsLogMsg);
    if (toDebug) {
      parentPort.postMessage(debuggerMsg);
    }
  }
}

export default function newHandleError({ error, workerData, remarks, errorLevel, toDebug }) {
  const updateErrorMsg = WorkerMessage.quick('update', 'error', {
    content: {
      workerData,
      remarks,
      status: 'error',
      errorLevel,
      text: `level:${errorLevel}\n${error?.message}\n${error?.stack}`,
    },
  });
  const clientsLogMsg = WorkerMessage.quick('clients-log', 'error', {
    error,
    workerData,
  });
  let debuggerMsg;
  if (toDebug) {
    debuggerMsg = WorkerMessage.quick('update', 'debugger', {
      remarks,
      content: {
        workerData,
        debug: toDebug,
      },
    });
  }

  sendErrorMessagesAndDebug({
    updateErrorMsg,
    workerData,
    clientsLogMsg,
    toDebug,
    debuggerMsg,
  });
  writeToErrorFile(workerData, error);
}
