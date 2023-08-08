import { parentPort, isMainThread } from 'worker_threads';
import fs from 'fs';
import fsDirections from './fs-directions.js';
import { WorkerMessage } from './rock-worker.js';
import passMessageToMonitor from '../monitor/pass-message-to-monitor.js';

export function wrappedHandleError(errorWrapperInst) {
  if (errorWrapperInst.isValid()) {
    handleError(
      errorWrapperInst?.error,
      errorWrapperInst?.workerData,
      errorWrapperInst?.remarks,
      errorWrapperInst?.errorLevel,
      errorWrapperInst?.toDebug,
    );
    return;
  }

  throw Error('geen wrapped error!!');
}

/**
 * handleError, generic error handling for the entire app
 * passes a marked up error to the monitor
 * adds error to the errorLog in temp.
 * @param {Error} error
 * @param {family,name,index} workerData
 * @param {string} remarks Add some remarks to help you find back the origin of the error.
 * @param {string} errorLevel notify, close-thread, close-app
 * @param {*} toDebug gaat naar debugger.
 */
export function handleError(error, workerData, remarks = null, errorLevel = 'notify', toDebug = null) {
  // TODO link errors aan debugger
  const updateErrorMsg = WorkerMessage.quick('update', 'error', {
    content: {
      workerData,
      remarks,
      status: 'error',
      errorLevel,
      text: `${error?.message}\n${error?.stack}\nlevel:${errorLevel}`,
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
  if (isMainThread) {
    passMessageToMonitor(updateErrorMsg, workerData.name);
    passMessageToMonitor(clientsLogMsg, workerData.name);
    toDebug && passMessageToMonitor(debuggerMsg, workerData.name);
  } else {
    parentPort.postMessage(updateErrorMsg);
    parentPort.postMessage(clientsLogMsg);
    toDebug && parentPort.postMessage(debuggerMsg);
  }
  const time = new Date();
  const curErrorLog = fs.readFileSync(fsDirections.errorLog) || '';
  const newErrorLog = `
  ${workerData?.name} Error - ${time.toLocaleTimeString()}
  ${error.stack} 
  ${error.message}
  
  ${curErrorLog}`;

  fs.writeFileSync(fsDirections.errorLog, newErrorLog, 'utf-8');
}

export function failurePromiseAfter(time) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject({
        status: 'failure',
        data: null,
      });
    }, time);
  });
}

export function getShellArguments() {
  const shellArguments = {};
  process.argv.forEach((val, index) => {
    if (index < 2) {
      return;
    }
    if (!val.includes('=')) {
      throw new Error(
        'Invalid shell arguments passed to node. Please use foo=bar bat=gee.',
      );
    }
    const [argName, argValue] = val.split('=');
    shellArguments[argName] = argValue;
  });

  // if (shellArguments.force && shellArguments.force.includes("all")) {
  //   shellArguments.force += Object.keys(
  //     JSON.parse(fs.readFileSync(fsDirections.timestampsJson))
  //   ).join(";");
  // }

  return shellArguments;
}

export async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      var timer = setInterval(() => {
        const { scrollHeight } = document.body;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 150);
    });
  });
}

export function errorAfterSeconds(time = 10000) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject(new Error(`REJECTED AFTER ${time}`));
    }, time);
  });
}

export function textContainsForbiddenMusicTerms(text) {
  return text.includes('pop')
  || text.includes('indierock')
  || text.includes('indiepop')
  || text.includes('shoegaze')
  || text.includes('swingende soul')
  || text.includes('indie-pop');
}

export function textContainsHeavyMusicTerms(text) {
  return text.includes('metal')
  || text.includes('punk')
  || text.includes('noise')
  || text.includes('doom')
  || text.includes('hardcore')
  || text.includes('ska')
  || text.includes('industrial');
}

const def = {
  handleError,
  errorAfterSeconds,
};

export default def;

export async function waitTime(wait = 500) {
  return new Promise((res) => {
    setTimeout(res, wait);
  });
}

export function killWhitespaceExcess(text = '') {
  return text.replace(/\t{2,100}/g, '').replace(/\n{2,100}/g, '\n').replace(/\s{2,100}/g, ' ').trim();
}
