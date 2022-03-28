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

const def = {
  handleError,
  errorAfterSeconds,
};

export default def;
