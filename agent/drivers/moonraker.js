/* ==================================================================
   MOONRAKER DRIVER — Klipper printers (Creality K1/K2, Elegoo
   Neptune 4, Qidi, Sovol, Voron…), read-only.

   Klipper is the firmware and Moonraker is its HTTP API, on port 7125
   (details and sources: docs/IMPRESORAS.md). Two things make this driver
   simpler than Bambu's:

   - There is no connection to keep open: the driver asks every 2 seconds
     (polling) and a failed question is just a failed question.
   - Moonraker keeps its OWN job history (/server/history/list), with the
     real start and end of every print even when the agent was off. So the
     job log is not guessed from status changes, as with Bambu: the
     history is copied into it (see importHistory in jobs.js).

   Read-only on purpose: only GET requests. Nothing here can start, stop
   or change a print.

   Moonraker is plain HTTP, normally without a password inside the home
   network (`trusted_clients`). If the person has turned on an API key,
   it is sent as the X-Api-Key header, and requests never follow
   redirects, so the key can't be handed to another address.
================================================================== */
import { codeError } from '../mqtt.js'

export const MOONRAKER_PORT = 7125

// Asked every 2 s while it works. The printer is on the home network and
// the answer is a few hundred bytes, so this is cheap; slower would make
// the progress bar look stuck.
const POLL_MS = 2_000
// Waits after a failed question: 2 s, 4 s… up to a minute, so a printer
// that's switched off isn't asked every 2 seconds all night.
const BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 32_000, 60_000]
const AUTH_RETRY_MS = 60_000
// A printer that doesn't answer in this time is treated as unreachable.
const REQUEST_TIMEOUT_MS = 5_000
// Nothing Moonraker sends is near this. It stops a wrong device on this
// port (or a hostile one) from making the agent read gigabytes into memory.
const MAX_BODY_BYTES = 2_000_000
// How many past jobs are copied each time. Newer ones are what changes.
const HISTORY_LIMIT = 50

// The Klipper objects the status needs, in one request.
const OBJECTS = 'print_stats&display_status&virtual_sdcard&extruder&heater_bed'

/* ------------------------------------------------------------------
   One HTTP question
------------------------------------------------------------------ */

/* GET a URL and return its parsed JSON. Every failure is a coded error
   (see explain), and none of their messages contains the address.
   `fetch` is built into Node 18+, so there is no dependency. */
export async function getJson(url, { apiKey = null, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  let res
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json', ...(apiKey ? { 'X-Api-Key': apiKey } : {}) },
      // 'manual': a 3xx comes back as a 3xx instead of being followed.
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    // fetch hides the real reason (ECONNREFUSED…) inside err.cause.
    throw codeError(err.name === 'TimeoutError' ? 'TIMEOUT' : err.cause?.code ?? 'FETCH_FAILED', 'request failed')
  }
  // The body is not needed on any failure: free the connection.
  const fail = async (code, message) => {
    await res.body?.cancel().catch(() => {})
    throw codeError(code, message)
  }
  if (res.status >= 300 && res.status < 400) return fail('REDIRECT', 'the printer redirected the request')
  if (res.status === 401 || res.status === 403) return fail('UNAUTHORIZED', 'the printer asked for an API key')
  if (res.status === 503) return fail('KLIPPER_DOWN', 'Moonraker is up but Klipper is not')
  if (!res.ok) return fail('HTTP', `HTTP ${res.status}`)
  if (Number(res.headers.get('content-length')) > MAX_BODY_BYTES) return fail('TOO_BIG', 'the answer is too big')
  const text = await res.text()
  if (text.length > MAX_BODY_BYTES) throw codeError('TOO_BIG', 'the answer is too big')
  try {
    return JSON.parse(text)
  } catch {
    throw codeError('BAD_JSON', 'the answer is not JSON')
  }
}

/* ------------------------------------------------------------------
   Driver
------------------------------------------------------------------ */

/* printer: one entry of the agent's config: id, name, model, host, port, apiKey.
   `get`, `pollMs` and `backoffMs` are parameters so tests can use a fast
   clock and a fake printer. */
export function createMoonrakerDriver(printer, { get = getJson, now = () => new Date(), log = () => {}, onHistory = () => {}, pollMs = POLL_MS, backoffMs = BACKOFF_MS } = {}) {
  const base = `http://${printer.host}:${printer.port}`
  const ask = path => get(`${base}${path}`, { apiKey: printer.apiKey })

  let raw = {} // the last answer of /printer/objects/query
  let updatedAt = null
  let connection = 'connecting'
  let error = null
  let stopped = false
  let wakeUp = null // resolves the current wait early when stop() is called

  /* Copies Moonraker's history into the job log. A failure here must not
     mark the printer offline (its status works), so it only logs. */
  async function refreshHistory() {
    try {
      const res = await ask(`/server/history/list?limit=${HISTORY_LIMIT}&order=desc`)
      const entries = historyToJobs(res?.result?.jobs)
      onHistory(entries)
      return entries
    } catch (err) {
      log(`${printer.name}: could not read the job history (${err.code ?? 'error'})`)
      return null
    }
  }

  async function run() {
    let attempt = 0
    let wasActive = false
    // Pending until it has worked once; also set again when a job was still
    // "in progress" in the history after the printer stopped.
    let needHistory = true
    while (!stopped) {
      let waitMs = pollMs
      try {
        const res = await ask(`/printer/objects/query?${OBJECTS}`)
        const status = res?.result?.status
        if (!status || typeof status !== 'object') throw codeError('BAD_JSON', 'no status in the answer')
        raw = status
        updatedAt = now()
        if (connection !== 'online') log(`${printer.name}: connected`)
        connection = 'online'
        error = null
        attempt = 0

        // The history changes when a print starts or stops, not every 2 seconds.
        const active = isActive(raw.print_stats?.state)
        if (needHistory || active !== wasActive) {
          const entries = await refreshHistory()
          // A print can have ended a moment before Moonraker closed its record:
          // look again next time instead of leaving it open forever.
          needHistory = entries === null || (!active && entries.some(e => e.endedAt === null))
        }
        wasActive = active
      } catch (err) {
        if (stopped) return
        attempt++
        const verdict = explain(err)
        connection = verdict.connection
        error = verdict.message
        log(`${printer.name}: ${err.code ?? err.message}`)
        waitMs = verdict.connection === 'auth-error' ? AUTH_RETRY_MS : backoffMs[Math.min(attempt - 1, backoffMs.length - 1)]
        // Whatever it was doing, the next success re-reads the history.
        needHistory = true
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
      // run() catches every request problem itself; this catch is for a bug in
      // our own code, which must show up on screen and not stop the agent.
      run().catch(err => {
        connection = 'error'
        error = `Internal error in the agent: ${err.message}`
        log(`${printer.name}: ${err.stack}`)
      })
    },
    stop() {
      stopped = true
      wakeUp?.()
    },
    status() {
      return printerStatus(printer, { raw, updatedAt, connection, error })
    },
  }
}

// The usual network failures, in words (only the code, never the address).
const NETWORK_ERRORS = {
  ECONNREFUSED: 'it refused the connection: is it on, and is the port right?',
  TIMEOUT: 'no answer: is it on and on the same network?',
  ETIMEDOUT: 'no answer: is it on and on the same network?',
  EHOSTUNREACH: 'not reachable from this computer',
  ENETUNREACH: 'this computer is not on a network',
  ENOTFOUND: 'that address does not exist',
  ECONNRESET: 'the connection was cut',
}

/* A failed request -> what the person should see. */
export function explain(err) {
  if (err.code === 'UNAUTHORIZED') {
    return { connection: 'auth-error', message: 'Moonraker asked for an API key and refused ours. Check it in the printer’s moonraker.conf, then add the printer again.' }
  }
  if (err.code === 'KLIPPER_DOWN') {
    return { connection: 'error', message: 'Moonraker is running but Klipper is not. Restart the firmware from Mainsail or Fluidd.' }
  }
  if (err.code === 'REDIRECT' || err.code === 'BAD_JSON' || err.code === 'HTTP' || err.code === 'TOO_BIG') {
    return { connection: 'error', message: 'That address answers, but not like Moonraker. Check the port (usually 7125) and that it is the printer’s own address.' }
  }
  return { connection: 'offline', message: `Can’t reach the printer (${NETWORK_ERRORS[err.code] ?? err.code ?? 'connection failed'}). Retrying…` }
}

/* ------------------------------------------------------------------
   Common status (the same shape as Bambu's; see printerStatus in bambu.js)
------------------------------------------------------------------ */

// Klipper's print_stats.state -> our state. Unknown stays 'unknown'.
// Unlike Bambu, Klipper says outright whether a print was cancelled.
const STATES = {
  standby: 'idle',
  printing: 'printing',
  paused: 'paused',
  complete: 'finished',
  cancelled: 'cancelled',
  error: 'failed',
}

const isActive = state => state === 'printing' || state === 'paused'

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/* "/home/pi/gcodes/Phone stand.gcode" -> "Phone stand" */
const fileLabel = filename => (typeof filename === 'string' && filename ? filename.split('/').pop().replace(/\.gcode$/i, '') : null)

/* Pure: the last answer of /printer/objects/query -> the common status. */
export function printerStatus(printer, { raw = {}, updatedAt = null, connection = 'connecting', error = null } = {}) {
  const stats = raw.print_stats ?? {}
  // hasOwn: a plain `STATES['constructor']` would find Object's own method.
  const state = Object.hasOwn(STATES, stats.state) ? STATES[stats.state] : 'unknown'
  // The last result stays visible while idle, as with Bambu.
  const hasJob = ['printing', 'paused', 'finished', 'cancelled', 'failed'].includes(state)
  // display_status follows M73 from the slicer when there is one, and the
  // file position otherwise; virtual_sdcard is that same fallback.
  const progress = num(raw.display_status?.progress) ?? num(raw.virtual_sdcard?.progress)
  const printed = num(stats.print_duration)
  // Time left, estimated from the pace so far: Moonraker has no figure of its own.
  const remainingMinutes = state === 'printing' && progress > 0.01 && progress < 1 && printed > 0
    ? (printed * (1 - progress)) / progress / 60
    : null
  return {
    id: printer.id,
    name: printer.name,
    brand: 'moonraker',
    model: printer.model ?? null,
    connection,
    state: connection === 'online' ? state : 'unknown',
    job: hasJob
      ? {
          id: null,
          name: fileLabel(stats.filename),
          progress: progress === null ? null : Math.min(Math.max(progress, 0), 1),
          remainingMinutes,
          // Only if the slicer calls SET_PRINT_STATS_INFO, which not all do.
          layer: num(stats.info?.current_layer),
          totalLayers: num(stats.info?.total_layer),
        }
      : null,
    temps: { nozzle: num(raw.extruder?.temperature), bed: num(raw.heater_bed?.temperature) },
    printError: null,
    // Klipper's own words for why a print failed ("Heater extruder not heating at expected rate").
    printMessage: state === 'failed' && typeof stats.message === 'string' && stats.message ? stats.message.slice(0, 200) : null,
    updatedAt: updatedAt ? updatedAt.toISOString() : null,
    error,
  }
}

/* ------------------------------------------------------------------
   History -> job log entries
------------------------------------------------------------------ */

// Moonraker's job status -> our outcome. `null` = still printing.
// "interrupted" and "server_exit" mean Moonraker itself stopped, so how the
// print ended is unknown (not a failure of the printer).
const OUTCOMES = {
  completed: 'finished',
  cancelled: 'cancelled',
  error: 'failed',
  klippy_shutdown: 'failed',
  klippy_disconnect: 'failed',
  interrupted: 'unknown',
  server_exit: 'unknown',
  in_progress: null,
}

/* Moonraker's /server/history/list "jobs" -> job log entries (without
   printer id and name, which importHistory adds). Bad entries are dropped. */
export function historyToJobs(jobs) {
  if (!Array.isArray(jobs)) return []
  const entries = []
  for (const j of jobs) {
    if (!j || typeof j !== 'object' || typeof j.job_id !== 'string' || !Object.hasOwn(OUTCOMES, j.status)) continue
    const start = num(j.start_time)
    if (start === null) continue
    const end = num(j.end_time)
    const outcome = OUTCOMES[j.status]
    // A closed job without an end time can't be dated: skip it rather than invent one.
    if (outcome !== null && end === null) continue
    const estimated = num(j.metadata?.estimated_time)
    entries.push({
      id: `moonraker-${j.job_id}`,
      name: fileLabel(j.filename),
      startedAt: new Date(start * 1000).toISOString(),
      // Moonraker wrote the real start down: it is a measurement even if the agent was off.
      startedApprox: false,
      endedAt: outcome === null ? null : new Date(end * 1000).toISOString(),
      outcome,
      estimatedMinutes: estimated !== null && estimated > 0 ? Math.round(estimated / 60) : null,
      // Wall-clock time including pauses, like Bambu's; print_duration leaves them out.
      realMinutes: outcome === null ? null : Math.round((end - start) / 60),
      totalLayers: num(j.metadata?.layer_count),
      printError: null,
    })
  }
  return entries
}

/* ------------------------------------------------------------------
   Probe: used once, when a person adds a printer (setup.js)
------------------------------------------------------------------ */

/* Asks /server/info with the details the person typed. Resolves
   { version, klippyState }; rejects with a coded error. A Moonraker whose
   Klipper is down still counts as found: the person can fix that later. */
export async function probeMoonraker({ host, port = MOONRAKER_PORT, apiKey = null }, { get = getJson } = {}) {
  const info = await get(`http://${host}:${port}/server/info`, { apiKey })
  const result = info?.result
  if (!result || typeof result.moonraker_version !== 'string') throw codeError('BAD_JSON', 'that is not Moonraker')
  return { version: result.moonraker_version, klippyState: typeof result.klippy_state === 'string' ? result.klippy_state : 'unknown' }
}
