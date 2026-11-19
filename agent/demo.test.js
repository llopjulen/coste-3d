/* Tests for agent/demo.js: the simulated printers and the seeded history. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEMO_PRINTERS, createDemoDriver, demoClock, prepareDemoHome, seedJobs } from './demo.js'
import { checkJob, openJobLog } from './jobs.js'
import { summarize } from '../src/jobStats.js'

test('the seeded history is valid for jobs.js and gives the statistics something to show', () => {
  const jobs = seedJobs(new Date('2026-11-04T10:00:00Z'))
  assert.equal(jobs.length, 20)
  for (const j of jobs) assert.ok(checkJob(j), `${j.id} must pass checkJob`)
  const sum = summarize(jobs, { now: new Date('2026-11-04T10:00:00Z'), days: 30 })
  assert.ok(sum.failureRate > 0 && sum.failureRate < 0.3, `failure rate ${sum.failureRate}`)
  assert.ok(Math.abs(sum.estimateError - 0.08) < 0.02, `estimate error ${sum.estimateError}`)
})

test('a simulated printer goes through prepare, print, finish and fail, and the real job log records it', async () => {
  const home = await mkdtemp(join(tmpdir(), 'lc-demo-test-'))
  try {
    const log = await openJobLog({ env: { LAYERCENTS_HOME: home } })
    const states = new Set()
    // Very fast: 400 simulated minutes per tick of 5 ms, one failure every 2 prints.
    const driver = createDemoDriver(DEMO_PRINTERS[0], {
      speed: 80_000, tickMs: 5, failEvery: 2,
      onStatus: s => { states.add(s.state); log.observe(s) },
    })
    driver.start()
    await new Promise(r => setTimeout(r, 400))
    driver.stop()
    await log.flush()
    for (const s of ['idle', 'preparing', 'printing', 'finished', 'failed']) assert.ok(states.has(s), `saw ${s}`)
    const outcomes = log.list().map(j => j.outcome)
    assert.ok(outcomes.includes('finished') && outcomes.includes('failed'), outcomes.join(','))
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('the status has the common shape and no secrets', () => {
  const s = createDemoDriver(DEMO_PRINTERS[1]).status()
  for (const key of ['id', 'name', 'brand', 'connection', 'state', 'temps', 'updatedAt']) assert.ok(key in s, key)
  const text = JSON.stringify(s)
  for (const secret of ['accessCode', 'serial', 'host', 'fingerprint']) assert.ok(!text.includes(secret), secret)
})

test('the demo folder is temporary and is removed', async () => {
  const { home, cleanup } = await prepareDemoHome()
  assert.ok(home.includes('layercents-demo-'))
  await cleanup()
  await assert.rejects(import('node:fs/promises').then(fs => fs.access(home)))
})

test('the demo clock runs at the printers\' speed and starts in the past', async () => {
  const start = Date.now()
  const clock = demoClock({ speed: 60, start })
  const a = clock()
  assert.ok(a.getTime() < start - 3 * 86_400_000, 'starts days back')
  await new Promise(r => setTimeout(r, 100))
  // 100 ms real at 60 simulated minutes per second = 6 simulated minutes.
  const gainedMinutes = (clock() - a) / 60_000
  assert.ok(gainedMinutes > 4 && gainedMinutes < 12, `${gainedMinutes}`)
})
