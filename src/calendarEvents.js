/* ==================================================================
   CALENDAR EVENTS — things the person writes into the calendar by hand.

   Everything else in the calendar is worked out from the saved quotes
   (deliveries, the print queue, sales). These are the rest of a workshop's
   week: "buy PETG", "pick-up at 17:00", "craft fair". Stored on their own
   key (`calendarEvents`) and inside the backup file.

   Shape of one event:
     { id: string, date: 'YYYY-MM-DD', title: string,
       time?: 'HH:MM', note?: string }
   Same two-layer split as backup.js: pure functions first (Node tests),
   then the only code that touches localStorage, with `storage` injectable.
================================================================== */
import { isDay } from './schedule.js'

export const EVENTS_KEY = 'calendarEvents'

// Limits so a pasted novel or a tampered backup can't fill the ~5 MB of
// localStorage: a calendar line, a short note, a few years of entries.
export const MAX_TITLE = 120
export const MAX_NOTE = 500
export const MAX_EVENTS = 2000

// 24-hour clock, what <input type="time"> gives: "09:30", "17:00".
const isTime = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)

/* One event -> a clean copy, or null if it can't be shown.
   Same rule as sanitizeQuote: required fields (id, date, title) missing
   -> unusable; optional ones of the wrong type are dropped. Text is
   trimmed and cut to its limit instead of rejected: a long title is still
   the person's data. */
export function sanitizeEvent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (typeof raw.id !== 'string' || !raw.id || raw.id.length > 64) return null
  if (!isDay(raw.date)) return null
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, MAX_TITLE) : ''
  if (!title) return null
  const event = { id: raw.id, date: raw.date, title }
  if (isTime(raw.time)) event.time = raw.time
  if (typeof raw.note === 'string' && raw.note.trim()) event.note = raw.note.trim().slice(0, MAX_NOTE)
  return event
}

/* A list -> valid events only, one per id (the first wins), in date order.
   Anything that isn't an array is "no events". */
export function sanitizeEvents(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const out = []
  for (const item of raw) {
    const e = sanitizeEvent(item)
    if (!e || seen.has(e.id)) continue
    seen.add(e.id)
    out.push(e)
    if (out.length >= MAX_EVENTS) break
  }
  return sortEvents(out)
}

/* Date, then time (an event without time goes first: "all day"), then
   title. Dates and times are compared as text: 'YYYY-MM-DD' and 'HH:MM'
   sort correctly that way, without building Date objects. */
export function sortEvents(list) {
  return [...list].sort((a, b) =>
    a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title))
}

/* Union by id for a "merge" restore. Events CAN be edited (unlike quotes),
   so the same id with different content is the same event edited on one
   side: this browser's version wins, the same "fill in, never overwrite"
   rule as business details and setup. */
export function mergeEvents(current, incoming) {
  const byId = new Map(incoming.map(e => [e.id, e]))
  for (const e of current) byId.set(e.id, e)
  return sortEvents([...byId.values()]).slice(0, MAX_EVENTS)
}

/* Adds or replaces (same id) one event. Returns the new list, or the same
   list if the event isn't valid. */
export function upsertEvent(list, raw) {
  const e = sanitizeEvent(raw)
  if (!e) return list
  return sortEvents([...list.filter(x => x.id !== e.id), e])
}

export const removeEvent = (list, id) => list.filter(e => e.id !== id)

/* 'YYYY-MM-DD' -> events of that day. */
export function eventsOnDay(list, day) {
  return list.filter(e => e.date === day)
}

/* A new id. randomUUID exists in every browser that runs this app over
   HTTPS or localhost; the fallback is only for an odd environment, and
   collisions there would need two events in the same millisecond. */
export function newEventId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/* ------------------------------------------------------------------
   Storage. `storage` is looked up inside the try: merely reading
   window.localStorage throws in some privacy modes.
------------------------------------------------------------------ */

export function readEvents(storage) {
  try {
    return sanitizeEvents(JSON.parse((storage ?? globalThis.localStorage).getItem(EVENTS_KEY)))
  } catch {
    return []
  }
}

/* Returns false when storage is blocked or full: the calendar keeps the
   event on screen, it just won't survive a reload, and the screen says so. */
export function writeEvents(list, storage) {
  try {
    const store = storage ?? globalThis.localStorage
    if (list.length) store.setItem(EVENTS_KEY, JSON.stringify(list))
    else store.removeItem(EVENTS_KEY)
    return true
  } catch {
    return false
  }
}
