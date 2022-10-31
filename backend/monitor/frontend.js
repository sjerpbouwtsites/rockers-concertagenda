import wsMessage from './wsMessage.js';
import MonitorField from './monitor-field.js';

function createFields() {
  const updateField = new MonitorField(
    "Updates",
    "update-field-target",
    "roll"
  );
  updateField.initialize();
  const errorField = new MonitorField("Fouten", "error-field-target", "roll");
  errorField.initialize();
  const debuggerField = new MonitorField(
    "Debugger",
    "debugger-field-target",
    "expanded"
  );
  debuggerField.initialize();
  const appOverviewField = new MonitorField(
    "AppOverview",
    "app-overview-field-target",
    "table"
  );

  appOverviewField.initialize();
  return { updateField, errorField, debuggerField, appOverviewField };
}

function openClientWebsocket(fields) {
  const socket = new WebSocket("ws://localhost:8002");

  socket.addEventListener("open", () => {
    const msg = new wsMessage("server-log", null, "Hallo server!");
    socket.send(msg.json);
  });

  socket.addEventListener("close", () => {
    const msg = new wsMessage("update", "terminal-error message-roll", {
      title: "De server zelf",
      text: "De server lijkt afgesloten te zijn.",
    });
    eventToUpdates(msg, fields);
  });

  socket.addEventListener("message", (event) => {
    const eventMsg = JSON.parse(event.data);
    console.log(eventMsg.type, eventMsg.subtype);

    if (eventMsg.type === "server-log") {
      monitorInternalErrors(`Er is een event naar de client verstuurd bedoelt voor de server.
      ${eventMsg.messageData} `);
    } else if (eventMsg.type === "clients-log") {
      eventToClientsLog(eventMsg);
    } else if (eventMsg.type === "clients-html") {
      eventToClientsHTML(eventMsg);
    } else if (eventMsg.type === "process") {
      eventToProcesses(eventMsg);
    } else if (eventMsg.type === "update") {
      eventToUpdates(eventMsg, fields);
    } else if (eventMsg.type === "app-overview") {
      eventToAppOverView(eventMsg, fields);
    } else {
      eventToWarning(eventMsg);
    }
  });
  return socket;
}

function eventToUpdates(eventMsg, fields) {
  if (eventMsg.subtype.includes("message-roll")) {
    fields.updateField.update(eventMsg);
  }
  if (eventMsg.subtype.includes("error")) {
    fields.errorField.update(eventMsg);
  }
  if (eventMsg.subtype.includes("debugger")) {
    fields.debuggerField.updateConsole(eventMsg);
  }

  if (eventMsg.subtype.includes("terminal-error")) {
    initiateClosingClient();
  }
}

function eventToAppOverView(eventMsg, fields) {
  fields.appOverviewField.updateTable(eventMsg);
}

function eventToClientsHTML(eventMsg) {
  /// @TODO
  const targetEl = document.querySelector(eventMsg.subtype) ?? null;
  if (!targetEl) {
    throw new Error("NEE");
  }
  targetEl.innerHTML = eventMsg.messageData;
}

function monitorInternalErrors() {
  // TODO
  console.error("NOG NIET GEBOUWD: monitorInternalErrors")
}

function eventToProcesses(eventMsg) {
  if (!eventMsg.subtype.includes('closed')) {
    console.error('onbekende subtype')
    console.log(eventMsg.subtype)
  }
  initiateClosingClient();
}

function initiateClosingClient() {
  if (document.body.hasAttribute('data-dont-close')) {
    return; // @TODO: als server uitgaat, nadat het programma klaar is, loopt deze func opnieuw.
    // niet van DOM laten afhangen.
  }
  setTimeout(() => {
    if (!document.body.hasAttribute('data-dont-close')) {
      window.close();
    }
  }, 20000)
  setTimeout(() => {

    const divdiv = document.createElement('div')
    divdiv.className = 'warning-client-closing';
    divdiv.id = 'warning-client-closing'
    divdiv.innerHTML = `De server is klaar. De monitor word afgesloten over 15 seconden. Klik op het scherm om dit scherm te behouden.`
    document.body.appendChild(divdiv);
    document.body.addEventListener('click', () => {
      if (!document.body.hasAttribute('data-dont-close')) {
        document.body.setAttribute('data-dont-close', true)
        const diediv = document.getElementById('warning-client-closing')
        diediv.parentNode.removeChild(diediv)
      }

    })

  }, 5000)
}
 
function eventToWarning(eventMsg) {
  console.warn(`Onbekende / onverwerkbare message type`)
  console.log(eventMsg)
}

function eventToClientsLog(eventMsg) {
  console.log(eventMsg.type + ' ' + eventMsg.subtype)
  console.log(eventMsg.messageData);
}

function initFrontend() {
  const fields = createFields()
  openClientWebsocket(fields)

}

initFrontend()


