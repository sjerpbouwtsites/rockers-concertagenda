import WorkerStatus from "../mods/WorkerStatus.js";
import wsMessage from "./wsMessage.js";

/**
 * Indien 'worker' niet op eigen thread, 
 * maar op main thread, dan kan niet via postMessage 
 * via index/workerStatus naar monitor gepraat worden 
 * @param {wsMessage} message 
 * @param {string} workerName workerfamily-workerindex
 */
export default function passMessageToMonitor(message, workerName) {
  const parsedMessage = JSON.parse(message);

  if (!workerName) {
    console.log("\n", "passMessageToMonitor name check");
    console.log(message);
    throw new Error("message send by unspecified worker");
  }
  parsedMessage.messageData.workerName = workerName;
  // to check integrity
  const wsMsgInst = new wsMessage(
    parsedMessage?.type,
    parsedMessage?.subtype,
    parsedMessage?.messageData
  );
  if (wsMsgInst.type === "process") {
    if (wsMsgInst?.subtype === "workers-status") {
      const statusString = wsMsgInst?.messageData?.content?.status ?? null;
      WorkerStatus.change(workerName, statusString, wsMsgInst.messageData);
    }
  }
  if (wsMsgInst.type === "update") {
    if (wsMsgInst?.subtype === "scraper-results") {
      WorkerStatus.change(workerName, "todo", wsMsgInst?.messageData?.todo);
    }

    if (
      wsMsgInst.type.includes("update") &&
      wsMsgInst.subtype.includes("error") &&
      WorkerStatus.isRegisteredWorker(workerName)
    ) {
      WorkerStatus.processError(workerName, wsMsgInst.messageData);
    }

    // if (
    //   wsMsgInst.subtype.includes("message-roll") ||
    //   wsMsgInst.subtype.includes("debugger")
    // ) {
    // }
  }

  WorkerStatus.monitorWebsocketServer.broadcast(wsMsgInst.json);
}
