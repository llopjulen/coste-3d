import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from './i18n/context.js'
import { lineFromQuote, isDay } from './orders.js'
import { dayStart, suggestDue } from './schedule.js'
import { fmtLongDay } from './i18n/format.js'

/* ==================================================================
   NEW ORDER — who, which parts, when.

   The parts come from the quotes already saved in History: they carry the
   price and cost the calculator worked out, so an order is a few taps,
   not retyping numbers. Anything else (assembly, a rush fee) is added as a
   free line in the order itself.

   The client is typed with suggestions from the customer cards (<datalist>):
   an existing name links to its card; a new name creates one (useOrders).
   `preset` lets History open this with parts already ticked.
================================================================== */
export default function NewOrderDialog({ quotes, customers, orders = [], weekHours, formatMoney, preset = [], onCreate, onClose }) {
  const { t, locale } = useI18n()
  const ref = useRef(null)
  const [client, setClient] = useState(() => preset[0]?.client ?? '')
  // quote id -> quantity, for the ticked parts.
  const [picked, setPicked] = useState(() => new Map(preset.map(q => [q.id, q.units ?? 1])))
  const [dueAt, setDueAt] = useState('')
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    const close = () => onClose()
    dialog.addEventListener('close', close)
    return () => { dialog.removeEventListener('close', close); if (dialog.open) dialog.close() }
  }, [onClose])

  // Newest first, only quotes that can be priced (old ones without a price can't).
  const list = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return [...quotes]
      .filter(x => Number.isFinite(x.price))
      .filter(x => !q || `${x.name ?? ''} ${x.client ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => b.id - a.id)
  }, [quotes, filter])

  const toggle = q => setPicked(current => {
    const next = new Map(current)
    if (next.has(q.id)) next.delete(q.id)
    else next.set(q.id, q.units ?? 1)
    return next
  })
  const setQty = (id, qty) => setPicked(current => new Map(current).set(id, qty))

  // Through lineFromQuote, so it rounds the prices exactly as the order will:
  // the number here must be the one the order then shows, to the cent.
  const total = [...picked].reduce((s, [id, qty]) => {
    const l = lineFromQuote(quotes.find(q => q.id === id), qty)
    return s + l.unitPrice * l.qty
  }, 0)

  // When could it be ready? The end of the print queue plus these parts
  // (schedule.js). Offered, not imposed: the date agreed with the client wins.
  const pickedLines = [...picked].map(([id, qty]) => lineFromQuote(quotes.find(q => q.id === id), qty))
  const suggested = suggestDue(orders, pickedLines, { weekHours })

  const submit = async e => {
    e.preventDefault()
    if (!client.trim() && picked.size === 0) { setError(t('neworder.err.empty')); return }
    if (dueAt && !isDay(dueAt)) { setError(t('neworder.err.date')); return }
    const lines = [...picked].map(([id, qty]) => lineFromQuote(quotes.find(q => q.id === id), qty))
    const customer = customers.find(c => c.name.toLowerCase() === client.trim().toLowerCase())
    setBusy(true)
    const order = await onCreate({ customerId: customer?.id ?? null, customerName: client, lines, dueAt: dueAt || null })
    setBusy(false)
    if (!order) setError(t('orders.err.save'))
  }

  return (
    <dialog ref={ref} className="sheet sheet-wide" aria-labelledby="neworder-title">
      <form onSubmit={submit} noValidate>
        <h2 id="neworder-title">{t('neworder.title')}</h2>

        <div className="sheet-group">
          <label className="sheet-row">
            <span>{t('neworder.client')}</span>
            <input className="wide-right" type="text" list="customer-names" value={client} maxLength={80}
              placeholder={t('neworder.clientPh')} onChange={e => { setClient(e.target.value); setError('') }} />
          </label>
          <label className="sheet-row">
            <span>{t('neworder.due')}</span>
            <input type="date" value={dueAt} onChange={e => setDueAt(e.target.value)} />
          </label>
        </div>
        {suggested && suggested !== dueAt && (
          <p className="muted sheet-note">
            {t('neworder.suggest', { date: fmtLongDay(locale, dayStart(suggested)) })}{' '}
            <button type="button" className="link" onClick={() => setDueAt(suggested)}>{t('neworder.useSuggest')}</button>
          </p>
        )}

        {/* Outside the group: between two rows it would break the `.sheet-row + .sheet-row` separator. */}
        <datalist id="customer-names">
          {customers.map(c => <option key={c.id} value={c.name} />)}
        </datalist>

        <h3 className="sheet-section">{t('neworder.parts')}</h3>
        {quotes.length > 6 && (
          <input className="text-input sheet-filter" type="search" value={filter} placeholder={t('neworder.filter')}
            aria-label={t('neworder.filter')} onChange={e => setFilter(e.target.value)} />
        )}
        <div className="sheet-group pick-list">
          {list.length === 0 && <p className="muted pick-empty">{quotes.length ? t('neworder.noMatch') : t('neworder.noQuotes')}</p>}
          {list.map(q => {
            const on = picked.has(q.id)
            return (
              <div className={`pick-row${on ? ' on' : ''}`} key={q.id}>
                <label className="pick-main">
                  <input type="checkbox" checked={on} onChange={() => toggle(q)} />
                  <span className="pick-name">
                    {q.name ?? t('save.untitled')}
                    {q.client && <span className="muted"> · {q.client}</span>}
                  </span>
                  <span className="muted pick-price">{formatMoney(q.price)}</span>
                </label>
                {on && (
                  <label className="pick-qty">
                    <span className="sr-only">{t('order.qty')}</span>
                    ×<input type="number" min="1" step="1" value={picked.get(q.id)}
                      onChange={e => setQty(q.id, Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
                  </label>
                )}
              </div>
            )
          })}
        </div>
        <p className="muted sheet-note">
          {picked.size ? t('neworder.summary', { n: picked.size, total: formatMoney(total) }) : t('neworder.hint')}
        </p>
        {error && <p className="import-error" role="alert">{error}</p>}

        <div className="sheet-actions">
          <button type="button" className="controls" onClick={() => ref.current.close()}>{t('sale.cancel')}</button>
          <button type="submit" className="controls primary" disabled={busy}>{t('neworder.create')}</button>
        </div>
      </form>
    </dialog>
  )
}
