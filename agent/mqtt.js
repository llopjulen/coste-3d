/* ==================================================================
   MQTT 3.1.1 — the small part of the protocol the agent needs.

   MQTT is how IoT devices talk: a server (the "broker") receives
   messages published on "topics" and passes them to whoever subscribed.
   Every Bambu printer has a broker inside; we connect to it, subscribe
   to the printer's status topic and receive every change.

   Why not the `mqtt` package from npm: it brings ~15 other packages
   into a program that holds printer access codes, and npm supply-chain
   attacks (a popular package hijacked to steal secrets) happened several
   times in 2025. We only need 7 of the 14 packet types, about 200 lines,
   with no dependencies, and every byte tested.

   Two parts:
   1. The encode functions and PacketReader: bytes in, bytes out. Pure, no network.
   2. MqttSession: runs a conversation over a stream someone else opened
      (the Bambu driver opens it with TLS). It never opens connections.

   Spec: MQTT Version 3.1.1, OASIS Standard, 29 October 2014.
================================================================== */
import { EventEmitter } from 'node:events'

// Packet types: the high 4 bits of the first byte of every packet (spec 2.2.1).
export const TYPE = {
  CONNECT: 1, CONNACK: 2, PUBLISH: 3, PUBACK: 4,
  SUBSCRIBE: 8, SUBACK: 9, PINGREQ: 12, PINGRESP: 13, DISCONNECT: 14,
}

// CONNACK answers (spec 3.2.2.3). 4 is the one people will see: wrong access code.
export const CONNACK_ERRORS = {
  1: 'unacceptable protocol version',
  2: 'client id rejected',
  3: 'server unavailable',
  4: 'bad username or password',
  5: 'not authorized',
}

// A full pushall from a printer is a few tens of KB. Anything above 4 MB is a
// broken or hostile peer: refusing it stops it from filling our memory.
export const MAX_PACKET_BYTES = 4 * 1024 * 1024

/* ------------------------------------------------------------------
   Encoding
------------------------------------------------------------------ */

/* "Remaining length": how many bytes follow the first one, written 7 bits
   per byte, lowest first; the top bit says "another byte follows" (spec 2.2.3).
   127 fits in 1 byte; 128 needs 2: [0x80, 0x01]. */
export function encodeLength(n) {
  if (!Number.isInteger(n) || n < 0 || n > 268_435_455) throw new RangeError(`bad MQTT length ${n}`)
  const bytes = []
  do {
    let digit = n % 128
    n = Math.floor(n / 128)
    if (n > 0) digit |= 0x80
    bytes.push(digit)
  } while (n > 0)
  return Buffer.from(bytes)
}

/* A string as MQTT writes it: 2 bytes of length (big-endian), then UTF-8. */
function encodeString(text) {
  const body = Buffer.from(text, 'utf8')
  if (body.length > 0xffff) throw new RangeError('MQTT string longer than 65535 bytes')
  const head = Buffer.alloc(2)
  head.writeUInt16BE(body.length)
  return Buffer.concat([head, body])
}

/* First byte (type and flags) + length + the rest. */
function packet(type, flags, parts) {
  const body = Buffer.concat(parts)
  return Buffer.concat([Buffer.from([(type << 4) | flags]), encodeLength(body.length), body])
}

/* CONNECT: who we are and the password (spec 3.1). Clean session: the
   broker keeps nothing for us between connections, so a reconnect always
   starts fresh (and we ask for a full status again). */
export function encodeConnect({ clientId, username, password, keepaliveSeconds }) {
  const flags = 0x80 /* username */ | 0x40 /* password */ | 0x02 /* clean session */
  const keepalive = Buffer.alloc(2)
  keepalive.writeUInt16BE(keepaliveSeconds)
  return packet(TYPE.CONNECT, 0, [
    encodeString('MQTT'), // protocol name
    Buffer.from([4]), // protocol level 4 = MQTT 3.1.1
    Buffer.from([flags]),
    keepalive,
    encodeString(clientId),
    encodeString(username),
    encodeString(password),
  ])
}

/* SUBSCRIBE to one topic at QoS 0 ("at most once": no acknowledgements
   per message, which is what status updates need). The flags 0b0010 are
   fixed by the spec for SUBSCRIBE (3.8.1). */
export function encodeSubscribe(packetId, topic) {
  const id = Buffer.alloc(2)
  id.writeUInt16BE(packetId)
  return packet(TYPE.SUBSCRIBE, 0b0010, [id, encodeString(topic), Buffer.from([0])])
}

/* PUBLISH at QoS 0: topic, then the payload as raw bytes (spec 3.3). */
export function encodePublish(topic, payload) {
  return packet(TYPE.PUBLISH, 0, [encodeString(topic), Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8')])
}

/* PUBACK: "got it", only needed if the broker sends us QoS 1 messages. */
export function encodePuback(packetId) {
  const id = Buffer.alloc(2)
  id.writeUInt16BE(packetId)
  return packet(TYPE.PUBACK, 0, [id])
}

export const PINGREQ = Buffer.from([TYPE.PINGREQ << 4, 0])
export const DISCONNECT = Buffer.from([TYPE.DISCONNECT << 4, 0])

/* ------------------------------------------------------------------
   Decoding
------------------------------------------------------------------ */

/* TCP delivers bytes, not packets: one packet can arrive in three chunks,
   or three packets in one chunk. PacketReader keeps the leftover bytes
   and returns only complete packets. */
export class PacketReader {
  constructor({ maxBytes = MAX_PACKET_BYTES } = {}) {
    this.buffer = Buffer.alloc(0)
    this.maxBytes = maxBytes
  }

  /* Adds a chunk; returns every packet that is now complete (maybe none).
     Throws on bytes that can't be MQTT, so the caller closes the connection. */
  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk
    const packets = []
    for (;;) {
      const head = readLength(this.buffer)
      if (!head) break // not even the length is complete yet
      const total = 1 + head.lengthBytes + head.length
      if (total > this.maxBytes) throw new Error(`MQTT packet of ${total} bytes is over the ${this.maxBytes}-byte limit`)
      if (this.buffer.length < total) break // wait for the rest
      packets.push(decodePacket(this.buffer.subarray(0, total), 1 + head.lengthBytes))
      this.buffer = this.buffer.subarray(total)
    }
    return packets
  }
}

/* Reads the remaining length that starts at byte 1. Null if it isn't all here yet. */
function readLength(buf) {
  let length = 0
  let multiplier = 1
  for (let i = 1; i <= 4; i++) {
    if (i >= buf.length) return null
    const byte = buf[i]
    length += (byte & 0x7f) * multiplier
    if ((byte & 0x80) === 0) return { length, lengthBytes: i }
    multiplier *= 128
  }
  // A fifth "continue" bit: not valid MQTT (spec 2.2.3 allows 4 bytes at most).
  throw new Error('malformed MQTT remaining length')
}

/* One complete packet -> a plain object. `start` is where the variable header begins. */
function decodePacket(buf, start) {
  const type = buf[0] >> 4
  const flags = buf[0] & 0x0f
  const body = buf.subarray(start)
  switch (type) {
    case TYPE.CONNACK:
      return { type, sessionPresent: (body[0] & 1) === 1, returnCode: body[1] }
    case TYPE.PUBLISH: {
      const qos = (flags >> 1) & 0b11
      const topicLength = body.readUInt16BE(0)
      const topic = body.toString('utf8', 2, 2 + topicLength)
      let offset = 2 + topicLength
      let packetId = null
      // Only QoS 1 and 2 carry a packet id (spec 3.3.2.2).
      if (qos > 0) {
        packetId = body.readUInt16BE(offset)
        offset += 2
      }
      return { type, qos, topic, packetId, payload: body.subarray(offset) }
    }
    case TYPE.SUBACK:
      return { type, packetId: body.readUInt16BE(0), granted: [...body.subarray(2)] }
    case TYPE.PINGRESP:
      return { type }
    default:
      // Valid MQTT that a client doesn't expect (a broker never sends CONNECT): kept, then ignored.
      return { type, flags, body }
  }
}

/* ------------------------------------------------------------------
   Session
------------------------------------------------------------------ */

/* An MQTT conversation over an already-open stream (a TLS socket for the
   printers, a plain socket in tests).
   Events:
     'connected'          the broker accepted us (CONNACK 0)
     'message' (topic, payload Buffer)
     'error' (err)        err.code: CONNECT_REFUSED, CONNECT_TIMEOUT,
                          KEEPALIVE_TIMEOUT, SUBSCRIBE_REFUSED, PROTOCOL
     'close'              the stream is gone (always the last event) */
export class MqttSession extends EventEmitter {
  // pingIntervalMs exists only so tests can run the keepalive in milliseconds;
  // in real use it's the keepalive announced to the broker.
  constructor(stream, { clientId, username, password, keepaliveSeconds = 30, connectTimeoutMs = 10_000, pingIntervalMs = keepaliveSeconds * 1000 }) {
    super()
    this.stream = stream
    this.options = { clientId, username, password, keepaliveSeconds }
    this.connectTimeoutMs = connectTimeoutMs
    this.pingIntervalMs = pingIntervalMs
    this.reader = new PacketReader()
    this.nextPacketId = 1
    this.closed = false
    this.waitingPong = false
  }

  /* Sends CONNECT and starts listening. Called once. */
  start() {
    this.stream.on('data', chunk => this.onData(chunk))
    this.stream.on('error', err => this.fail(err))
    this.stream.on('close', () => this.finish())
    // A broker that accepts the TCP connection but never answers would
    // otherwise leave us waiting forever.
    this.connectTimer = setTimeout(() => this.fail(codeError('CONNECT_TIMEOUT', 'the printer did not answer the MQTT login')), this.connectTimeoutMs)
    this.write(encodeConnect(this.options))
  }

  onData(chunk) {
    let packets
    try {
      packets = this.reader.push(chunk)
    } catch (err) {
      return this.fail(codeError('PROTOCOL', err.message))
    }
    for (const p of packets) this.onPacket(p)
  }

  onPacket(p) {
    if (p.type === TYPE.CONNACK) {
      clearTimeout(this.connectTimer)
      if (p.returnCode !== 0) {
        const err = codeError('CONNECT_REFUSED', `the printer refused the login: ${CONNACK_ERRORS[p.returnCode] ?? `code ${p.returnCode}`}`)
        err.returnCode = p.returnCode
        return this.fail(err)
      }
      this.startKeepalive()
      return this.emit('connected')
    }
    if (p.type === TYPE.PUBLISH) {
      if (p.qos === 1) this.write(encodePuback(p.packetId))
      return this.emit('message', p.topic, p.payload)
    }
    if (p.type === TYPE.SUBACK) {
      // 0x80 = the broker refused the subscription (spec 3.9.3), e.g. a wrong serial number.
      if (p.granted.includes(0x80)) this.fail(codeError('SUBSCRIBE_REFUSED', 'the printer refused the subscription (check the serial number)'))
      return undefined
    }
    if (p.type === TYPE.PINGRESP) this.waitingPong = false
    return undefined
  }

  subscribe(topic) {
    const id = this.nextPacketId
    // Packet ids go 1..65535 and 0 is not allowed (spec 2.3.1).
    this.nextPacketId = id === 0xffff ? 1 : id + 1
    this.write(encodeSubscribe(id, topic))
  }

  publish(topic, payload) {
    this.write(encodePublish(topic, payload))
  }

  /* Keepalive (spec 3.1.2.10): if we send nothing for keepaliveSeconds, the
     broker may drop us; and if the broker vanishes (printer switched off)
     TCP may not notice for minutes. A PINGREQ every interval covers both:
     no PINGRESP by the next one means the connection is dead. */
  startKeepalive() {
    this.pingTimer = setInterval(() => {
      if (this.waitingPong) return this.fail(codeError('KEEPALIVE_TIMEOUT', 'the printer stopped answering'))
      this.waitingPong = true
      this.write(PINGREQ)
      return undefined
    }, this.pingIntervalMs)
  }

  write(bytes) {
    if (!this.closed) this.stream.write(bytes)
  }

  /* Polite goodbye: DISCONNECT tells the broker we're leaving on purpose. */
  close() {
    if (this.closed) return
    this.write(DISCONNECT)
    this.stream.end()
    this.finish()
  }

  fail(err) {
    if (this.closed) return
    this.emit('error', err)
    this.stream.destroy()
    this.finish()
  }

  finish() {
    if (this.closed) return
    this.closed = true
    clearTimeout(this.connectTimer)
    clearInterval(this.pingTimer)
    this.emit('close')
  }
}

/* An Error with a machine-readable code, so callers can tell cases apart. */
export function codeError(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}
