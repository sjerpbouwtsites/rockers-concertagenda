# MONITOR voor rockagenda
TODO afchrijven
### Websocketed debugger / logger / error console voor backend / scrapers

statussen mogelijk: done error console todo

VAN WORKER NAAR MONITOR:

1.  in scrape-worker:

    ```js
    parentPort.postMessage({ status: "done" });
    // of
    parentPort.postMessage({ status: "todo", message: baseMusicEvents.length });
    // of
    function handleError(error, workerDataObj, remarks, errorLevel, toDebug) {
      parentPort.postMessage({
        status: "error",
        message: error,
      });
    }
    // of
    log(message, worker = null, workerName = null) {
      parentPort.postMessage({
        status: "console",
        message: message,
        workerName,
        worker,
      });
    }
    ```

2.  in index. Zodra de workers gestart zijn, wordt naar de message event geluisterd vanwege `addWorkerMessageHandler()`; De handler triggerd de WorkerStatus class zijn' change methode. Change a. slaat op de worker op wat de nieuwe status is b. geeft via zijn WorkerStatus.monitorWebsocketServer instance een broadcast af, afhankelijk van de status - een dubbelzinnig gebruikte property.
    Vanuit index wordt een message met het format van wsMessage verzonden, dat bij de _frontend_ van de monitor aankomt.

3.  in monitor/frontend
    TE SCRIJVEN
