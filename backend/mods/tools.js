import { parentPort } from "worker_threads";
import fs from "fs";
import fsDirections from "./fs-directions.js";

export function handleError(error) {
  parentPort.postMessage({
    status: "error",
    message: error,
  });
  const time = new Date();
  const curErrorLog = fs.readFileSync(fsDirections.errorLog) || "";
  const newErrorLog = `
  Baroeg Error - ${error.name} - ${time.toLocaleTimeString()}
  ${error.stack} 
  ${error.message}
  
  ${curErrorLog}`;

  fs.writeFileSync(fsDirections.errorLog, newErrorLog, "utf-8");
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
    log("no testText");
    return getPriceFromHTML(contextText);
  }

  const priceMatch = testText.match(/((\d{1,3})[,.]+(\d\d|-))/);

  if (
    !priceMatch &&
    (testText.includes("gratis") || testText.includes("free"))
  ) {
    log("gratis");
    return 0;
  }

  if (priceMatch && priceMatch.length >= 4) {
    log(priceMatch[1]);
    const integers = Number(priceMatch[2]) * 100;
    let cents;
    if (!!priceMatch[3].includes("-")) {
      log("dutch short style");
      cents = 0;
    } else {
      log("normal price format");
      cents = Number(priceMatch[3]);
    }
    log(`integers: ${integers}`);
    log(`cents: ${cents}`);
    return (integers + cents) / 100;
  }

  if (contextText) {
    log("looking in contextText");
    const searchresultInBroaderContext = getPriceFromHTML(contextText);
    if (searchresultInBroaderContext) {
      log("context successfull found");
      return searchresultInBroaderContext;
    }
  }
  log("no price found.");
  log(testText);
  return null;
}

export function log(message) {
  parentPort.postMessage({
    status: "console",
    message: message,
  });
}

const def = {
  handleError,
  errorAfterSeconds,
};

export default def;
