/* ==================================================================
   SCHEDULE — when each order will be printed, from the print queue.

   Works on ORDERS (orders.js) since 2026-11-04; before, an order was a
   state of one saved quote. Each line of an order carries its printer
   hours per good part (failed prints included, ÷ (1 − failure rate)), so
   an order needs Σ hours × qty. The printer works `printHoursPerWeek`
   hours a week, so it gets through that many / 7 a day.

   Only orders still to print are queued: 'pending' and 'printing'. A
   'ready' order is already printed: it shows on its delivery day but
   takes no printer time.

   Orders are queued by delivery date, earliest first (EDF, "earliest
   deadline first"): with one machine and deadlines, it's the order that
   misses the fewest of them when any order at all can make it. Orders
   without a date go last, oldest first. Each one is ready when the hours
   of everything before it, plus its own, are done.

   It's an estimate for planning, not a promise: it assumes the printer
   only does these orders and works the same hours every day.
================================================================== */
import { orderTotals } from './orders.js'

const DAY = 86_400_000
const finite = v => typeof v === 'number' && Number.isFinite(v)
const TO_PRINT = ['pending', 'printing']

export const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v))

/* A local date -> "YYYY-MM-DD", the format the calendar and <input type=date> use. */
export function dayKey(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* "YYYY-MM-DD" -> that day at local midnight. */
export const dayStart = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d) }

/* Printer hours a list of lines needs, or null if none of them knows its
   time (free lines, very old quotes). */
export function linesHours(lines) {
  return orderTotals({ lines, payments: [], shipping: 0, discount: 0, fees: 0 }).hours
}

/* The orders still to print, in queue order, each with when it should be
   ready: [{ order, hours, startHours, readyAt (Date|null), dueAt (Date|null), late }]. */
export function planOrders(orders, { weekHours, today = new Date() } = {}) {
  const perDay = finite(weekHours) && weekHours > 0 ? weekHours / 7 : null
  const start = dayStart(dayKey(today))
  const queue = orders
    .filter(o => TO_PRINT.includes(o.status))
    .sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || a.number - b.number)
  let queued = 0
  return queue.map(order => {
    const hours = orderTotals(order).hours
    const startHours = queued
    if (hours !== null) queued += hours
    // Day n of the queue: today counts as day 1 when anything is printed today.
    const readyAt = perDay === null || hours === null
      ? null
      : new Date(start.getTime() + Math.max(Math.ceil(queued / perDay) - 1, 0) * DAY)
    const dueAt = isDay(order.dueAt) ? dayStart(order.dueAt) : null
    return { order, hours, startHours, readyAt, dueAt, late: Boolean(readyAt && dueAt && readyAt > dueAt) }
  })
}

/* The delivery date to suggest for a new order made of `lines`: the day it
   would be ready if it joined the end of the queue. Null when it can't be
   worked out (no printing hours set, or no line knows its time). */
export function suggestDue(orders, lines, { weekHours, today = new Date() } = {}) {
  const hours = linesHours(lines)
  if (!(finite(weekHours) && weekHours > 0) || hours === null) return null
  const queued = planOrders(orders, { weekHours, today }).reduce((s, p) => s + (p.hours ?? 0), 0) + hours
  const days = Math.max(Math.ceil(queued / (weekHours / 7)) - 1, 0)
  return dayKey(new Date(dayStart(dayKey(today)).getTime() + days * DAY))
}

/* Everything that happens on each day, for the month grid:
   { 'YYYY-MM-DD': [{ kind: 'due' | 'ready' | 'paid', order, amount? }] }.
   'due'   delivery agreed with the client, for orders not yet delivered;
   'ready' when the queue says it'll be printed (only if a different day);
   'paid'  each payment received, on its day. Cancelled orders show nothing. */
export function eventsByDay(orders, plan) {
  const out = {}
  const add = (key, item) => { (out[key] ??= []).push(item) }
  for (const o of orders) {
    if (o.status === 'cancelled') continue
    if (o.status !== 'delivered' && isDay(o.dueAt)) add(o.dueAt, { kind: 'due', order: o })
    for (const p of o.payments) add(p.at, { kind: 'paid', order: o, amount: p.amount })
  }
  for (const p of plan) {
    if (p.readyAt && !(p.dueAt && dayKey(p.readyAt) === dayKey(p.dueAt))) add(dayKey(p.readyAt), { kind: 'ready', order: p.order })
  }
  return out
}
