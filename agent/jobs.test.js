/* Tests for jobs.js. Run them with:  npm test
   A fake clock drives the log, and each test uses its own temporary
   LAYERCENTS_HOME, so the real ~/.layercents is never touched. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { jobsPath, openJobLog } from './jobs.js'

/* A fresh home plus a clock the test moves by hand. */
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'layercents-jobs-'))
  const env = { LAYERCENTS_HOME: dir }
  const clock = { t: Date.parse('2026-10-28T10:00:00Z') }
  const at = minutes => { clock.t = Date.parse('2026-10-28T10:00:00Z') + minutes * 60_000 }
  const logs = []
  const open = () => openJobLog({ env, now: () => new Date(clock.t), log: m => logs.push(m) })
  return { dir, env, at, logs, open, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

/* A common status (see printerStatus in drivers/bambu.js) with only what the log reads. */
const status = (state, { connection = 'online', job = {}, printError = null, id = 'p1s' } = {}) => ({
  id, name: 'P1S', connection, state, printError,
  job: ['idle', 'unknown'].includes(state) ? null : { id: null, name: 'Phone stand', progress: 0, remainingMinutes: 90, layer: 0, totalLayers: 300, ...job },
})

test('a job seen from its start is measured: start, end and real minutes', async () => {
  const t = setup()
  try {
    const log = await t.open()
    t.at(0); log.observe(status('printing'))
    t.at(50); log.observe(status('printing', { job: { progress: 0.5, remainingMinutes: 45 } }))
    t.at(95); log.observe(status('finished'))
    const [job] = log.list()
    assert.equal(job.name, 'Phone stand')
    assert.equal(job.outcome, 'finished')
    assert.equal(job.startedApprox, false)
    assert.equal(job.estimatedMinutes, 90)
    assert.equal(job.realMinutes, 95)
    assert.equal(job.startedAt, '2026-10-28T10:00:00.000Z')
    assert.equal(job.endedAt, '2026-10-28T11:35:00.000Z')
    assert.equal('key' in job, false) // bookkeeping stays inside the log
  } finally { t.cleanup() }
})

test('the clock starts at "preparing" when it was seen, because the estimate includes heating', async () => {
  const t = setup()
  try {
    const log = await t.open()
    t.at(0); log.observe(status('preparing'))
    t.at(6); log.observe(status('printing', { job: { remainingMinutes: 84 } }))
    t.at(90); log.observe(status('finished'))
    const [job] = log.list()
    assert.equal(job.startedAt, '2026-10-28T10:00:00.000Z')
    assert.equal(job.estimatedMinutes, 90) // 84 left + 6 already spent preparing
    assert.equal(job.realMinutes, 90)
  } finally { t.cleanup() }
})

test('a "preparing" from long ago is not the start of this job', async () => {
  const t = setup()
  try {
    const log = await t.open()
    t.at(0); log.observe(status('preparing'))
    t.at(120); log.observe(status('printing'))
    assert.equal(log.list()[0].startedAt, '2026-10-28T12:00:00.000Z')
  } finally { t.cleanup() }
})

test('a print already running when the agent starts is flagged as estimated and gets no real time', async () => {
  const t = setup()
  try {
    const log = await t.open()
    // 40 % done with 60 min left: about 100 min in total, 40 already spent.
    t.at(0); log.observe(status('printing', { job: { progress: 0.4, remainingMinutes: 60 } }))
    t.at(60); log.observe(status('finished'))
    const [job] = log.list()
    assert.equal(job.startedApprox, true)
    assert.equal(job.estimatedMinutes, 100)
    assert.equal(job.startedAt, '2026-10-28T09:20:00.000Z')
    assert.equal(job.realMinutes, null)
    assert.equal(job.outcome, 'finished')
  } finally { t.cleanup() }
})

test('a failed job keeps the printer\'s error code', async () => {
  const t = setup()
  try {
    const log = await t.open()
    t.at(0); log.observe(status('printing'))
    t.at(30); log.observe(status('failed', { printError: 50348044 }))
    const [job] = log.list()
    assert.equal(job.outcome, 'failed')
    assert.equal(job.printError, 50348044)
    assert.equal(job.realMinutes, 30)
  } finally { t.cleanup() }
})

test('FINISH is kept by the printer for hours: it must not create or re-close jobs', async () => {
  const t = setup()
  try {
    const log = await t.open()
    t.at(0); log.observe(status('finished')) // agent starts after a print ended
    t.at(5); log.observe(status('finished'))
    assert.deepEqual(log.list(), [])
    t.at(10); log.observe(status('printing'))
    t.at(40); log.observe(status('finished'))
    t.at(500); log.observe(status('finished'))
    assert.equal(log.list().length, 1)
    assert.equal(log.list()[0].endedAt, '2026-10-28T10:40:00.000Z') // closed once, at the first FINISH
  } finally { t.cleanup() }
})

test('while the printer is offline nothing changes; the job stays open and finishes later', async () => {
  const t = setup()
  try {
    const log = await t.open()
    t.at(0); log.observe(status('printing'))
    t.at(20); log.observe(status('unknown', { connection: 'offline' }))
    t.at(25); log.observe(status('idle', { connection: 'offline' }))
    assert.equal(log.list()[0].endedAt, null)
    t.at(80); log.observe(status('finished'))
    assert.equal(log.list()[0].outcome, 'finished')
  } finally { t.cleanup() }
})

test('a job that vanishes (idle) or is replaced by another one ends as "unknown", never as a success', async () => {
  const t = setup()
  try {
    const log = await t.open()
    t.at(0); log.observe(status('printing'))
    t.at(10); log.observe(status('idle'))
    t.at(20); log.observe(status('printing', { job: { id: '1', name: 'A' } }))
    t.at(30); log.observe(status('printing', { job: { id: '2', name: 'B' } })) // A's end was never seen
    t.at(40); log.observe(status('finished', { job: { id: '2', name: 'B' } }))
    const outcomes = log.list().map(j => [j.name, j.outcome, j.realMinutes])
    assert.deepEqual(outcomes, [['B', 'finished', 10], ['A', 'unknown', null], ['Phone stand', 'unknown', null]])
  } finally { t.cleanup() }
})

test('every printer has its own job', async () => {
  const t = setup()
  try {
    const log = await t.open()
    t.at(0); log.observe(status('printing', { id: 'a' })); log.observe(status('printing', { id: 'b' }))
    t.at(30); log.observe(status('finished', { id: 'a' }))
    const byPrinter = Object.fromEntries(log.list().map(j => [j.printerId, j.outcome]))
    assert.deepEqual(byPrinter, { a: 'finished', b: null })
  } finally { t.cleanup() }
})

test('the log survives a restart, and a different job after the restart is not mistaken for the open one', async () => {
  const t = setup()
  try {
    const first = await t.open()
    t.at(0); first.observe(status('printing', { job: { id: '10', name: 'Old job' } }))
    await first.flush()

    // Agent restarted: same job still running.
    const second = await t.open()
    assert.equal(second.list().length, 1)
    t.at(30); second.observe(status('finished', { job: { id: '10', name: 'Old job' } }))
    assert.equal(second.list()[0].outcome, 'finished')
    assert.equal(second.list()[0].realMinutes, 30)
    await second.flush()

    // Another restart, with a job open that finished while the agent was off:
    // a new print is running when it comes back.
    const third = await t.open()
    t.at(40); third.observe(status('printing', { job: { id: '11', name: 'Job two' } }))
    await third.flush()
    const fourth = await t.open()
    t.at(100); fourth.observe(status('printing', { job: { id: '12', name: 'Job three' } }))
    const list = fourth.list()
    assert.deepEqual(list.map(j => [j.name, j.outcome]), [['Job three', null], ['Job two', 'unknown'], ['Old job', 'finished']])
  } finally { t.cleanup() }
})

test('the file is private and has no secrets in it', async () => {
  const t = setup()
  try {
    const log = await t.open()
    t.at(0); log.observe(status('printing'))
    await log.flush()
    if (process.platform !== 'win32') assert.equal(statSync(jobsPath(t.env)).mode & 0o777, 0o600)
    const text = readFileSync(jobsPath(t.env), 'utf8')
    for (const word of ['accessCode', 'serial', 'host', 'fingerprint']) assert.equal(text.includes(word), false, word)
    assert.deepEqual(readdirSync(t.dir), ['jobs.json']) // no temporary file left behind
  } finally { t.cleanup() }
})

test('damaged entries are skipped and reported; the rest of the log loads', async () => {
  const t = setup()
  try {
    const good = { id: 'x-1', printerId: 'x', printerName: 'X', name: 'ok', startedAt: '2026-10-01T10:00:00Z', endedAt: '2026-10-01T11:00:00Z', outcome: 'finished', realMinutes: 60 }
    writeFileSync(jobsPath(t.env), JSON.stringify({ version: 1, jobs: [good, { id: 'bad' }, null, { ...good, id: 'x-2', outcome: 'victory' }, { ...good, id: 'x-3', startedAt: 'yesterday' }] }))
    const log = await t.open()
    assert.deepEqual(log.list().map(j => j.id), ['x-1'])
    assert.match(t.logs.join('\n'), /Skipped 4 damaged entries/)
  } finally { t.cleanup() }
})

test('a file that is not JSON is moved aside, not overwritten', async () => {
  const t = setup()
  try {
    writeFileSync(jobsPath(t.env), '{ this is not json')
    const log = await t.open()
    assert.deepEqual(log.list(), [])
    const files = readdirSync(t.dir)
    assert.equal(files.length, 1)
    assert.match(files[0], /^jobs\.json\.broken-\d+$/)
    assert.equal(readFileSync(join(t.dir, files[0]), 'utf8'), '{ this is not json')
  } finally { t.cleanup() }
})

test('a save that fails is logged, not thrown, and the log keeps working in memory', async () => {
  const t = setup()
  try {
    const log = await t.open()
    // Replace the home folder by a plain file: creating jobs.json inside it fails every time.
    rmSync(t.dir, { recursive: true, force: true })
    writeFileSync(t.dir, 'not a folder')
    t.at(0); log.observe(status('printing'))
    await log.flush() // must resolve, not reject
    assert.match(t.logs.join('\n'), /Could not save the job log/)
    assert.equal(log.list().length, 1)
  } finally { t.cleanup() }
})

test('list returns newest first and respects the limit', async () => {
  const t = setup()
  try {
    const log = await t.open()
    for (let i = 0; i < 3; i++) {
      t.at(i * 100); log.observe(status('printing', { job: { id: String(i), name: `job ${i}` } }))
      t.at(i * 100 + 10); log.observe(status('finished', { job: { id: String(i), name: `job ${i}` } }))
    }
    assert.deepEqual(log.list().map(j => j.name), ['job 2', 'job 1', 'job 0'])
    assert.deepEqual(log.list({ limit: 2 }).map(j => j.name), ['job 2', 'job 1'])
  } finally { t.cleanup() }
})
