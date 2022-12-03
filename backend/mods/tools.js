import { parentPort, isMainThread } from "worker_threads";
import fs from "fs";
import fsDirections from "./fs-directions.js";
import crypto from "crypto";
import { WorkerMessage } from "./rock-worker.js";
import passMessageToMonitor from "../monitor/pass-message-to-monitor.js";
/**
 * handleError, generic error handling for the entire app
 * passes a marked up error to the monitor
 * adds error to the errorLog in temp.
 * @param {Error} error
 * @param {family,name,index} workerData
 * @param {string} remarks Add some remarks to help you find back the origin of the error.
 */
export function handleError(error, workerData, remarks = null) {
  const updateErrorMsg = WorkerMessage.quick("update", "error", {
    content: {
      workerData: workerData,
      remarks: remarks,
      status: "error",
      text: `${error.message}\n${error.stack}`,
    },
  });
  const clientsLogMsg = WorkerMessage.quick("clients-log", "error", {
    error,
    workerData,
  });
  if (isMainThread) {
    passMessageToMonitor(updateErrorMsg, workerData.name);
    passMessageToMonitor(clientsLogMsg, workerData.name);
  } else if (workerData?.scraper) {
    parentPort.postMessage(updateErrorMsg);
    parentPort.postMessage(clientsLogMsg);
  } else {
    console.log(`ODD ERROR HANDLING. neither on main thread nor in scraper.`);
    console.log(error, workerData, remarks);
    console.log("");
  }
  const time = new Date();
  const curErrorLog = fs.readFileSync(fsDirections.errorLog) || "";
  const newErrorLog = `
  ${workerData?.name} Error - ${time.toLocaleTimeString()}
  ${error.stack} 
  ${error.message}
  
  ${curErrorLog}`;

  fs.writeFileSync(fsDirections.errorLog, newErrorLog, "utf-8");
}

export function failurePromiseAfter(time) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject({
        status: "failure",
        data: null,
      });
    }, time);
  });
}

export function getShellArguments() {
  const shellArguments = {};
  process.argv.forEach(function (val, index) {
    if (index < 2) {
      return;
    }
    if (!val.includes("=")) {
      throw new Error(
        `Invalid shell arguments passed to node. Please use foo=bar bat=gee.`
      );
    }
    const [argName, argValue] = val.split("=");
    shellArguments[argName] = argValue;
  });

  if (shellArguments.force && shellArguments.force.includes("all")) {
    shellArguments.force += Object.keys(
      JSON.parse(fs.readFileSync(fsDirections.timestampsJson))
    ).join(";");
  }

  return shellArguments;
}

export async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      var totalHeight = 0;
      var distance = 500;
      var timer = setInterval(() => {
        var scrollHeight = document.body.scrollHeight;
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
      reject(new Error("REJECTED AFTER " + time));
    }, time);
  });
}

export function getPriceFromHTML(testText = null, contextText = null) {
  if (!testText) {
    return getPriceFromHTML(contextText);
  }

  const priceMatch = testText.match(/((\d{1,3})[,.]+(\d\d|-))/);

  if (
    !priceMatch &&
    (testText.includes("gratis") || testText.includes("free"))
  ) {
    return 0;
  }

  if (priceMatch && priceMatch.length >= 4) {
    const integers = Number(priceMatch[2]) * 100;
    let cents;
    if (priceMatch[3].includes("-")) {
      cents = 0;
    } else {
      cents = Number(priceMatch[3]);
    }

    return (integers + cents) / 100;
  }

  const onlyIntegers = testText.match(/\d{1,3}/);
  if (onlyIntegers && onlyIntegers.length) {
    return onlyIntegers[0];
  }

  if (contextText) {
    const searchresultInBroaderContext = getPriceFromHTML(contextText);
    if (searchresultInBroaderContext) {
      return searchresultInBroaderContext;
    }
  }

  return null;
}
export function basicMusicEventsFilter(musicEvent) {
  if (!musicEvent.venueEventUrl) {
    return false;
  }

  const t = musicEvent?.title ?? "";
  const st = musicEvent?.shortText ?? "";
  const searchShowNotOnDate = `${t.toLowerCase()} ${st.toLowerCase()}`;

  const mayNotContainTrue = [
    "uitgesteld",
    "sold out",
    "gecanceld",
    "uitverkocht",
    "afgelast",
    "geannuleerd",
    "verplaatst",
  ].map((forbiddenTerm) => {
    return searchShowNotOnDate.includes(forbiddenTerm);
  });

  return !mayNotContainTrue.includes(true);
}

export function postPageInfoProcessing(pageInfo = null) {
  const pageInfoCopy = { ...pageInfo };
  if (!pageInfo) return {};

  if (pageInfo.priceTextcontent || pageInfo.priceContexttext) {
    const context = pageInfo?.priceContexttext ?? null;
    pageInfoCopy.price = getPriceFromHTML(pageInfo.priceTextcontent, context);
  }

  pageInfoCopy.longText = saveLongTextHTML(pageInfo);
  return pageInfoCopy;
}

export function saveLongTextHTML(pageInfo) {
  if (
    !Object.prototype.hasOwnProperty.call(pageInfo, "longTextHTML") ||
    !pageInfo.longTextHTML
  ) {
    return null;
  }
  let uuid = crypto.randomUUID();
  const longTextPath = `${fsDirections.publicTexts}/${uuid}.html`;

  fs.writeFile(longTextPath, pageInfo.longTextHTML, "utf-8", () => {});
  return longTextPath;
}

const def = {
  handleError,
  errorAfterSeconds,
};

export default def;

export async function waitFor(wait = 500) {
  return new Promise((res) => {
    setTimeout(res, wait);
  });
}
