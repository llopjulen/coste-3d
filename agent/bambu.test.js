/* Tests for drivers/bambu.js. Run them with:  npm test
   A fake printer (fakeBroker.js) plays the Bambu side. The TLS tests make
   a throwaway certificate with openssl and are skipped where openssl isn't
   installed (Windows, usually); everything else runs everywhere. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { once } from 'node:events'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { X509Certificate } from 'node:crypto'
import { PUSHALL, createBambuDriver, explain, openPinnedTls, printerStatus, probeBambu } from './drivers/bambu.js'
import { startFakeBroker } from './fakeBroker.js'

const SERIAL = '01P00A123456789'
const PRINTER = {
  id: 'p1s', name: 'P1S', brand: 'bambu', model: 'P1S', host: '127.0.0.1', serial: SERIAL, accessCode: '12345678',
  fingerprint: 'AA:'.repeat(31) + 'AA',
}
// A full status, as a P1S sends after a pushall (only the fields we use).
const FULL = {
  print: {
    gcode_state: 'RUNNING', mc_percent: 42, mc_remaining_time: 75, layer_num: 120, total_layer_num: 300,
    subtask_name: 'Phone stand', gcode_file: '/data/Metadata/plate_1.gcode', nozzle_temper: 220.1, bed_temper: 59.8, print_error: 0,
  },
}

/* Polls until check() is true, so tests wait for the driver instead of sleeping a fixed time. */
async function until(check, ms = 3000) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

/* openSocket for tests: plain TCP to the fake broker, same contract as openPinnedTls. */
const plainTo = port => async () => {
  const socket = net.connect(port, '127.0.0.1')
  await once(socket, 'connect')
  return { socket, fingerprint: PRINTER.fingerprint }
}

test('printerStatus: a running Bambu job becomes the common status', () => {
  const status = printerStatus(PRINTER, { raw: FULL.print, connection: 'online', updatedAt: new Date('2026-10-25T12:00:00Z') })
  assert.deepEqual(status, {
    id: 'p1s', name: 'P1S', brand: 'bambu', model: 'P1S', connection: 'online', state: 'printing',
    job: { name: 'Phone stand', progress: 0.42, remainingMinutes: 75, layer: 120, totalLayers: 300 },
    temps: { nozzle: 220.1, bed: 59.8 }, printError: null, updatedAt: '2026-10-25T12:00:00.000Z', error: null,
  })
})

test('printerStatus: never contains the address, serial, access code or fingerprint', () => {
  const text = JSON.stringify(printerStatus(PRINTER, { raw: FULL.print, connection: 'online' }))
  for (const secret of [PRINTER.host, PRINTER.serial, PRINTER.accessCode, PRINTER.fingerprint]) assert.equal(text.includes(secret), false, secret)
})

test('printerStatus: states, finished jobs, and stale data while offline', () => {
  const s = (raw, connection = 'online') => printerStatus(PRINTER, { raw, connection })
  assert.equal(s({ gcode_state: 'IDLE' }).state, 'idle')
  assert.equal(s({ gcode_state: 'IDLE' }).job, null)
  assert.equal(s({ gcode_state: 'PREPARE' }).state, 'preparing')
  assert.equal(s({ gcode_state: 'PAUSE' }).state, 'paused')
  // A finished or failed job stays visible, so you can see how the last one ended.
  assert.equal(s({ gcode_state: 'FINISH', subtask_name: 'x' }).job.name, 'x')
  assert.equal(s({ gcode_state: 'FAILED', print_error: 50348044 }).printError, 50348044)
  // Something new from a future firmware isn't guessed at.
  assert.equal(s({ gcode_state: 'SOMETHING_NEW' }).state, 'unknown')
  // While offline the last numbers may be old: the state says so.
  assert.equal(s(FULL.print, 'offline').state, 'unknown')
  // Garbage from the printer becomes null, not NaN on the screen.
  assert.equal(s({ gcode_state: 'RUNNING', mc_percent: 'x', nozzle_temper: null }).job.progress, null)
  assert.equal(s({ gcode_state: 'RUNNING', mc_percent: 140 }).job.progress, 1)
})

test('explain: each failure gets a message a person can act on, and only a changed certificate stops retries', () => {
  assert.equal(explain({ code: 'CERT_MISMATCH' }).fatal, true)
  assert.equal(explain({ code: 'NO_FINGERPRINT' }).fatal, true)
  const auth = explain({ code: 'CONNECT_REFUSED', returnCode: 4 })
  assert.equal(auth.connection, 'auth-error')
  assert.match(auth.message, /access code/)
  assert.equal(explain({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' }).connection, 'offline')
})

test('driver: logs in as bblp, subscribes to its serial, asks for pushall, and merges partial updates', async () => {
  const broker = await startFakeBroker({
    onPublish: ({ topic, payload, reply }) => {
      if (topic === `device/${SERIAL}/request` && JSON.parse(payload).pushing?.command === 'pushall') reply(`device/${SERIAL}/report`, FULL)
    },
  })
  const driver = createBambuDriver(PRINTER, { openSocket: plainTo(broker.port) })
  try {
    driver.start()
    await until(() => driver.status().state === 'printing')
    assert.equal(broker.state.connects[0].username, 'bblp')
    assert.equal(broker.state.connects[0].password, '12345678')
    assert.deepEqual(broker.state.subscriptions, [`device/${SERIAL}/report`])
    assert.equal(broker.state.published[0].payload, PUSHALL)

    // P1 and A1 send only what changed: the rest must be kept.
    broker.send(`device/${SERIAL}/report`, { print: { mc_percent: 50, layer_num: 150 } })
    await until(() => driver.status().job.progress === 0.5)
    assert.equal(driver.status().job.layer, 150)
    assert.equal(driver.status().job.name, 'Phone stand')
    // Messages on another printer's topic are ignored.
    broker.send('device/OTHER/report', { print: { gcode_state: 'FAILED' } })
    await new Promise(resolve => setTimeout(resolve, 50))
    assert.equal(driver.status().state, 'printing')
  } finally {
    driver.stop()
    await broker.close()
  }
})

test('driver: when the printer drops the connection it reconnects and asks for everything again', async () => {
  let pushalls = 0
  const broker = await startFakeBroker({
    onPublish: ({ reply }) => { pushalls++; reply(`device/${SERIAL}/report`, FULL) },
  })
  const driver = createBambuDriver(PRINTER, { openSocket: plainTo(broker.port) })
  try {
    driver.start()
    await until(() => driver.status().connection === 'online')
    broker.dropClients()
    await until(() => driver.status().connection === 'offline')
    // The first retry comes after 2 seconds.
    await until(() => pushalls === 2, 4000)
    await until(() => driver.status().connection === 'online')
  } finally {
    driver.stop()
    await broker.close()
  }
})

test('driver: a wrong access code is reported as such', async () => {
  const broker = await startFakeBroker({ connackCode: 4 })
  const driver = createBambuDriver(PRINTER, { openSocket: plainTo(broker.port) })
  try {
    driver.start()
    await until(() => driver.status().connection === 'auth-error')
    assert.match(driver.status().error, /access code/)
  } finally {
    driver.stop()
    await broker.close()
  }
})

test('driver: without a stored certificate fingerprint it refuses to connect at all', async () => {
  let opened = 0
  const driver = createBambuDriver({ ...PRINTER, fingerprint: null }, { openSocket: async () => { opened++; throw new Error('should not be called') } })
  driver.start()
  await until(() => driver.status().connection === 'error')
  assert.equal(opened, 0)
  assert.match(driver.status().error, /add it again/i)
  driver.stop()
})

/* ---------------------------- TLS ---------------------------------- */

// openssl is on macOS and Linux; on Windows these tests are skipped.
let hasOpenssl = true
try {
  execFileSync('openssl', ['version'], { stdio: 'ignore' })
} catch {
  hasOpenssl = false
}

/* A throwaway self-signed certificate, like the one a printer presents. */
function makeCertificate() {
  const dir = mkdtempSync(join(tmpdir(), 'layercents-cert-'))
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', `/CN=${SERIAL}`,
      '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' })
    const cert = readFileSync(join(dir, 'cert.pem'))
    return { key: readFileSync(join(dir, 'key.pem')), cert, fingerprint: new X509Certificate(cert).fingerprint256 }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('TLS: the right certificate connects; the wrong one is refused before the access code is sent', { skip: !hasOpenssl && 'openssl not installed' }, async () => {
  const { key, cert, fingerprint } = makeCertificate()
  const broker = await startFakeBroker({ tlsOptions: { key, cert } })
  try {
    const ok = await openPinnedTls({ host: '127.0.0.1', port: broker.port, expectedFingerprint: fingerprint })
    assert.equal(ok.fingerprint, fingerprint)
    ok.socket.destroy()

    await assert.rejects(
      openPinnedTls({ host: '127.0.0.1', port: broker.port, expectedFingerprint: 'AB:'.repeat(31) + 'AB' }),
      err => err.code === 'CERT_MISMATCH',
    )
    // The fake printer never received a login: the access code stayed here.
    await new Promise(resolve => setTimeout(resolve, 50))
    assert.equal(broker.state.connects.length, 0)
  } finally {
    await broker.close()
  }
})

test('TLS: a driver whose printer changed certificate stops, without sending the access code', { skip: !hasOpenssl && 'openssl not installed' }, async () => {
  const { key, cert } = makeCertificate()
  const broker = await startFakeBroker({ tlsOptions: { key, cert } })
  const driver = createBambuDriver(PRINTER, { openSocket: options => openPinnedTls({ ...options, port: broker.port }) })
  try {
    driver.start()
    await until(() => driver.status().connection === 'error')
    assert.match(driver.status().error, /certificate changed/)
    assert.equal(broker.state.connects.length, 0)
  } finally {
    driver.stop()
    await broker.close()
  }
})

test('probe: checks IP, access code and serial, and returns the certificate to pin', { skip: !hasOpenssl && 'openssl not installed' }, async () => {
  const { key, cert, fingerprint } = makeCertificate()
  const broker = await startFakeBroker({
    tlsOptions: { key, cert },
    // Answers only for its own serial, like a real printer.
    onPublish: ({ topic, reply }) => { if (topic === `device/${SERIAL}/request`) reply(`device/${SERIAL}/report`, { print: { gcode_state: 'IDLE' } }) },
  })
  const openSocket = options => openPinnedTls({ ...options, port: broker.port })
  try {
    const good = await probeBambu({ host: '127.0.0.1', serial: SERIAL, accessCode: '12345678' }, { openSocket })
    assert.deepEqual(good, { fingerprint, state: 'IDLE' })

    await assert.rejects(
      probeBambu({ host: '127.0.0.1', serial: 'WRONGSERIAL1', accessCode: '12345678' }, { openSocket, reportTimeoutMs: 200 }),
      err => err.code === 'NO_REPORT',
    )
  } finally {
    await broker.close()
  }

  const refusing = await startFakeBroker({ tlsOptions: { key, cert }, connackCode: 4 })
  try {
    await assert.rejects(
      probeBambu({ host: '127.0.0.1', serial: SERIAL, accessCode: 'wrongpw1' }, { openSocket: options => openPinnedTls({ ...options, port: refusing.port }) }),
      err => err.code === 'CONNECT_REFUSED',
    )
  } finally {
    await refusing.close()
  }
})
