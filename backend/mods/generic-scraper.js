import { parentPort } from "worker_threads";
/**
 * @param  {Function} init Functie die scraper 'aanzet'. Word gedraaid op message type=process & subtype = 'command-start'
 */
export function letScraperListenToMasterMessageAndInit(init) {
  parentPort.on("message", (message) => {

    const pm = JSON.parse(message);

    if (pm?.type === 'process' && pm?.subtype === "command-start") {
      try {
        init(pm?.messageData);
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
