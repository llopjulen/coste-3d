/* ==================================================================
   SALES — LEGACY since 2026-11-04: orders.js replaced this.

   Kept because quotes saved before orders existed (and backup files people
   already downloaded) still carry `status` and `sale`. backup.js validates
   them with these functions, and migrateQuoteOrders (orders.js) turns them
   into orders. Nothing on screen edits them any more.

   What it was: what happened to each quote after it was saved.

   A saved quote moves through three states:
     'quote'  -> sent to the client, nothing decided yet
     'order'  -> the client said yes; it's being printed
     'sold'   -> delivered and paid, with what was REALLY charged
   A sold quote carries `sale`: { amount, fees, channel, soldAt }.
     amount  money received from the buyer for the whole order (EUR)
     fees    what the platform or payment took from it (EUR)
     channel where it was sold ("Etsy", "Wallapop", "Direct"…), free text
     soldAt  the day it was sold (ISO date)
   Money is stored in EUR like every other amount in the app; the screen
   converts it to the chosen currency.

   Why this matters: the calculator says what a part SHOULD cost and sell
   for; this says what really happened (discounts, a lower price agreed on
   Wallapop, a different fee). The real profit per sale is the number a
   business actually lives on.

   Backwards compatible: quotes saved before this have neither field and
   are simply 'quote'. No migration, no new BACKUP_SCHEMA_VERSION.
================================================================== */

export const STATUSES = ['quote', 'order', 'sold']

const finite = v => typeof v === 'number' && Number.isFinite(v)
const isDate = v => typeof v === 'string' && Number.isFinite(Date.parse(v))
const round2 = n => Math.round(n * 100) / 100

export const orderTotalOf = q => (finite(q?.orderTotal) ? q.orderTotal : finite(q?.price) ? q.price : 0)
export const unitsOf = q => (Number.isSafeInteger(q?.units) && q.units >= 1 ? q.units : 1)

/* The state of a quote. A quote with a sale but no status (a hand-edited
   file) counts as sold; anything unknown is a plain quote. */
export function statusOf(q) {
  if (STATUSES.includes(q?.status)) return q.status === 'sold' && !q.sale ? 'order' : q.status
  return q?.sale ? 'sold' : 'quote'
}

/* Any value -> a clean `sale`, or null if it can't be one. Used when the
   person saves the form and when a backup is restored. */
export function normalizeSale(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (!finite(raw.amount) || raw.amount < 0) return null
  return {
    amount: round2(raw.amount),
    fees: finite(raw.fees) && raw.fees >= 0 ? round2(Math.min(raw.fees, raw.amount)) : 0,
    channel: typeof raw.channel === 'string' ? raw.channel.trim().slice(0, 40) : '',
    soldAt: isDate(raw.soldAt) ? raw.soldAt : new Date(0).toISOString(),
  }
}

/* What the "Mark as sold" form starts with: the quoted total, the fee the
   quote was priced with, and today. The person corrects what changed. */
export function defaultSale(q, now = new Date()) {
  const amount = round2(orderTotalOf(q))
  const fee = finite(q?.inputs?.fee) ? Math.min(Math.max(q.inputs.fee, 0), 95) : 0
  return { amount, fees: round2(amount * fee / 100), channel: '', soldAt: now.toISOString().slice(0, 10) }
}

/* Real profit of a sale: what was received, minus the fees, minus what the
   parts cost to make (cost per part × parts). Null if it isn't sold. */
export function saleProfit(q) {
  if (statusOf(q) !== 'sold') return null
  const cost = finite(q.cost) ? q.cost : 0
  return round2(q.sale.amount - q.sale.fees - cost * unitsOf(q))
}

/* The quote with its new state. Moving away from 'sold' drops the sale:
   a sale that didn't happen must not count in the totals. */
export function withStatus(q, status, sale = null) {
  if (!STATUSES.includes(status)) return q
  const next = { ...q, status }
  if (status === 'sold') {
    const clean = normalizeSale(sale)
    if (!clean) return q
    next.sale = clean
  } else {
    delete next.sale
  }
  // Back to a plain quote: it's no longer an order, so it has no delivery date.
  if (status === 'quote') {
    delete next.dueAt
    delete next.orderedAt
  }
  return next
}

/* The quote as an accepted order, with the delivery date agreed with the
   client ("YYYY-MM-DD", or null for none). `orderedAt` remembers when it
   was accepted (kept if it already was an order), which breaks ties in the
   print queue (schedule.js). The date stays when the order is later sold:
   it's when it was delivered. */
export function withOrder(q, dueAt, now = new Date()) {
  const next = withStatus(q, 'order')
  next.orderedAt = q.orderedAt ?? now.toISOString()
  if (typeof dueAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dueAt)) next.dueAt = dueAt
  else delete next.dueAt
  return next
}

/* Totals for the screen: how many in each state and, for the sold ones,
   revenue, fees, profit and real margin (profit / revenue). The quoted
   total of the sold ones is there too, to show the gap between what was
   quoted and what was charged. */
export function salesSummary(quotes) {
  const count = { quote: 0, order: 0, sold: 0 }
  let revenue = 0, fees = 0, profit = 0, quoted = 0
  for (const q of quotes) {
    const s = statusOf(q)
    count[s]++
    if (s !== 'sold') continue
    revenue += q.sale.amount
    fees += q.sale.fees
    profit += saleProfit(q)
    quoted += orderTotalOf(q)
  }
  return {
    count,
    revenue: round2(revenue),
    fees: round2(fees),
    profit: round2(profit),
    quoted: round2(quoted),
    margin: revenue > 0 ? profit / revenue : null,
    // Of the quotes that got an answer (order or sold), how many came in:
    // here simply sold + order over everything, since lost quotes are deleted.
    won: quotes.length ? (count.order + count.sold) / quotes.length : null,
  }
}
