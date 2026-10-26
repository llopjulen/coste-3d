/* ==================================================================
   FAKE BROKER — a pretend printer, used only by the tests.

   It speaks just enough MQTT to play a Bambu printer: answers the
   login, accepts subscriptions, answers pings, and records everything
   the agent sends so the tests can check it (for example, that the
   access code is never sent to a printer with the wrong certificate).

   Not named *.test.js on purpose: `node --test` would run it as a test.
================================================================== */
import net from 'node:net'
import tls from 'node:tls'
import { PacketReader, TYPE, encodePublish } from './mqtt.js'

/* Reads an MQTT string (2-byte length + UTF-8) at `offset`. */
function readString(buf, offset) {
  const length = buf.readUInt16BE(offset)
  return { value: buf.toString('utf8', offset + 2, offset + 2 + length), next: offset + 2 + length }
}

/* CONNECT body -> what the client sent (spec 3.1). Assumes username and password are present. */
function parseConnect(body) {
  const protocol = readString(body, 0)
  let offset = protocol.next
  const level = body[offset]
  const flags = body[offset + 1]
  const keepalive = body.readUInt16BE(offset + 2)
  offset += 4
  const clientId = readString(body, offset)
  const username = readString(body, clientId.next)
  const password = readString(body, username.next)
  return { protocol: protocol.value, level, flags, keepalive, clientId: clientId.value, username: username.value, password: password.value }
}

/* SUBSCRIBE body -> packet id and the (single) topic. */
function parseSubscribe(body) {
  const packetId = body.readUInt16BE(0)
  const topic = readString(body, 2)
  return { packetId, topic: topic.value, qos: body[topic.next] }
}

/* Options:
   tlsOptions   { key, cert } to listen with TLS, or null for plain TCP
   connackCode  0 = accept the login; 4 = "bad username or password"
   subackCode   0 = accept subscriptions; 0x80 = refuse
   answerConnect, answerPings: false to play a printer that hangs
   onPublish({ topic, payload, reply }): called for every PUBLISH from
                the client; reply(topic, object) answers that client */
export async function startFakeBroker({ tlsOptions = null, connackCode = 0, subackCode = 0, answerConnect = true, answerPings = true, onPublish = null } = {}) {
  const state = { sockets: 0, connects: [], subscriptions: [], published: [], disconnects: 0 }
  const clients = new Set()

  function handle(socket, p) {
    if (p.type === TYPE.CONNECT) {
      state.connects.push(parseConnect(p.body))
      if (answerConnect) socket.write(Buffer.from([TYPE.CONNACK << 4, 2, 0, connackCode]))
      if (connackCode !== 0) socket.end()
    } else if (p.type === TYPE.SUBSCRIBE) {
      const sub = parseSubscribe(p.body)
      state.subscriptions.push(sub.topic)
      socket.write(Buffer.from([TYPE.SUBACK << 4, 3, sub.packetId >> 8, sub.packetId & 0xff, subackCode]))
    } else if (p.type === TYPE.PUBLISH) {
      const text = p.payload.toString('utf8')
      state.published.push({ topic: p.topic, payload: text })
      onPublish?.({ topic: p.topic, payload: text, reply: (topic, object) => socket.write(encodePublish(topic, JSON.stringify(object))) })
    } else if (p.type === TYPE.PINGREQ) {
      if (answerPings) socket.write(Buffer.from([TYPE.PINGRESP << 4, 0]))
    } else if (p.type === TYPE.DISCONNECT) {
      state.disconnects++
      socket.end()
    }
  }

  function onSocket(socket) {
    state.sockets++
    clients.add(socket)
    const reader = new PacketReader()
    socket.on('data', chunk => {
      for (const p of reader.push(chunk)) handle(socket, p)
    })
    socket.on('close', () => clients.delete(socket))
    // A client that hangs up mid-test is normal here, not a failure.
    socket.on('error', () => {})
  }

  // For TLS, 'secureConnection' is the socket after the handshake.
  const server = tlsOptions ? tls.createServer(tlsOptions, onSocket) : net.createServer(onSocket)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))

  return {
    port: server.address().port,
    state,
    /* Publishes a message to every connected client, as a printer does. */
    send(topic, object) {
      for (const socket of clients) socket.write(encodePublish(topic, JSON.stringify(object)))
    },
    /* Drops every client without a goodbye, like a printer being switched off. */
    dropClients() {
      for (const socket of clients) socket.destroy()
    },
    close() {
      for (const socket of clients) socket.destroy()
      return new Promise(resolve => server.close(resolve))
    },
  }
}
