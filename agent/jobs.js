/* ==================================================================
   JOB LOG — every print the agent has seen, saved on this computer.

   Why it exists: a Bambu printer keeps no history. Once a job is over,
   the printer forgets it. If the agent writes down when each job starts
   and how it ends, the web app can later compare what was QUOTED with
   what really happened (time, failures), instead of guessing.

   How it works: every status the driver produces goes through
   observe(). A job is a small state machine per printer:

       (no job) --printing/paused--> OPEN --finished--> closed "finished"
                                          --failed----> closed "failed"
                                          --idle-----> closed "unknown"
                                          --other job-> closed "unknown", new one opens

   "unknown" means: the job disappeared and we didn't see how it ended
   (the agent was off, the printer was reset). It is never presented as
   a success or a failure.

   Principle: a guess is never shown as a measurement. If the agent
   starts while a print is already running, the start time is estimated
   from the printer's own progress and flagged `startedApprox`; such a
   job gets no `realMinutes`, so it can't pollute "quoted vs real".

   Where: ~/.layercents/jobs.json (same folder and permissions as the
   printer list; see config.js). Only the common status is used, so the
   file never holds access codes, serials or IP addresses.
================================================================== */
import { readFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { configDir, writePrivateJson } from './config.js'

export const JOBS_VERSION = 1

// Old closed jobs beyond this many are dropped (open ones never are).
// 5 000 jobs is years of printing for a small shop and a file of ~1 MB.
const MAX_JOBS = 5_000

// What GET /jobs returns at most, newest first.
export const LIST_LIMIT = 500

// A "preparing" state older than this is not the start of the job that
// begins now (the person walked away and started something else).
const PREPARE_WINDOW_MS = 30 * 60_000

export function jobsPath(env = process.env) {
  return join(configDir(env), 'jobs.json')
}

const OUTCOMES = new Set(['finished', 'failed', 'unknown'])

/* One entry of the file -> a clean copy, or null if it isn't a job.
   The file can be edited by hand, so every field is checked on load. */
export function checkJob(j) {
  if (!j || typeof j !== 'object') return null
  const started = Date.parse(j.startedAt)
  if (typeof j.id !== 'string' || typeof j.printerId !== 'string' || Number.isNaN(started)) return null
  const ended = j.endedAt === null ? null : Date.parse(j.endedAt)
  if (ended !== null && Number.isNaN(ended)) return null
  if (ended !== null && !OUTCOMES.has(j.outcome)) return null
  const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null)
  const number = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return {
    id: j.id,
    printerId: j.printerId,
    printerName: text(j.printerName, 60) ?? j.printerId,
    name: text(j.name, 200),
    startedAt: new Date(started).toISOString(),
    startedApprox: j.startedApprox === true,
    endedAt: ended === null ? null : new Date(ended).toISOString(),
    outcome: ended === null ? null : j.outcome,
    estimatedMinutes: number(j.estimatedMinutes),
    realMinutes: number(j.realMinutes),
    totalLayers: number(j.totalLayers),
    printError: number(j.printError),
    // Saved, so that after a restart a different job isn't mistaken for the one that was open.
    key: text(j.key, 200),
  }
}

/* The key that tells two jobs apart: the printer's own job id when it
   gives one, the file name otherwise. null = unknown, which matches
   anything (better to keep one job open than to invent a second). */
const jobKey = job => job?.id || job?.name || null
const sameJob = (open, status) => {
  const b = jobKey(status.job)
  return open.key === null || b === null || open.key === b
}

/* Opens the log: reads the file and returns the object the agent uses.
   env / now / log are parameters so tests can use a temporary folder and
   a clock they control. */
export async function openJobLog({ env = process.env, now = () => new Date(), log = () => {} } = {}) {
  const file = jobsPath(env)
  const jobs = await load(file, log)
  // printerId -> when we first saw it "preparing" without an open job
  const preparing = new Map()
  let saving = Promise.resolve()

  /* Saves in the background, one write at a time: two overlapping writes
     would fight over the same temporary file. Errors are logged, never
     thrown: an unhandled rejection stops a Node program, and a full disk
     must not take the live status down with it. */
  function save() {
    saving = saving
      .then(() => {
        // Closed jobs beyond the cap are dropped, oldest first.
        const closed = jobs.filter(j => j.endedAt !== null)
        for (let i = 0; i < closed.length - MAX_JOBS; i++) jobs.splice(jobs.indexOf(closed[i]), 1)
        return writePrivateJson(file, { version: JOBS_VERSION, jobs }, env)
      })
      .catch(err => log(`Could not save the job log: ${err.message}`))
    return saving
  }

  function close(job, outcome, at, status) {
    job.endedAt = at.toISOString()
    job.outcome = outcome
    // Measured only if we saw the start and the real end; pauses count as printing time.
    job.realMinutes = outcome !== 'unknown' && !job.startedApprox
      ? Math.round((at - Date.parse(job.startedAt)) / 60_000)
      : null
    if (outcome === 'failed') job.printError = status.printError ?? null
  }

  function start(status, at) {
    const { job: info } = status
    const progress = info?.progress ?? 0
    const remaining = info?.remainingMinutes ?? null
    // Seen from the beginning (or nearly): the start is real.
    const live = progress < 0.01
    let startedAt = at
    let estimatedMinutes = null
    if (live) {
      // Counting from "preparing" when we saw it, because the printer's
      // time estimate includes heating and calibration too.
      const since = preparing.get(status.id)
      if (since && at - since < PREPARE_WINDOW_MS) startedAt = since
      if (remaining !== null) estimatedMinutes = Math.round(remaining + (at - startedAt) / 60_000)
    } else if (remaining !== null && progress < 1) {
      // Already running when the agent noticed: total ≈ remaining / (1 − progress),
      // and the start was `elapsed` ago. An estimate, flagged as one.
      const total = remaining / (1 - progress)
      estimatedMinutes = Math.round(total)
      startedAt = new Date(at - total * progress * 60_000)
    }
    const job = {
      id: `${status.id}-${startedAt.getTime()}`,
      printerId: status.id,
      printerName: status.name,
      name: info?.name ?? null,
      startedAt: startedAt.toISOString(),
      startedApprox: !live,
      endedAt: null,
      outcome: null,
      estimatedMinutes,
      realMinutes: null,
      totalLayers: info?.totalLayers ?? null,
      printError: null,
      key: jobKey(info),
    }
    jobs.push(job)
    preparing.delete(status.id)
    return job
  }

  return {
    /* Feed it every status a driver produces. Cheap: it only touches the
       disk when a job starts or ends, not on every progress update. */
    observe(status) {
      // Offline data may be old: wait for the printer to talk again.
      if (status.connection !== 'online') return
      const at = now()
      const open = jobs.find(j => j.printerId === status.id && j.endedAt === null)
      let dirty = false

      if (status.state === 'preparing') {
        if (!open && !preparing.has(status.id)) preparing.set(status.id, at)
      } else if (status.state === 'printing' || status.state === 'paused') {
        if (open && !sameJob(open, status)) {
          close(open, 'unknown', at, status) // another job replaced it and we didn't see the end
          start(status, at)
          dirty = true
        } else if (!open) {
          start(status, at)
          dirty = true
        } else {
          // Same job still running: refresh what may have been unknown at the start, in memory only.
          open.key ??= jobKey(status.job)
          open.totalLayers = status.job?.totalLayers ?? open.totalLayers
        }
      } else if (open && (status.state === 'finished' || status.state === 'failed')) {
        close(open, status.state, at, status)
        dirty = true
      } else if (open && status.state === 'idle') {
        close(open, 'unknown', at, status)
        dirty = true
      }
      // Anything that isn't "preparing" cancels the preparing timer.
      if (status.state !== 'preparing') preparing.delete(status.id)
      if (dirty) save()
    },

    /* Newest first. A copy: the caller can't change the log by accident. */
    list({ limit = LIST_LIMIT } = {}) {
      // `key` is bookkeeping for the log itself; the web app has no use for it.
      return jobs.slice(-limit).reverse().map(({ key: _key, ...job }) => job)
    },

    /* Resolves when everything pending is on disk (Ctrl+C waits for this). */
    flush: () => saving,
  }
}

/* Reads the file. A missing one is a normal first run. A broken one is
   moved aside instead of overwritten: the agent starts clean, but nothing
   the person might want to repair by hand is destroyed. */
async function load(file, log) {
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
  let data
  try {
    data = JSON.parse(text)
  } catch {
    const aside = `${file}.broken-${Date.now()}`
    await rename(file, aside)
    log(`jobs.json was not valid JSON. Kept as ${aside}; starting an empty log.`)
    return []
  }
  const jobs = []
  let skipped = 0
  for (const entry of Array.isArray(data?.jobs) ? data.jobs : []) {
    const job = checkJob(entry)
    if (job) jobs.push(job)
    else skipped++
  }
  if (skipped) log(`Skipped ${skipped} damaged entr${skipped === 1 ? 'y' : 'ies'} in ${file}.`)
  // Oldest first, so appending keeps the order and list() can slice the end.
  return jobs.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
}

/* An empty log, for when the agent runs without one (and for tests). */
export const NO_JOBS = { observe() {}, list: () => [], flush: () => Promise.resolve() }
