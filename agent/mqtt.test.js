/* Tests for mqtt.js. Run them with:  npm test
   The encoders are checked byte by byte against the MQTT 3.1.1 spec, the
   reader against chunks split in awkward places, and the session against
   a fake broker on a throwaway port. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { once } from 'node:events'
import { MqttSession, PacketReader, TYPE, encodeConnect, encodeLength, encodePublish, encodeSubscribe } from './mqtt.js'
import { startFakeBroker } from './fakeBroker.js'

test('remaining length: 7 bits per byte, lowest first, top bit = more follows', () => {
  const cases = [
    [0, [0x00]],
    [127, [0x7f]],
    [128, [0x80, 0x01]],
    [16_383, [0xff, 0x7f]],
    [16_384, [0x80, 0x80, 0x01]],
    [268_435_455, [0xff, 0xff, 0xff, 0x7f]], // the largest MQTT allows
  ]
  for (const [n, bytes] of cases) assert.deepEqual([...encodeLength(n)], bytes, `length ${n}`)
  assert.throws(() => encodeLength(268_435_456), RangeError)
  assert.throws(() => encodeLength(-1), RangeError)
})

test('CONNECT is laid out exactly as the spec says', () => {
  const bytes = encodeConnect({ clientId: 'c', username: 'u', password: 'p', keepaliveSeconds: 30 })
  assert.deepEqual([...bytes], [
    0x10, 19, // CONNECT, 19 bytes follow
    0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, // "MQTT"
    0x04, // level 4 = 3.1.1
    0xc2, // username + password + clean session
    0x00, 0x1e, // keepalive 30 s
    0x00, 0x01, 0x63, // "c"
    0x00, 0x01, 0x75, // "u"
    0x00, 0x01, 0x70, // "p"
  ])
})

test('SUBSCRIBE carries the fixed flags 0010, the packet id and QoS 0', () => {
  assert.deepEqual([...encodeSubscribe(1, 'a/b')], [0x82, 8, 0x00, 0x01, 0x00, 0x03, 0x61, 0x2f, 0x62, 0x00])
})

test('the reader returns a packet only once it is complete, even one byte at a time', () => {
  const bytes = encodePublish('device/X/report', '{"print":{"mc_percent":42}}')
  const reader = new PacketReader()
  const seen = []
  for (const byte of bytes) seen.push(...reader.push(Buffer.from([byte])))
  assert.equal(seen.length, 1)
  assert.equal(seen[0].type, TYPE.PUBLISH)
  assert.equal(seen[0].topic, 'device/X/report')
  assert.equal(seen[0].payload.toString(), '{"print":{"mc_percent":42}}')
})

test('the reader splits several packets that arrive in one chunk', () => {
  const chunk = Buffer.concat([Buffer.from([0x20, 2, 0, 0]), Buffer.from([0xd0, 0]), encodePublish('t', 'x')])
  const packets = new PacketReader().push(chunk)
  assert.deepEqual(packets.map(p => p.type), [TYPE.CONNACK, TYPE.PINGRESP, TYPE.PUBLISH])
  assert.equal(packets[0].returnCode, 0)
})

test('a big message (200 KB, 3-byte length) survives being cut in random places', () => {
  const big = 'x'.repeat(200_000)
  const bytes = encodePublish('t', big)
  const reader = new PacketReader()
  const seen = []
  for (let i = 0; i < bytes.length;) {
    const size = 1 + Math.floor(Math.random() * 5000)
    seen.push(...reader.push(bytes.subarray(i, i + size)))
    i += size
  }
  assert.equal(seen.length, 1)
  assert.equal(seen[0].payload.length, 200_000)
})

test('QoS 1 messages carry their packet id', () => {
  // PUBLISH with QoS 1: flags 0010, topic "t", id 7, payload "hi".
  const bytes = Buffer.from([0x32, 7, 0x00, 0x01, 0x74, 0x00, 0x07, 0x68, 0x69])
  const [p] = new PacketReader().push(bytes)
  assert.equal(p.qos, 1)
  assert.equal(p.packetId, 7)
  assert.equal(p.payload.toString(), 'hi')
})

test('broken or oversized input is refused instead of read', () => {
  // Five "more follows" bits: the spec allows four at most.
  assert.throws(() => new PacketReader().push(Buffer.from([0x30, 0x80, 0x80, 0x80, 0x80, 0x01])), /malformed/)
  // A packet announcing more than the limit is refused before waiting for it.
  assert.throws(() => new PacketReader({ maxBytes: 100 }).push(Buffer.from([0x30, 0xc8, 0x01])), /over the 100-byte limit/)
})

/* Waits for 'close'. Not events.once(): that one also rejects as soon as
   the emitter emits 'error', and these tests expect errors before the close. */
const closeOf = session => new Promise(resolve => session.on('close', resolve))

/* Opens a plain TCP connection to the fake broker and wraps it in a session. */
async function sessionTo(port, options = {}) {
  const socket = net.connect(port, '127.0.0.1')
  await once(socket, 'connect')
  const session = new MqttSession(socket, { clientId: 'test', username: 'bblp', password: '12345678', ...options })
  const errors = []
  session.on('error', err => errors.push(err))
  return { session, errors }
}

test('session: logs in, subscribes, publishes and receives messages', async () => {
  const broker = await startFakeBroker({
    // Plays a printer: answers a pushall with a status message.
    onPublish: ({ topic, reply }) => reply(topic.replace('request', 'report'), { print: { gcode_state: 'IDLE' } }),
  })
  try {
    const { session, errors } = await sessionTo(broker.port)
    session.start()
    await once(session, 'connected')
    session.subscribe('device/X/report')
    session.publish('device/X/request', '{"pushing":{"command":"pushall"}}')
    const [topic, payload] = await once(session, 'message')
    assert.equal(topic, 'device/X/report')
    assert.deepEqual(JSON.parse(payload), { print: { gcode_state: 'IDLE' } })
    assert.deepEqual(broker.state.connects[0], { protocol: 'MQTT', level: 4, flags: 0xc2, keepalive: 30, clientId: 'test', username: 'bblp', password: '12345678' })
    assert.deepEqual(broker.state.subscriptions, ['device/X/report'])
    // close() emits 'close' straight away, so the listener goes first.
    const closed = once(session, 'close')
    session.close()
    await closed
    assert.deepEqual(errors, [])
  } finally {
    await broker.close()
  }
})

test('session: a refused login is an error with the broker\'s return code', async () => {
  const broker = await startFakeBroker({ connackCode: 4 })
  try {
    const { session, errors } = await sessionTo(broker.port)
    session.start()
    await closeOf(session)
    assert.equal(errors[0].code, 'CONNECT_REFUSED')
    assert.equal(errors[0].returnCode, 4)
    assert.match(errors[0].message, /bad username or password/)
  } finally {
    await broker.close()
  }
})

test('session: a refused subscription is an error', async () => {
  const broker = await startFakeBroker({ subackCode: 0x80 })
  try {
    const { session, errors } = await sessionTo(broker.port)
    session.start()
    await once(session, 'connected')
    session.subscribe('device/WRONG/report')
    await closeOf(session)
    assert.equal(errors[0].code, 'SUBSCRIBE_REFUSED')
  } finally {
    await broker.close()
  }
})

test('session: a broker that never answers the login times out', async () => {
  const broker = await startFakeBroker({ answerConnect: false })
  try {
    const { session, errors } = await sessionTo(broker.port, { connectTimeoutMs: 100 })
    session.start()
    await closeOf(session)
    assert.equal(errors[0].code, 'CONNECT_TIMEOUT')
  } finally {
    await broker.close()
  }
})

test('session: pings keep a live connection open, and a silent broker is dropped', async () => {
  const alive = await startFakeBroker()
  const silent = await startFakeBroker({ answerPings: false })
  try {
    const a = await sessionTo(alive.port, { pingIntervalMs: 50 })
    a.session.start()
    await once(a.session, 'connected')
    await new Promise(resolve => setTimeout(resolve, 300)) // six pings, all answered
    assert.equal(a.session.closed, false)
    a.session.close()

    const s = await sessionTo(silent.port, { pingIntervalMs: 50 })
    s.session.start()
    await closeOf(s.session)
    assert.equal(s.errors[0].code, 'KEEPALIVE_TIMEOUT')
  } finally {
    await alive.close()
    await silent.close()
  }
})
