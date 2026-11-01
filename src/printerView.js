/* ==================================================================
   PRINTER VIEW — how a printer's status is put into words.

   Pure functions (no React), so they're tested on their own
   (printerView.test.js). The status comes from the agent in the same
   shape for every brand: see printerStatus in agent/drivers/bambu.js.
================================================================== */

/* Texts live in src/i18n/ (keys printers.state.*, printers.conn.*, printers.time.*,
   printers.detail.*). These functions are pure and don't import React, so they
   receive the translator `t` from the caller (useI18n) and tests can pass a
   real one built with translate(). */

// What the printer is doing -> its translation key. 'unknown' shows a dash:
// better than guessing. A state from a future agent falls back to 'unknown'.
export const STATE_KEYS = {
  idle: 'printers.state.idle',
  preparing: 'printers.state.preparing',
  printing: 'printers.state.printing',
  paused: 'printers.state.paused',
  finished: 'printers.state.finished',
  cancelled: 'printers.state.cancelled',
  failed: 'printers.state.failed',
  unknown: 'printers.state.unknown',
}

// How the agent's connection to the printer is going.
export const CONNECTION_KEYS = {
  online: 'printers.conn.online',
  connecting: 'printers.conn.connecting',
  offline: 'printers.conn.offline',
  'auth-error': 'printers.conn.auth-error',
  error: 'printers.conn.error',
}

/* The badge text: the state if the printer is online, otherwise how the
   connection is. Object.hasOwn so a value like "constructor" from the agent
   can't pick something off the prototype. */
export function badgeText(printer, t) {
  if (printer.connection === 'online') {
    return t(Object.hasOwn(STATE_KEYS, printer.state) ? STATE_KEYS[printer.state] : STATE_KEYS.unknown)
  }
  return Object.hasOwn(CONNECTION_KEYS, printer.connection) ? t(CONNECTION_KEYS[printer.connection]) : String(printer.connection)
}

/* 75 -> "1 h 15 min", 45 -> "45 min", 120 -> "2 h". Null if there's no number. */
export function fmtMinutes(minutes, t) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) return null
  if (minutes < 1) return t('printers.time.lessThanMinute')
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return t('printers.time.min', { m })
  return m === 0 ? t('printers.time.h', { h }) : t('printers.time.hMin', { h, m })
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
export function detailLine(printer, t) {
  const parts = []
  const { job, temps } = printer
  if (job && Number.isFinite(job.layer) && Number.isFinite(job.totalLayers) && job.totalLayers > 0) parts.push(t('printers.detail.layer', { layer: job.layer, total: job.totalLayers }))
  if (Number.isFinite(temps?.nozzle)) parts.push(t('printers.detail.nozzle', { value: Math.round(temps.nozzle) }))
  if (Number.isFinite(temps?.bed)) parts.push(t('printers.detail.bed', { value: Math.round(temps.bed) }))
  return parts.join(' · ')
}
