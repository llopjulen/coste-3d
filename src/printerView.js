/* ==================================================================
   PRINTER VIEW — how a printer's status is put into words.

   Pure functions (no React), so they're tested on their own
   (printerView.test.js). The status comes from the agent in the same
   shape for every brand: see printerStatus in agent/drivers/bambu.js.
================================================================== */

// What the printer is doing. 'unknown' shows a dash: better than guessing.
export const STATE_LABELS = {
  idle: 'Idle',
  preparing: 'Preparing',
  printing: 'Printing',
  paused: 'Paused',
  finished: 'Finished',
  failed: 'Failed',
  unknown: '—',
}

// How the agent's connection to the printer is going.
export const CONNECTION_LABELS = {
  online: 'Online',
  connecting: 'Connecting…',
  offline: 'Offline',
  'auth-error': 'Access code refused',
  error: 'Needs attention',
}

/* 75 -> "1 h 15 min", 45 -> "45 min", 120 -> "2 h". Null if there's no number. */
export function fmtMinutes(minutes) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) return null
  if (minutes < 1) return 'less than a minute'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/* 0.423 -> 42. Null if unknown, so the bar isn't drawn at a made-up 0 %. */
export function percent(progress) {
  return typeof progress === 'number' && Number.isFinite(progress) ? Math.round(Math.min(Math.max(progress, 0), 1) * 100) : null
}

/* One word for the badge colour (index.css): gold while working, red when
   something failed, grey when we can't tell. Only from fields the agent
   sends, so a new state from a future agent falls back to grey. */
export function tone(printer) {
  if (printer.connection === 'auth-error' || printer.connection === 'error') return 'bad'
  if (printer.connection !== 'online') return 'muted'
  if (printer.state === 'failed') return 'bad'
  if (printer.state === 'printing' || printer.state === 'preparing' || printer.state === 'paused') return 'busy'
  return 'ok'
}

/* The small line under the job: layer and temperatures, only what's known. */
export function detailLine(printer) {
  const parts = []
  const { job, temps } = printer
  if (job && Number.isFinite(job.layer) && Number.isFinite(job.totalLayers) && job.totalLayers > 0) parts.push(`Layer ${job.layer} of ${job.totalLayers}`)
  if (Number.isFinite(temps?.nozzle)) parts.push(`Nozzle ${Math.round(temps.nozzle)} °C`)
  if (Number.isFinite(temps?.bed)) parts.push(`Bed ${Math.round(temps.bed)} °C`)
  return parts.join(' · ')
}
