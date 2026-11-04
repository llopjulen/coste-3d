/* ==================================================================
   SCHEDULE — when each order will be ready, from the print queue.

   Every open order (status 'order', see sales.js) needs printer hours:
   hours per part × parts, plus the prints that fail (÷ (1 − failure
   rate), the same rule as capacity() in calculate.js). The printer works
   `printHoursPerWeek` hours a week, so it gets through that many / 7 a day.

   Orders are queued by delivery date, earliest first (EDF, "earliest
   deadline first"): with one machine and deadlines, it's the order that
   misses the fewest of them when any order at all can make it. Orders
   without a date go last, in the order they were accepted. Each one is
   ready when the hours of everything before it, plus its own, are done.

   It's an estimate for planning, not a promise: it assumes the printer
   only does these orders and works the same hours every day.
================================================================== */
import { statusOf, unitsOf } from './sales.js'

const DAY = 86_400_000
const finite = v => typeof v === 'number' && Number.isFinite(v)

export const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v))

/* A local date -> "YYYY-MM-DD", the format the calendar and <input type=date> use. */
export function dayKey(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* "YYYY-MM-DD" -> that day at local midnight. */
export const dayStart = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d) }

/* Printer hours an order needs, failed prints included. Null if the quote
   was saved without the form data (very old quotes). */
export function orderHours(q) {
  const i = q?.inputs
  if (!i || !finite(i.hours) || i.hours <= 0) return null
  const ok = 1 - Math.min(Math.max(finite(i.failRate) ? i.failRate : 0, 0) / 100, 0.95)
  return (i.hours * unitsOf(q)) / ok
}

/* The open orders in queue order, each with when it should be ready:
   [{ quote, hours, startHours, readyAt (Date), dueAt (Date|null), late }].
   `today` is where the queue starts; `weekHours` the printer's hours a week. */
export function planOrders(quotes, { weekHours, today = new Date() } = {}) {
  const perDay = finite(weekHours) && weekHours > 0 ? weekHours / 7 : null
  const start = dayStart(dayKey(today))
  const open = quotes
    .filter(q => statusOf(q) === 'order')
    .sort((a, b) => {
      const da = isDay(a.dueAt) ? a.dueAt : '9999', db = isDay(b.dueAt) ? b.dueAt : '9999'
      return da < db ? -1 : da > db ? 1 : (a.orderedAt ?? '').localeCompare(b.orderedAt ?? '') || a.id - b.id
    })
  let queued = 0
  return open.map(q => {
    const hours = orderHours(q)
    const startHours = queued
    if (hours !== null) queued += hours
    // Day n of the queue: today counts as day 1 when anything is printed today.
    const readyAt = perDay === null || hours === null
      ? null
      : new Date(start.getTime() + Math.max(Math.ceil(queued / perDay) - 1, 0) * DAY)
    const dueAt = isDay(q.dueAt) ? dayStart(q.dueAt) : null
    return { quote: q, hours, startHours, readyAt, dueAt, late: Boolean(readyAt && dueAt && readyAt > dueAt) }
  })
}

/* The delivery date to suggest for a quote that is about to become an
   order: the day it would be ready if it joined the end of the queue. */
export function suggestDue(quotes, quote, { weekHours, today = new Date() } = {}) {
  const others = quotes.filter(q => q.id !== quote.id)
  const plan = planOrders([...others, { ...quote, status: 'order', dueAt: undefined, orderedAt: '9999' }], { weekHours, today })
  const mine = plan.find(p => p.quote.id === quote.id)
  return mine?.readyAt ? dayKey(mine.readyAt) : dayKey(new Date(dayStart(dayKey(today)).getTime() + 7 * DAY))
}

/* Everything that happens on each day, for the month grid:
   { 'YYYY-MM-DD': [{ kind: 'due' | 'ready' | 'sold', quote }] }.
   'due' = the delivery date agreed with the client; 'ready' = when the
   queue says it'll be printed (only when it's a different day); 'sold'. */
export function eventsByDay(quotes, plan) {
  const out = {}
  const add = (key, kind, quote) => { (out[key] ??= []).push({ kind, quote }) }
  for (const q of quotes) {
    const s = statusOf(q)
    if (s === 'sold') add(dayKey(q.sale.soldAt), 'sold', q)
    if (s !== 'quote' && isDay(q.dueAt)) add(q.dueAt, 'due', q)
  }
  for (const p of plan) {
    if (p.readyAt && !(p.dueAt && dayKey(p.readyAt) === dayKey(p.dueAt))) add(dayKey(p.readyAt), 'ready', p.quote)
  }
  return out
}
