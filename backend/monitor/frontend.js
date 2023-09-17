import wsMessage from './wsMessage.js';
import MonitorField from './monitor-field.js';

function createFields() {
  const updateField = new MonitorField(
    'Updates',
    'update-field-target',
    'roll',
  );
  updateField.initialize();
  const errorField = new MonitorField('Fouten', 'error-field-target', 'error');
  errorField.initialize();
  const debuggerField = new MonitorField(
    'Debugger',
    'debugger-field-target',
    'expanded',
  );
  debuggerField.initialize();
  const appOverviewField = new MonitorField(
    'AppOverview',
    'app-overview-field-target',
    'table',
  );

  appOverviewField.initialize();
  return {
    updateField, errorField, debuggerField, appOverviewField,
  };
}

function openClientWebsocket(fields) {
  const socket = new WebSocket('ws://localhost:8000');

  socket.addEventListener('error', (event) => {
    // const msg = new wsMessage("update", "terminal-error", {
    //   title: "Socket err",
    //   text: event.error,
    // });
    // eventToUpdates(msg, fields);
    console.error(event, 'frontend 42');
    const msg = new wsMessage('update', 'debugger', {
      title: 'Socket err',
      content: event,
    });
    eventToUpdates(msg, fields);
  });

  socket.addEventListener('open', () => {
    const msg = new wsMessage('server-log', null, 'Hallo server!');
    socket.send(msg.json);
  });

  socket.addEventListener('close', () => {
    const msg = new wsMessage('update', 'message-roll', {
      title: 'De server zelf',
      text: 'De server lijkt afgesloten te zijn.',
    });
    eventToUpdates(msg, fields);
  });

  socket.addEventListener('message', (event) => {
    const eventMsg = JSON.parse(event.data);
    if (eventMsg.type === 'server-log') {
      monitorInternalErrors(`Er is een event naar de client verstuurd bedoelt voor de server.
      ${eventMsg.messageData} `);
    } else if (eventMsg.type === 'clients-log') {
      eventToClientsLog(eventMsg, fields);
    } else if (eventMsg.type === 'clients-html') {
      eventToClientsHTML(eventMsg);
    } else if (eventMsg.type === 'process') {
      eventToProcesses(eventMsg, fields);
    } else if (eventMsg.type === 'update') {
      eventToUpdates(eventMsg, fields);
    } else if (eventMsg.type === 'app-overview') {
      eventToAppOverView(eventMsg, fields);
    } else {
      eventToWarning(eventMsg);
    }
  });
  return socket;
}

function eventToUpdates(eventMsg, fields) {
  if (eventMsg.subtype.includes('message-roll')) {
    fields.updateField.update(eventMsg);
  }
  if (eventMsg.subtype === 'error') {
    fields.errorField.updateError(eventMsg);
  }
  if (eventMsg.subtype.includes('debugger')) {
    fields.debuggerField.updateConsole(eventMsg); // HIER
  }

  if (eventMsg.subtype.includes('terminal-error')) {
    initiateClosingClient();
  }
}

function eventToAppOverView(eventMsg, fields) {
  fields.appOverviewField.updateTable(eventMsg.messageData);
}

function eventToClientsHTML(eventMsg) {
  /// @TODO
  const targetEl = document.querySelector(eventMsg.subtype) ?? null;
  if (!targetEl) {
    throw new Error('NEE');
  }
  targetEl.innerHTML = eventMsg.messageData;
}

function monitorInternalErrors() {
  // TODO
  console.warn('NOG NIET GEBOUWD: monitorInternalErrors');
}

function eventToProcesses(eventMsg, fields) {
  if (eventMsg.subtype === 'closed') {
    initiateClosingClient();
    // @TODO de updates naar app overview moeten helemaal via workers-status, niet via updates.
    //
  } else if (eventMsg.subtype === 'workers-status' && eventMsg?.messageData?.content?.status === 'done') {
    fields.appOverviewField.updateTable({
      [`amountOfEvents-${eventMsg.messageData.content.workerData.name}`]:
          eventMsg.messageData.amountOfEvents,
    });
  } else {
    // TODO nog niet geprogrammeerd
    // console.log(`nog niet geprogrammeerde optie`);
    // console.log(eventMsg)
  }
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
  }, 20000);
  setTimeout(() => {
    const divdiv = document.createElement('div');
    divdiv.className = 'warning-client-closing';
    divdiv.id = 'warning-client-closing';
    divdiv.innerHTML = 'De server is klaar. De monitor word afgesloten over 15 seconden. Klik op het scherm om dit scherm te behouden.';
    document.body.appendChild(divdiv);
    document.body.addEventListener('click', () => {
      if (!document.body.hasAttribute('data-dont-close')) {
        document.body.setAttribute('data-dont-close', true);
        const diediv = document.getElementById('warning-client-closing');
        diediv.parentNode.removeChild(diediv);
      }
    });
  }, 5000);
}

function eventToWarning(eventMsg) {
  console.warn('Onbekende / onverwerkbare message type');
  console.log(eventMsg);
}

function eventToClientsLog(eventMsg, fields) {
  if (eventMsg.subtype === 'error') {
    console.log(`Error in ${eventMsg.messageData.workerData.name}`);
    console.error(eventMsg.messageData.error);
    return;
  }
  const debug = eventMsg.messageData?.content?.debug ?? null;
  if (!debug) {
    const updateErrorMsg = {
      type: 'update',
      subtype: 'error',
      messageData: {
        content: {
          workerData: {
            family: 'monitor',
            index: 'frontend',
            name: 'monitor-frontend',
            scraper: false,
          },
          remarks:
            'er is iets gevraagd te debuggen maar debug property op content was niet gezet.\n<br>Zie de console.',
          text: '',
        },
      },
    };
    console.error('debug zit niet in messageData.content!');
    console.dir(eventMsg);
    fields.errorField.updateError(updateErrorMsg);
  }
  if (eventMsg.subtype.includes('log')) {
    console.log('');
    console.log(`${eventMsg.messageData?.content?.workerData?.name}`);
    console.log(debug);
    return;
  }
  if (Array.isArray(debug)) {
    console.log('');
    console.log(`${eventMsg.messageData?.content?.workerData?.name}`);
    console.dir(debug);
  } else if (debug instanceof Object) {
    console.dir(debug);
    // const keys = Object.keys(debug);
    // const values = Object.values(debug);
    // // console.log(
    // //   `${eventMsg.messageData?.content?.workerData?.name} - ${keys.join(", ")}`
    // // );
    // console.log('')
    // values.forEach((val, index) => {
    //   if (typeof val === "string" || typeof val === "number") {
    //     if (keys[index] === 'longTextHTML') {
    //       console.log(`${val.substring(0, 50)} . . .`);
    //     } else {
    //       console.log(`${keys[index]} - ${val}`);
    //     }
    //   } else if (typeof val === "undefined") {
    //     console.log(`${keys[index]} - undefined`);
    //   } else if (val === null) {
    //     console.log(`${keys[index]} - null`);
    //   } else {
    //     console.dir(val);
    //   }
    // });
  } else {
    console.log(debug);
  }
}

function initFrontend() {
  const fields = createFields();
  openClientWebsocket(fields);
}

initFrontend();
