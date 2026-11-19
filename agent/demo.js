/* ==================================================================
   DEMO — two pretend printers, to see the whole printer side working
   without owning one:   npm run agent -- demo

   Why: the real drivers (Bambu over MQTT, Klipper over Moonraker) are
   covered by tests against fake printers, but nobody could SEE the
   Printers tab, the print history and "Use real data" fill up without a
   real printer next to them. The demo plugs simulated drivers into the
   REAL agent: the same HTTP handler, the same job log (jobs.js), the same
   rules for what counts as a failure. Only the printers are invented.
   Useful for trying a PR, for screenshots and videos, and for showing it
   to someone.

   It never touches the person's real setup: everything lives in a
   temporary folder (LAYERCENTS_HOME), deleted when the demo stops, and it
   seeds that folder with three weeks of past jobs so the statistics have
   something to show from the first second.

   Time runs fast (DEMO_SPEED): a "2 h" print takes one real minute, so a
   whole cycle (prepare, print, finish or fail, rest) can be watched live.
================================================================== */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JOBS_VERSION } from './jobs.js'

// Simulated minutes per real second: 2 h of printing in one minute.
export const DEMO_SPEED = 2

// Two printers, one per protocol the agent speaks, so both badges show.
export const DEMO_PRINTERS = [
  { id: 'demo-p1s', name: 'P1S (demo)', brand: 'bambu', model: 'P1S', jobs: ['Soporte de móvil', 'Llavero logo', 'Maceta geométrica'], minutes: 120, startIn: 2 },
  { id: 'demo-voron', name: 'Voron 2.4 (demo)', brand: 'moonraker', model: 'Voron 2.4', jobs: ['Pieza de recambio', 'Caja de herramientas', 'Engranaje'], minutes: 90, startIn: 40 },
]

/* One simulated printer. `speed` = simulated minutes per real second.
   `failEvery` = every how many prints one fails (the 3rd, the 6th…), so
   the failure rate looks like a real workshop's, deterministically. */
export function createDemoDriver(printer, { onStatus = () => {}, speed = DEMO_SPEED, tickMs = 1000, failEvery = 4, now = () => new Date() } = {}) {
  let timer = null
  let phase = 'idle'      // idle | preparing | printing | finished | failed
  let phaseLeft = printer.startIn ?? 3 // simulated minutes left in the current phase (staggered: the two don't move in step)
  let count = 0           // prints started
  let progress = 0
  let total = printer.minutes

  const status = () => {
    const hasJob = phase !== 'idle'
    return {
      id: printer.id,
      name: printer.name,
      brand: printer.brand,
      model: printer.model,
      connection: 'online',
      state: phase,
      job: hasJob
        ? {
            id: `${printer.id}-job-${count}`,
            name: `${printer.jobs[(count - 1) % printer.jobs.length]}.gcode`,
            progress,
            // Real prints run a bit longer than the slicer says: the printer
            // promises total / 1.08, so "Use real data" has something to find.
            remainingMinutes: phase === 'printing' || phase === 'preparing' ? Math.max(Math.round((total / 1.08) * (1 - progress)), 0) : 0,
            layer: Math.round(progress * 240),
            totalLayers: 240,
          }
        : null,
      temps: {
        nozzle: phase === 'printing' ? 220 : phase === 'preparing' ? 180 : 28,
        bed: phase === 'printing' || phase === 'preparing' ? 60 : 26,
      },
      printError: phase === 'failed' ? 50348044 : null,
      printMessage: phase === 'failed' && printer.brand === 'moonraker' ? 'Demo: filament runout' : null,
      updatedAt: now().toISOString(),
      error: null,
    }
  }

  function step() {
    const minutes = speed * (tickMs / 1000)
    phaseLeft -= minutes
    if (phase === 'printing') {
      progress = Math.min(progress + minutes / total, 1)
      // This print fails halfway through.
      if (count % failEvery === 0 && progress >= 0.5) { phase = 'failed'; phaseLeft = 20 }
      else if (progress >= 1) { phase = 'finished'; phaseLeft = 20 }
    } else if (phaseLeft <= 0) {
      if (phase === 'finished' || phase === 'failed') {
        phase = 'idle'      // rest, with the result already recorded
        phaseLeft = 10
      } else if (phase === 'idle') {
        count++
        progress = 0
        total = printer.minutes
        phase = 'preparing'
        phaseLeft = 6
      } else if (phase === 'preparing') {
        phase = 'printing'
      }
    }
    onStatus(status())
  }

  return {
    start() {
      onStatus(status())
      timer = setInterval(step, tickMs)
    },
    stop() { clearInterval(timer) },
    status,
  }
}

/* Three weeks of past jobs, so the history and "Use real data" have
   enough prints from the start (jobStats.MIN_PRINTS is 5). Real time is
   8 % over the estimate and 3 out of 20 fail. Same shape as jobs.js writes. */
export function seedJobs(now = new Date()) {
  const jobs = []
  for (let i = 0; i < 20; i++) {
    const printer = DEMO_PRINTERS[i % 2]
    const start = new Date(now.getTime() - (21 - i) * 86_400_000 + 9 * 3_600_000)
    const estimated = printer.minutes - 20 + (i % 5) * 10
    const failed = i % 7 === 3
    const real = failed ? Math.round(estimated * 0.45) : Math.round(estimated * 1.08)
    jobs.push({
      id: `${printer.id}-${start.getTime()}`,
      printerId: printer.id,
      printerName: printer.name,
      name: `${printer.jobs[i % printer.jobs.length]}.gcode`,
      startedAt: start.toISOString(),
      startedApprox: false,
      endedAt: new Date(start.getTime() + real * 60_000).toISOString(),
      outcome: failed ? 'failed' : 'finished',
      estimatedMinutes: estimated,
      realMinutes: real,
      totalLayers: 240,
      printError: failed ? 50348044 : null,
      key: `seed-${i}`,
    })
  }
  return jobs
}

/* The job log's clock in the demo. jobs.js measures a print with the
   clock (end − start), so with the real clock a "2 h" demo print would be
   recorded as one minute and spoil the statistics. This clock runs as fast
   as the simulated printers (`speed` simulated minutes per real second)
   and starts four days in the past: at 2 simulated minutes per second, a
   demo of up to about 45 minutes still writes dates that have already happened. */
export function demoClock({ speed = DEMO_SPEED, start = Date.now(), backdateMs = 4 * 86_400_000 } = {}) {
  return () => new Date(start - backdateMs + (Date.now() - start) * speed * 60)
}

/* A throwaway LAYERCENTS_HOME with the seeded job log. Returns its path and
   a function that deletes it. */
export async function prepareDemoHome() {
  const home = await mkdtemp(join(tmpdir(), 'layercents-demo-'))
  await writeFile(join(home, 'jobs.json'), JSON.stringify({ version: JOBS_VERSION, jobs: seedJobs() }), { mode: 0o600 })
  return { home, cleanup: () => rm(home, { recursive: true, force: true }) }
}
