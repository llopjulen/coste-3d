/* Tests for drivers/moonraker.js. Run them with:  npm test
   A fake printer (fakeMoonraker.js) answers real HTTP on a throwaway port,
   so the driver's real request code runs. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { createMoonrakerDriver, explain, getJson, historyToJobs, printerStatus, probeMoonraker } from './drivers/moonraker.js'
import { startFakeMoonraker } from './fakeMoonraker.js'
import { moonrakerProbeText } from './setup.js'

const PRINTER = { id: 'k2', name: 'K2 Plus', brand: 'moonraker', model: 'K2 Plus', host: '127.0.0.1', port: 7125, apiKey: null }

/* Polls until check() is true, so tests wait for the driver instead of sleeping a fixed time. */
async function until(check, ms = 3000) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

/* A driver talking to the fake, polling fast. */
function driverFor(fake, { apiKey = null, ...options } = {}) {
  const logs = []
  const histories = []
  const driver = createMoonrakerDriver(
    { ...PRINTER, port: fake.port, apiKey },
    { pollMs: 20, backoffMs: [20, 40], log: m => logs.push(m), onHistory: e => histories.push(e), ...options },
  )
  return { driver, logs, histories }
}

const printing = fake => {
  fake.stats = { state: 'printing', filename: 'gcodes/Phone stand.gcode', print_duration: 1800, message: '', info: { current_layer: 120, total_layer: 300 } }
  fake.display = { progress: 0.25 }
}

test('printerStatus: a Klipper print becomes the common status, with the time left estimated from the pace', () => {
  const raw = {
    print_stats: { state: 'printing', filename: 'gcodes/Phone stand.gcode', print_duration: 1800, info: { current_layer: 120, total_layer: 300 } },
    display_status: { progress: 0.25 }, extruder: { temperature: 220.1 }, heater_bed: { temperature: 59.8 },
  }
  assert.deepEqual(printerStatus(PRINTER, { raw, connection: 'online', updatedAt: new Date('2026-10-28T12:00:00Z') }), {
    id: 'k2', name: 'K2 Plus', brand: 'moonraker', model: 'K2 Plus', connection: 'online', state: 'printing',
    // 25 % in 30 min: 90 min to go.
    job: { id: null, name: 'Phone stand', progress: 0.25, remainingMinutes: 90, layer: 120, totalLayers: 300 },
    temps: { nozzle: 220.1, bed: 59.8 }, printError: null, printMessage: null, updatedAt: '2026-10-28T12:00:00.000Z', error: null,
  })
})

test('printerStatus: states, Klipper\'s own error words, and stale data while offline', () => {
  const s = (print_stats, connection = 'online', extra = {}) => printerStatus(PRINTER, { raw: { print_stats, ...extra }, connection })
  assert.equal(s({ state: 'standby' }).state, 'idle')
  assert.equal(s({ state: 'standby' }).job, null)
  assert.equal(s({ state: 'paused', filename: 'a.gcode' }).state, 'paused')
  assert.equal(s({ state: 'complete', filename: 'a.gcode' }).job.name, 'a')
  // Klipper says outright when a print was cancelled; that is not a failure.
  assert.equal(s({ state: 'cancelled', filename: 'a.gcode' }).state, 'cancelled')
  const failed = s({ state: 'error', filename: 'a.gcode', message: 'Heater extruder not heating at expected rate' })
  assert.equal(failed.state, 'failed')
  assert.equal(failed.printMessage, 'Heater extruder not heating at expected rate')
  assert.equal(s({ state: 'printing', message: 'old message' }).printMessage, null) // only shown for failures
  assert.equal(s({ state: 'something-new' }).state, 'unknown')
  assert.equal(s({ state: 'constructor' }).state, 'unknown') // not Object's own method
  assert.equal(s({ state: 'printing' }, 'offline').state, 'unknown')
  // No M73 from the slicer: the file position is used. Nothing known: no bar, no time left.
  assert.equal(s({ state: 'printing', print_duration: 600 }, 'online', { virtual_sdcard: { progress: 0.5 } }).job.progress, 0.5)
  const unknown = s({ state: 'printing' })
  assert.equal(unknown.job.progress, null)
  assert.equal(unknown.job.remainingMinutes, null)
})

test('printerStatus: never contains the address or the API key', () => {
  const printer = { ...PRINTER, host: '192.168.7.77', apiKey: 'secretkey1234567' }
  const text = JSON.stringify(printerStatus(printer, { raw: { print_stats: { state: 'printing' } }, connection: 'online' }))
  for (const secret of [printer.host, printer.apiKey]) assert.equal(text.includes(secret), false, secret)
})

test('historyToJobs: Moonraker\'s statuses become outcomes, and a measured start stays measured', () => {
  const job = (job_id, status, extra = {}) => ({
    job_id, status, filename: 'models/Stand.gcode', start_time: 1_793_000_000, end_time: 1_793_005_700,
    metadata: { estimated_time: 5400, layer_count: 300 }, ...extra,
  })
  const [done, cancelled, errored, shutdown, interrupted, running] = historyToJobs([
    job('A1', 'completed'), job('A2', 'cancelled'), job('A3', 'error'), job('A4', 'klippy_shutdown'),
    job('A5', 'interrupted'), job('A6', 'in_progress', { end_time: null }),
  ])
  assert.deepEqual(done, {
    id: 'moonraker-A1', name: 'Stand', startedAt: new Date(1_793_000_000_000).toISOString(), startedApprox: false,
    endedAt: new Date(1_793_005_700_000).toISOString(), outcome: 'finished', estimatedMinutes: 90, realMinutes: 95, totalLayers: 300, printError: null,
  })
  assert.deepEqual([cancelled, errored, shutdown, interrupted].map(j => j.outcome), ['cancelled', 'failed', 'failed', 'unknown'])
  assert.equal(running.outcome, null)
  assert.equal(running.endedAt, null)
  assert.equal(running.realMinutes, null)
})

test('historyToJobs: garbage is dropped, not turned into jobs', () => {
  const good = { job_id: 'A1', status: 'completed', filename: 'a.gcode', start_time: 1_793_000_000, end_time: 1_793_000_600 }
  assert.deepEqual(historyToJobs(undefined), [])
  assert.deepEqual(historyToJobs('nope'), [])
  const jobs = historyToJobs([
    null, 'x', { ...good, job_id: 7 }, { ...good, status: 'victory' }, { ...good, status: 'constructor' },
    { ...good, start_time: 'yesterday' }, { ...good, end_time: null }, // closed without an end: can't be dated
    good,
  ])
  assert.deepEqual(jobs.map(j => j.id), ['moonraker-A1'])
  assert.equal(historyToJobs([{ ...good, metadata: { estimated_time: -5 } }])[0].estimatedMinutes, null)
})

test('the driver reports a running print, with temperatures, and copies the history', async () => {
  const fake = await startFakeMoonraker()
  printing(fake)
  fake.history = [{ job_id: 'B1', status: 'in_progress', filename: 'gcodes/Phone stand.gcode', start_time: 1_793_000_000, end_time: null, metadata: { estimated_time: 7200 } }]
  const { driver, histories } = driverFor(fake)
  try {
    driver.start()
    await until(() => driver.status().connection === 'online')
    const status = driver.status()
    assert.equal(status.state, 'printing')
    assert.equal(status.job.name, 'Phone stand')
    assert.equal(status.job.remainingMinutes, 90)
    assert.equal(status.temps.nozzle, 24.5)
    await until(() => histories.length > 0)
    assert.equal(histories[0][0].id, 'moonraker-B1')
    assert.equal(histories[0][0].estimatedMinutes, 120)
  } finally {
    driver.stop()
    await fake.close()
  }
})

test('the history is read again when a print ends, not on every poll', async () => {
  const fake = await startFakeMoonraker()
  printing(fake)
  const { driver, histories } = driverFor(fake)
  const historyCalls = () => fake.requests.filter(r => r.url.startsWith('/server/history')).length
  try {
    driver.start()
    await until(() => historyCalls() === 1)
    await new Promise(resolve => setTimeout(resolve, 150)) // many polls go by
    assert.equal(historyCalls(), 1)

    fake.stats = { ...fake.stats, state: 'complete' }
    fake.history = [{ job_id: 'B2', status: 'completed', filename: 'a.gcode', start_time: 1_793_000_000, end_time: 1_793_003_600 }]
    await until(() => historyCalls() === 2)
    await until(() => histories.at(-1)?.[0]?.outcome === 'finished')
  } finally {
    driver.stop()
    await fake.close()
  }
})

test('a job still "in progress" right after the print ended is looked at again', async () => {
  const fake = await startFakeMoonraker()
  fake.stats = { state: 'complete', filename: 'a.gcode' }
  // Moonraker hasn't closed the record yet when the driver first looks.
  fake.history = [{ job_id: 'B3', status: 'in_progress', filename: 'a.gcode', start_time: 1_793_000_000, end_time: null }]
  const { driver, histories } = driverFor(fake)
  try {
    driver.start()
    await until(() => histories.length >= 1)
    fake.history = [{ job_id: 'B3', status: 'completed', filename: 'a.gcode', start_time: 1_793_000_000, end_time: 1_793_003_600 }]
    await until(() => histories.at(-1)[0].outcome === 'finished')
  } finally {
    driver.stop()
    await fake.close()
  }
})

test('the API key is sent as X-Api-Key, and a wrong one is reported without retrying fast', async () => {
  const fake = await startFakeMoonraker({ apiKey: 'goodkey12345678' })
  const good = driverFor(fake, { apiKey: 'goodkey12345678' })
  const bad = driverFor(fake, { apiKey: 'wrongkey1234567' })
  try {
    good.driver.start()
    await until(() => good.driver.status().connection === 'online')
    assert.equal(fake.requests.at(-1).headers['x-api-key'], 'goodkey12345678')
    good.driver.stop()

    bad.driver.start()
    await until(() => bad.driver.status().connection === 'auth-error')
    assert.match(bad.driver.status().error, /API key/)
    assert.equal(JSON.stringify(bad.driver.status()).includes('wrongkey'), false)
  } finally {
    good.driver.stop()
    bad.driver.stop()
    await fake.close()
  }
})

test('Klipper down is told apart from the printer being off', async () => {
  const fake = await startFakeMoonraker()
  fake.klippyDown = true
  const { driver } = driverFor(fake)
  try {
    driver.start()
    await until(() => driver.status().connection === 'error')
    assert.match(driver.status().error, /Klipper is not/)
    // Klipper comes back: the driver recovers by itself.
    fake.klippyDown = false
    await until(() => driver.status().connection === 'online')
    assert.equal(driver.status().error, null)
  } finally {
    driver.stop()
    await fake.close()
  }
})

test('a printer that is switched off is "offline" and the driver reconnects when it is back', async () => {
  const fake = await startFakeMoonraker()
  const { port } = fake
  const { driver } = driverFor(fake)
  try {
    driver.start()
    await until(() => driver.status().connection === 'online')
    await fake.close()
    await until(() => driver.status().connection === 'offline')
    const status = driver.status()
    assert.match(status.error, /Can’t reach the printer/)
    assert.equal(status.state, 'unknown') // the last numbers may be old
    assert.equal(status.error.includes('127.0.0.1'), false) // never the address
    assert.equal(status.error.includes(String(port)), false)
  } finally {
    driver.stop()
  }
})

test('stop() ends the loop at once, even in a long wait', async () => {
  const fake = await startFakeMoonraker()
  const { driver } = driverFor(fake, { pollMs: 60_000 })
  try {
    driver.start()
    await until(() => driver.status().connection === 'online')
    const before = fake.requests.length
    driver.stop()
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(fake.requests.length, before)
  } finally {
    await fake.close()
  }
})

test('getJson: redirects are not followed (the API key must not travel to another address)', async () => {
  const other = await startFakeMoonraker()
  const fake = await startFakeMoonraker()
  fake.redirectTo = `http://127.0.0.1:${other.port}/server/info`
  try {
    await assert.rejects(getJson(`http://127.0.0.1:${fake.port}/server/info`, { apiKey: 'secretkey1234567' }), { code: 'REDIRECT' })
    assert.equal(other.requests.length, 0)
  } finally {
    await fake.close()
    await other.close()
  }
})

test('getJson: an answer over the size limit is refused', async () => {
  const fake = await startFakeMoonraker()
  fake.bigBody = true
  try {
    await assert.rejects(getJson(`http://127.0.0.1:${fake.port}/x`), { code: 'TOO_BIG' })
  } finally {
    await fake.close()
  }
})

test('getJson: a device that does not answer in time is a TIMEOUT', async () => {
  const sockets = new Set()
  // Accepts the connection and never answers.
  const silent = net.createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
  await new Promise(resolve => silent.listen(0, '127.0.0.1', resolve))
  try {
    await assert.rejects(getJson(`http://127.0.0.1:${silent.address().port}/x`, { timeoutMs: 100 }), { code: 'TIMEOUT' })
  } finally {
    for (const socket of sockets) socket.destroy() // close() waits for every connection to end
    await new Promise(resolve => silent.close(resolve))
  }
})

test('explain: each failure says what to do', () => {
  assert.equal(explain({ code: 'UNAUTHORIZED' }).connection, 'auth-error')
  assert.equal(explain({ code: 'KLIPPER_DOWN' }).connection, 'error')
  assert.match(explain({ code: 'BAD_JSON' }).message, /7125/)
  assert.equal(explain({ code: 'ECONNREFUSED' }).connection, 'offline')
  assert.match(explain({ code: 'SOMETHING_ELSE' }).message, /SOMETHING_ELSE/)
})

test('probeMoonraker: finds Moonraker, reports Klipper\'s state, and rejects what is not Moonraker', async () => {
  const fake = await startFakeMoonraker()
  try {
    assert.deepEqual(await probeMoonraker({ host: '127.0.0.1', port: fake.port }), { version: 'v0.9.3-test', klippyState: 'ready' })
    fake.klippyDown = true
    assert.equal((await probeMoonraker({ host: '127.0.0.1', port: fake.port })).klippyState, 'disconnected') // found, Klipper off
    const keyed = await startFakeMoonraker({ apiKey: 'goodkey12345678' })
    await assert.rejects(probeMoonraker({ host: '127.0.0.1', port: keyed.port }), { code: 'UNAUTHORIZED' })
    assert.equal((await probeMoonraker({ host: '127.0.0.1', port: keyed.port, apiKey: 'goodkey12345678' })).version, 'v0.9.3-test')
    await keyed.close()
    await assert.rejects(probeMoonraker({ host: '127.0.0.1', port: fake.port }, { get: async () => ({ hello: 'world' }) }), { code: 'BAD_JSON' })
  } finally {
    await fake.close()
  }
})

test('moonrakerProbeText: each failure says what to check', () => {
  assert.match(moonrakerProbeText({ code: 'UNAUTHORIZED' }, { port: 7125 }), /API key/)
  assert.match(moonrakerProbeText({ code: 'KLIPPER_DOWN' }, { port: 7125 }), /Restart the firmware/)
  assert.match(moonrakerProbeText({ code: 'BAD_JSON' }, { port: 8080 }), /port 8080/)
  assert.match(moonrakerProbeText({ code: 'ECONNREFUSED' }, { port: 7125 }), /port 7125/)
})
