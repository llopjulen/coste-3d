/* ==================================================================
   BAMBU LAB DRIVER — live status of one Bambu printer, read-only.

   How a Bambu printer is reached (details and sources: docs/IMPRESORAS.md):
   - MQTT 3.1.1 over TLS, port 8883, user "bblp", password = the LAN
     access code shown on the printer's screen.
   - The printer publishes its status on  device/<serial>/report
     and listens for requests on          device/<serial>/request.
   - Reading is allowed on every firmware in normal (cloud) mode. Since
     2025, CONTROLLING it needs LAN-only + Developer Mode; we never send
     control commands, only "pushall" (send me your full status).

   A driver turns its printer's messages into the common status that
   every driver returns (see printerStatus at the bottom), so the web
   app never needs to know which brand a printer is.
================================================================== */
import tls from 'node:tls'
import net from 'node:net'
import { randomBytes } from 'node:crypto'
import { MqttSession, codeError } from '../mqtt.js'

export const BAMBU_PORT = 8883

// pushall makes the printer send everything at once. It's heavy for the
// printer, so it's sent once per connection; after that P1 and A1 send
// only what changed, and we merge it (see onReport).
export const PUSHALL = JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall' } })

// Waits between reconnection attempts: 2 s, 4 s, 8 s… up to a minute, so a
// printer that's switched off isn't hammered every second all night.
const BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 32_000, 60_000]
// A wrong access code won't fix itself: retry, but slowly.
const AUTH_RETRY_MS = 60_000

/* ------------------------------------------------------------------
   TLS with a pinned certificate
------------------------------------------------------------------ */

/* Opens TLS to the printer and checks its certificate by fingerprint.

   Why a fingerprint: the printer's certificate isn't signed by a public
   authority (no browser or OS trusts it), so the normal check would
   always fail. Turning checks off entirely would let anyone on the same
   network pretend to be the printer and collect the access code. So we
   do what SSH does: remember the certificate's SHA-256 fingerprint the
   first time (when the person adds the printer, see setup.js) and accept
   only that certificate afterwards.

   The fingerprint is checked BEFORE the MQTT login is sent: if it doesn't
   match, the access code never leaves this computer.

   expectedFingerprint: null only while adding a printer (first contact).
   Resolves { socket, fingerprint }. */
export function openPinnedTls({ host, port = BAMBU_PORT, expectedFingerprint, timeoutMs = 10_000 }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host,
      port,
      // The chain can't be verified (see above); the fingerprint below replaces it.
      rejectUnauthorized: false,
      // SNI only for names: sending an IP address as servername isn't allowed (RFC 6066).
      servername: net.isIP(host) ? undefined : host,
    })
    // Covers a printer that's off or a wrong IP: without it, TCP can wait minutes.
    socket.setTimeout(timeoutMs, () => socket.destroy(codeError('TIMEOUT', `no answer from ${host}:${port}`)))
    socket.once('secureConnect', () => {
      const fingerprint = socket.getPeerCertificate()?.fingerprint256 ?? null
      if (expectedFingerprint && fingerprint !== expectedFingerprint) {
        socket.destroy()
        return reject(codeError('CERT_MISMATCH', 'the printer presented a different certificate than when it was added'))
      }
      socket.setTimeout(0) // connected: from now on MQTT's keepalive watches the line
      return resolve({ socket, fingerprint })
    })
    socket.once('error', reject)
  })
}

/* ------------------------------------------------------------------
   Driver
------------------------------------------------------------------ */

/* printer: one entry of the agent's config (config.js): id, name, model,
   host, serial, accessCode, fingerprint.
   `openSocket` is a parameter so tests can use a fake printer. */
export function createBambuDriver(printer, { openSocket = openPinnedTls, now = () => new Date(), log = () => {}, onStatus = () => {} } = {}) {
  const reportTopic = `device/${printer.serial}/report`
  const requestTopic = `device/${printer.serial}/request`

  // `raw` accumulates the "print" part of every message: P1 and A1 send
  // only what changed, so the full picture is the sum of all messages.
  let raw = {}
  let updatedAt = null
  let connection = 'connecting'
  let error = null
  let session = null
  let stopped = false
  let wakeUp = null // resolves the current wait early when stop() is called

  /* One status message. Ignores anything that isn't valid JSON with a
     "print" object (Bambu also sends "info", "system", etc.). */
  function onReport(payload) {
    let message
    try {
      message = JSON.parse(payload.toString('utf8'))
    } catch {
      return
    }
    if (message?.print && typeof message.print === 'object') {
      raw = { ...raw, ...message.print }
      updatedAt = now()
      // Tell whoever is listening (the job log) the moment something changes,
      // instead of making it poll. A bug in the listener must not stop the
      // status from updating, so it's caught here.
      try {
        onStatus(printerStatus(printer, { raw, updatedAt, connection, error }))
      } catch (err) {
        log(`${printer.name}: status listener failed: ${err.message}`)
      }
    }
  }

  /* One connection, from TLS to its end. Resolves when a connection that
     got online closes; rejects with the reason if it never got online. */
  async function connectOnce() {
    // Without a stored fingerprint openPinnedTls would trust any certificate.
    // That's only acceptable while a person is adding the printer (setup.js),
    // never silently in the background.
    if (!printer.fingerprint) throw codeError('NO_FINGERPRINT', 'no certificate fingerprint stored for this printer')
    const { socket } = await openSocket({ host: printer.host, expectedFingerprint: printer.fingerprint })
    // stop() may have been called while TLS was opening.
    if (stopped) {
      socket.destroy()
      return
    }
    await new Promise((resolve, reject) => {
      let online = false
      let lastError = null
      session = new MqttSession(socket, {
        // Must be unique per connection: two clients with the same id kick each other out.
        clientId: `layercents-${randomBytes(4).toString('hex')}`,
        username: 'bblp',
        password: printer.accessCode,
      })
      session.on('connected', () => {
        online = true
        connection = 'online'
        error = null
        log(`${printer.name}: connected`)
        session.subscribe(reportTopic)
        session.publish(requestTopic, PUSHALL)
      })
      session.on('message', (topic, payload) => {
        if (topic === reportTopic) onReport(payload)
      })
      // Node throws if an 'error' event has no listener, so this one is required.
      // The error is kept and used when the session closes, just below.
      session.on('error', err => {
        lastError = err
        if (online) log(`${printer.name}: ${err.message}`)
      })
      session.on('close', () => {
        session = null
        // Closed after being online: a normal disconnection, retry soon.
        // Closed before: the login failed; run() decides how to retry.
        if (online) resolve()
        else reject(lastError ?? codeError('CLOSED', 'the printer closed the connection'))
      })
      session.start()
    })
  }

  /* Keeps the printer connected until stop(): connect, wait for the end,
     wait a little, again. */
  async function run() {
    let attempt = 0
    while (!stopped) {
      let waitMs = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]
      try {
        await connectOnce()
        if (stopped) return
        attempt = 0 // it worked: the next drop retries quickly again
        waitMs = BACKOFF_MS[0]
        connection = 'offline'
        error = 'Connection lost. Reconnecting…'
      } catch (err) {
        if (stopped) return
        attempt++
        const verdict = explain(err)
        connection = verdict.connection
        error = verdict.message
        log(`${printer.name}: ${err.message}`)
        if (verdict.fatal) return // a changed certificate needs a person: never retry on our own
        if (connection === 'auth-error') waitMs = AUTH_RETRY_MS
      }
      await new Promise(resolve => {
        const timer = setTimeout(resolve, waitMs)
        wakeUp = () => { clearTimeout(timer); resolve() }
      })
    }
  }

  return {
    id: printer.id,
    start() {
      // run() catches every connection problem itself; this catch is for a
      // bug in our own code, which must show up on the screen and not crash
      // the agent (an unhandled rejection stops a Node program).
      run().catch(err => {
        connection = 'error'
        error = `Internal error in the agent: ${err.message}`
        log(`${printer.name}: ${err.stack}`)
      })
    },
    /* Closes the connection and stops retrying (Ctrl+C on the agent). */
    stop() {
      stopped = true
      session?.close()
      wakeUp?.()
    },
    status() {
      return printerStatus(printer, { raw, updatedAt, connection, error })
    },
  }
}

/* Turns a failed connection into what the person should see and whether
   to keep trying. */
export function explain(err) {
  if (err.code === 'CERT_MISMATCH') {
    return { connection: 'error', fatal: true, message: 'The printer’s certificate changed since it was added. If you reset or replaced the printer, add it again with “npm run agent -- add”.' }
  }
  if (err.code === 'NO_FINGERPRINT') {
    return { connection: 'error', fatal: true, message: 'This printer was added without its certificate. Add it again with “npm run agent -- add”.' }
  }
  if (err.code === 'CONNECT_REFUSED' && (err.returnCode === 4 || err.returnCode === 5)) {
    return { connection: 'auth-error', fatal: false, message: 'The printer refused the access code. It can change after a firmware update: check it on the printer’s screen and add the printer again.' }
  }
  if (err.code === 'SUBSCRIBE_REFUSED') {
    return { connection: 'error', fatal: false, message: 'The printer refused the subscription: check the serial number.' }
  }
  // Switched off, wrong IP, Wi-Fi asleep, cable out: from here they only
  // differ in the system's error code. Only the code goes into the message,
  // never err.message: that one includes the printer's IP, and the status
  // the web app receives must not carry it (see printerStatus).
  return { connection: 'offline', fatal: false, message: `Can’t reach the printer (${NETWORK_ERRORS[err.code] ?? err.code ?? 'connection failed'}). Retrying…` }
}

// The usual network failures, in words.
const NETWORK_ERRORS = {
  ECONNREFUSED: 'it refused the connection: is it switched on?',
  TIMEOUT: 'no answer: is it on and on the same network?',
  ETIMEDOUT: 'no answer: is it on and on the same network?',
  EHOSTUNREACH: 'not reachable from this computer',
  ENETUNREACH: 'this computer is not on a network',
  ENOTFOUND: 'that address does not exist',
  ECONNRESET: 'the connection was cut',
  CLOSED: 'the printer closed the connection',
  CONNECT_TIMEOUT: 'it accepted the connection but did not answer the login',
  KEEPALIVE_TIMEOUT: 'it stopped answering',
  PROTOCOL: 'it sent something that is not MQTT',
}

/* ------------------------------------------------------------------
   Common status (the same shape for every brand; see docs/IMPRESORAS.md)
------------------------------------------------------------------ */

// Bambu's gcode_state -> our state. Anything unknown stays 'unknown'
// instead of being guessed.
const STATES = {
  IDLE: 'idle',
  PREPARE: 'preparing',
  SLICING: 'preparing',
  INIT: 'preparing',
  RUNNING: 'printing',
  PAUSE: 'paused',
  FINISH: 'finished',
  FAILED: 'failed',
}

// A number from the printer, or null if it isn't one (missing, text, NaN).
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// Bambu's own id for a job. Prints started from the printer's screen or an
// SD card report "0" or nothing, which is the same as having no id.
const jobId = raw => {
  const id = String(raw.subtask_id ?? raw.task_id ?? '')
  return id && id !== '0' ? id : null
}

/* Pure: the merged raw "print" object -> the common status. */
export function printerStatus(printer, { raw = {}, updatedAt = null, connection = 'connecting', error = null } = {}) {
  const state = Object.hasOwn(STATES, raw.gcode_state) ? STATES[raw.gcode_state] : 'unknown'
  // A job exists from the moment it's being prepared until the next one;
  // FINISH and FAILED keep it, so the last result stays visible while idle.
  const hasJob = ['preparing', 'printing', 'paused', 'finished', 'failed'].includes(state)
  const percent = num(raw.mc_percent)
  return {
    id: printer.id,
    name: printer.name,
    brand: 'bambu',
    model: printer.model ?? null,
    connection,
    state: connection === 'online' ? state : 'unknown',
    job: hasJob
      ? {
          id: jobId(raw),
          name: raw.subtask_name || raw.gcode_file || null,
          progress: percent === null ? null : Math.min(Math.max(percent, 0), 100) / 100,
          remainingMinutes: num(raw.mc_remaining_time),
          layer: num(raw.layer_num),
          totalLayers: num(raw.total_layer_num),
        }
      : null,
    temps: { nozzle: num(raw.nozzle_temper), bed: num(raw.bed_temper) },
    // Bambu's error code, if the printer reports one (0 means no error).
    printError: num(raw.print_error) || null,
    printMessage: null, // Bambu reports a code only; Klipper brings words (see moonraker.js)
    updatedAt: updatedAt ? updatedAt.toISOString() : null,
    error,
  }
}

/* ------------------------------------------------------------------
   Probe: used once, when a person adds a printer (setup.js)
------------------------------------------------------------------ */

/* Connects with the details the person typed and checks all three:
   the IP (TLS answers), the access code (MQTT login accepted) and the
   serial number (a status message arrives on that serial's topic).
   Resolves { fingerprint, state } for the printer to be saved with;
   rejects with a coded error saying which detail is wrong. */
export async function probeBambu({ host, serial, accessCode }, { openSocket = openPinnedTls, reportTimeoutMs = 10_000 } = {}) {
  // First contact: no fingerprint to compare yet, so whatever the printer
  // presents is recorded (trust on first use, like SSH). The person is at
  // the keyboard and has just typed this printer's IP.
  const { socket, fingerprint } = await openSocket({ host, expectedFingerprint: null })
  const reportTopic = `device/${serial}/report`
  const state = await new Promise((resolve, reject) => {
    const session = new MqttSession(socket, { clientId: `layercents-${randomBytes(4).toString('hex')}`, username: 'bblp', password: accessCode })
    let lastError = null
    let timer = null
    session.on('connected', () => {
      session.subscribe(reportTopic)
      session.publish(`device/${serial}/request`, PUSHALL)
      // Logged in, but a wrong serial just means silence on that topic.
      timer = setTimeout(() => {
        lastError = codeError('NO_REPORT', `logged in, but no status arrived for serial ${serial}`)
        session.close()
      }, reportTimeoutMs)
    })
    session.on('message', (topic, payload) => {
      if (topic !== reportTopic) return
      let message = null
      try { message = JSON.parse(payload.toString('utf8')) } catch { /* not JSON: keep waiting */ }
      if (!message?.print) return
      clearTimeout(timer)
      // resolve() BEFORE close(): close() emits 'close' at once, and the
      // handler below would reject first.
      resolve(message.print.gcode_state ?? 'unknown')
      session.close()
    })
    session.on('error', err => { lastError = err })
    session.on('close', () => {
      clearTimeout(timer)
      // Also fires after a success (we close the session ourselves); by then
      // resolve() has settled the promise and this reject does nothing.
      reject(lastError ?? codeError('CLOSED', 'the printer closed the connection'))
    })
    session.start()
  })
  return { fingerprint, state }
}
