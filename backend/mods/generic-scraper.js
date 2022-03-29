import { parentPort } from "worker_threads";

export function letScraperListenToMasterMessageAndInit(init) {
  parentPort.on("message", (messageData) => {
    if (messageData.command && messageData.command === "start") {
      try {
        init(messageData.data.page);
      } catch (error) {
        parentPort.postMessage({
          status: "error",
          message: error,
        });
      }
    }
  });
}

export default {};
