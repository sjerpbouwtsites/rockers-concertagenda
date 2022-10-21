import { server as webSocketServer } from "websocket";
import http from 'http';
import open from 'open';
import wsMessage from './wsMessage.js';

const monitorURL = 'http://localhost/concertagenda/backend/monitor/'

function createServerWebsocket() {
  const webSocketsServerPort = 8001;
  const server = http.createServer();
  server.listen(webSocketsServerPort);
  const wsServer = new webSocketServer({
    httpServer: server
  });
  return wsServer
}
function createClients() {
  // I'm maintaining all active connections in this object
  const clients = {
    setActive(origin, connection) {
      var userID = this.getUniqueID();
      const saveOrigin = origin.replace(/[^a-zA-Z]/g, '').toUpperCase();
      const clientName = `${saveOrigin}_${userID}`
      connection.clientName = clientName;
      this.active[clientName] = connection;
      return clientName;
    },
    setInactive(clientName) {
      if (!this.active.hasOwnProperty(clientName)) {
        throw new Error('clientname onbekend in actieve verbindingen clients obj backend')
      }
      const connectionCopy = { ...this.active[clientName] }
      this.inactive[clientName] = connectionCopy;
      delete this.active[clientName];
    },
    inactive: {},
    active: {},
    getUniqueID() {
      const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
      return s4() + s4() + '-' + s4();
    },
    logConnected() {
      console.log(`connected ${Object.keys(this.active)}`);

    }
  };
  return clients;
}


// TODO als client exited

async function initMonitorBackend() {
  console.log('starting monitor')
  const clients = createClients();
  const wsServer = createServerWebsocket();
  await open(monitorURL);


  wsServer.on('request', function (request) {
    const connection = request.accept(null, request.origin);
    const newConnectionID = clients.setActive(request.origin, connection);
    connection.clientName = newConnectionID;
    clients.logConnected()
  });
  wsServer.on('handleUpgrade', function (request, socket, head) {
    const newConnectionMsg = new wsMessage('clients-log', null, `Nieuwe verbinding ${socket.clientName}. Nu ${Object.keys(clients.active).length} verbindingen`)
    wsServer.broadcast(newConnectionMsg.json);
  })
  wsServer.on('close', function (request) {
    if (request.hasOwnProperty('clientName')) {
      clients.setInactive(request.clientName)
    }
  })
  return wsServer;
}

export async function closeWebsocketServer(wsServer, closureReason = 'unknown') {
  const msg = new wsMessage('process', null, `Server closed because of ${closureReason}`)
  return wsServer.close('web socket closing.', msg.json)
}

export default initMonitorBackend;



