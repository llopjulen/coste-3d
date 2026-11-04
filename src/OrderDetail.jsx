import { useEffect, useRef, useState } from 'react'
import { useI18n } from './i18n/context.js'
import { fmtDateTime, fmtDay, fmtNumber } from './i18n/format.js'
import {
  ORDER_STATUSES, PAYMENT_METHODS, addPayment, editOrder, formatOrderNumber, freeLine, isDay, lineFromQuote,
  orderTotals, removePayment, setStatus, today,
} from './orders.js'
import { CommitText, MoneyInput, PaymentPill, QtyInput, StatusPill } from './OrderParts.jsx'

/* ==================================================================
   ORDER DETAIL — one order, everything about it, on one page.

   Grouped lists as in iOS Settings, top to bottom in the order things
   happen: where it is (status), who and when, what (parts), how much,
   what has been paid, notes, and what happened (history).

   Every change goes through the pure functions of orders.js (setStatus,
   editOrder, addPayment…), which return a new order with its history
   event; `onChange` hands it to the store. So the rules (what can be
   edited, what gets logged) live in one tested place, not in the JSX.
================================================================== */
const FLOW = ORDER_STATUSES.filter(s => s !== 'cancelled')
const day = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d) }

export default function OrderDetail({ order, customers, quotes, formatMoney, currency, rate, onChange, onDelete, onBack, onOpenCustomer }) {
  const { t, locale } = useI18n()
  const totals = orderTotals(order)
  const [paying, setPaying] = useState(false)
  const [adding, setAdding] = useState('')
  const edit = patch => onChange(editOrder(order, patch))
  const editLine = (id, patch) => edit({ lines: order.lines.map(l => (l.id === id ? { ...l, ...patch } : l)) })
  const cancelled = order.status === 'cancelled'
  const late = !cancelled && order.status !== 'delivered' && order.dueAt && order.dueAt < today()

  const addPart = value => {
    setAdding('')
    if (value === 'free') return edit({ lines: [...order.lines, freeLine({ name: t('order.freeLine'), unitPrice: 0 })] })
    const q = quotes.find(x => String(x.id) === value)
    if (q) edit({ lines: [...order.lines, lineFromQuote(q)] })
  }

  const remove = () => {
    if (window.confirm(t('order.deleteConfirm', { n: formatOrderNumber(order.number) }))) onDelete(order.id)
  }

  return (
    <main className="wrap order-detail">
      <button type="button" className="back-link" onClick={onBack}>‹ {t('orders.title')}</button>
      <header className="order-head">
        <div>
          <h1>{t('order.heading', { n: formatOrderNumber(order.number) })}</h1>
          <p className="subtitle">
            {order.customerName || t('order.noClient')} · {t('order.created', { date: fmtDay(locale, new Date(order.createdAt)) })}
          </p>
        </div>
        <div className="order-head-pills">
          <StatusPill status={order.status} />
          <PaymentPill payment={totals.payment} />
          {late && <span className="opill late">{t('orders.late')}</span>}
        </div>
      </header>

      {/* Where it is. The four steps as a segmented control: one tap moves it. */}
      <h2 className="group-title">{t('order.statusTitle')}</h2>
      {cancelled ? (
        <div className="panel order-banner">
          <span>{t('order.cancelledNote')}</span>
          <button type="button" className="controls" onClick={() => onChange(setStatus(order, 'pending'))}>{t('order.reopen')}</button>
        </div>
      ) : (
        <div className="order-flow">
          <div className="segmented segmented-inline flow" role="group" aria-label={t('order.statusTitle')}>
            {FLOW.map(s => (
              <button key={s} type="button" aria-pressed={order.status === s} className={order.status === s ? 'on' : undefined}
                onClick={() => onChange(setStatus(order, s))}>
                {t(`order.status.${s}`)}
              </button>
            ))}
          </div>
          <button type="button" className="link danger-link" onClick={() => onChange(setStatus(order, 'cancelled'))}>{t('order.cancel')}</button>
        </div>
      )}

      <div className="order-cols">
        <div>
          {/* Who and when */}
          <h2 className="group-title">{t('order.who')}</h2>
          <div className="panel list-group">
            <div className="lrow">
              <span>{t('order.client')}</span>
              <select className="lrow-select" value={order.customerId ?? ''} aria-label={t('order.client')}
                onChange={e => {
                  const c = customers.find(x => x.id === e.target.value)
                  edit(c ? { customerId: c.id, customerName: c.name } : { customerId: null })
                }}>
                <option value="">{order.customerId ? t('order.noClient') : (order.customerName || t('order.noClient'))}</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {order.customerId && (
              <button type="button" className="lrow lrow-link" onClick={() => onOpenCustomer(order.customerId)}>
                <span>{t('order.openClient')}</span><span aria-hidden="true">›</span>
              </button>
            )}
            <label className="lrow">
              <span>{t('order.due')}</span>
              <input type="date" value={order.dueAt ?? ''} onChange={e => edit({ dueAt: isDay(e.target.value) ? e.target.value : null })} />
            </label>
            <label className="lrow">
              <span>{t('order.channel')}</span>
              <CommitText key={`ch-${order.id}`} className="lrow-input" value={order.channel} maxLength={40}
                placeholder={t('order.channelPh')} onCommit={v => edit({ channel: v })} />
            </label>
            {order.deliveredAt && (
              <div className="lrow"><span>{t('order.deliveredAt')}</span><span className="muted">{fmtDay(locale, day(order.deliveredAt))}</span></div>
            )}
          </div>

          {/* What */}
          <h2 className="group-title">{t('order.parts')}</h2>
          <div className="panel list-group">
            {order.lines.length === 0 && <p className="muted lrow-empty">{t('order.noParts')}</p>}
            {order.lines.map(l => (
              <div className="line-row" key={l.id}>
                <CommitText key={`n-${l.id}`} className="line-name" value={l.name} maxLength={80} aria-label={t('order.partName')}
                  onCommit={v => v.trim() && editLine(l.id, { name: v })} />
                <div className="line-nums">
                  <label><span className="sr-only">{t('order.qty')}</span>
                    <QtyInput key={`q-${l.id}-${l.qty}`} className="line-qty" value={l.qty} onCommit={qty => editLine(l.id, { qty })} />
                  </label>
                  <span className="muted" aria-hidden="true">×</span>
                  <label><span className="sr-only">{t('order.unitPrice', { currency })}</span>
                    <MoneyInput key={`p-${l.id}-${l.unitPrice}-${rate}`} className="line-price" value={l.unitPrice} rate={rate}
                      onCommit={unitPrice => editLine(l.id, { unitPrice })} />
                  </label>
                  <span className="line-total">{formatMoney(l.qty * l.unitPrice)}</span>
                  <button type="button" className="row-btn danger" aria-label={t('order.removePart', { name: l.name })}
                    onClick={() => edit({ lines: order.lines.filter(x => x.id !== l.id) })}>✕</button>
                </div>
                {l.quoteId === null && (
                  <label className="line-cost muted">
                    {t('order.unitCost')}
                    <MoneyInput key={`c-${l.id}-${l.unitCost}-${rate}`} className="line-price" value={l.unitCost} rate={rate}
                      onCommit={unitCost => editLine(l.id, { unitCost })} />
                  </label>
                )}
              </div>
            ))}
            <div className="lrow">
              <select className="lrow-select add-part" value={adding} aria-label={t('order.addPart')} onChange={e => addPart(e.target.value)}>
                <option value="">+ {t('order.addPart')}</option>
                <option value="free">{t('order.addFree')}</option>
                {quotes.length > 0 && (
                  <optgroup label={t('order.fromHistory')}>
                    {[...quotes].filter(q => Number.isFinite(q.price)).sort((a, b) => b.id - a.id).map(q => (
                      <option key={q.id} value={q.id}>{q.name ?? t('save.untitled')} · {formatMoney(q.price)}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          <h2 className="group-title">{t('order.notes')}</h2>
          <div className="panel list-group">
            <CommitText key={`notes-${order.id}`} multiline className="notes-input" value={order.notes} maxLength={2000} rows={3}
              placeholder={t('order.notesPh')} aria-label={t('order.notes')} onCommit={v => edit({ notes: v })} />
          </div>
        </div>

        <div>
          {/* How much */}
          <h2 className="group-title">{t('order.money')}</h2>
          <div className="panel list-group">
            <div className="lrow"><span>{t('order.subtotal')}</span><span className="num">{formatMoney(totals.subtotal)}</span></div>
            <label className="lrow"><span>{t('order.shipping')}</span>
              <span className="num-input"><MoneyInput key={`s-${order.shipping}-${rate}`} value={order.shipping} rate={rate} onCommit={shipping => edit({ shipping })} /><span className="unit">{currency}</span></span>
            </label>
            <label className="lrow"><span>{t('order.discount')}</span>
              <span className="num-input"><MoneyInput key={`d-${order.discount}-${rate}`} value={order.discount} rate={rate} onCommit={discount => edit({ discount })} /><span className="unit">{currency}</span></span>
            </label>
            <div className="lrow lrow-total"><span>{t('order.total')}</span><span className="num price">{formatMoney(totals.total)}</span></div>
            <label className="lrow"><span>{t('order.fees')}</span>
              <span className="num-input"><MoneyInput key={`f-${order.fees}-${rate}`} value={order.fees} rate={rate} onCommit={fees => edit({ fees })} /><span className="unit">{currency}</span></span>
            </label>
            <div className="lrow"><span>{t('order.cost')}</span><span className="num muted">{formatMoney(totals.cost)}</span></div>
            <div className="lrow"><span>{t('order.profit')}</span>
              <span className={`num${totals.profit < 0 ? ' loss' : ''}`}>{formatMoney(totals.profit)}</span>
            </div>
            {totals.hours !== null && (
              <div className="lrow"><span>{t('order.hours')}</span><span className="num muted">{t('cal.hours', { h: fmtNumber(locale, totals.hours, 1) })}</span></div>
            )}
          </div>

          {/* What has been paid */}
          <h2 className="group-title with-action">
            <span>{t('order.payments')}</span>
            <PaymentPill payment={totals.payment} />
          </h2>
          <div className="panel list-group">
            {order.payments.map(p => (
              <div className="lrow" key={p.id}>
                <span className="pay-main">
                  {t(`order.method.${p.method}`)}
                  <span className="muted"> · {fmtDay(locale, day(p.at))}{p.note ? ` · ${p.note}` : ''}</span>
                </span>
                <span className="num">{formatMoney(p.amount)}</span>
                <button type="button" className="row-btn danger" aria-label={t('order.removePayment', { amount: formatMoney(p.amount) })}
                  onClick={() => window.confirm(t('order.removePaymentConfirm', { amount: formatMoney(p.amount) })) && onChange(removePayment(order, p.id))}>✕</button>
              </div>
            ))}
            <div className="lrow"><span>{t('order.paid')}</span><span className="num">{formatMoney(totals.paid)}</span></div>
            <div className="lrow"><span>{t('order.due2')}</span><span className={`num${totals.due > 0 ? ' strong' : ' muted'}`}>{formatMoney(totals.due)}</span></div>
            <div className="lrow">
              <button type="button" className="link" onClick={() => setPaying(true)}>+ {t('order.addPayment')}</button>
            </div>
          </div>

          {/* What happened: newest first, like a feed. */}
          <h2 className="group-title">{t('order.history')}</h2>
          <ol className="panel list-group timeline">
            {[...order.history].reverse().map((e, i) => (
              <li key={i}>
                <span>{eventText(t, e, formatMoney)}</span>
                <span className="muted">{fmtDateTime(locale, new Date(e.at))}</span>
              </li>
            ))}
          </ol>

          <button type="button" className="link danger-link delete-order" onClick={remove}>{t('order.delete')}</button>
        </div>
      </div>

      {paying && (
        <PaymentDialog
          due={totals.due}
          currency={currency}
          rate={rate}
          onSave={p => { onChange(addPayment(order, p)); setPaying(false) }}
          onClose={() => setPaying(false)}
        />
      )}
    </main>
  )
}

function eventText(t, e, formatMoney) {
  if (e.type === 'status') return t('order.ev.status', { from: e.from ? t(`order.status.${e.from}`) : '—', to: e.to ? t(`order.status.${e.to}`) : '—' })
  if (e.type === 'payment') return t('order.ev.payment', { amount: formatMoney(e.amount ?? 0) })
  if (e.type === 'paymentRemoved') return t('order.ev.paymentRemoved', { amount: formatMoney(e.amount ?? 0) })
  return t(`order.ev.${e.type}`)
}

/* Add a payment: the amount starts at what is still due, so "paid in full"
   is one tap; a deposit is typing a smaller number. */
function PaymentDialog({ due, currency, rate, onSave, onClose }) {
  const { t, decimal } = useI18n()
  const ref = useRef(null)
  const [amount, setAmount] = useState(due > 0 ? (Math.round(due * rate * 100) / 100).toFixed(2).replace('.', decimal) : '')
  const [method, setMethod] = useState('bizum')
  const [at, setAt] = useState(today())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    const close = () => onClose()
    dialog.addEventListener('close', close)
    return () => { dialog.removeEventListener('close', close); if (dialog.open) dialog.close() }
  }, [onClose])

  const submit = e => {
    e.preventDefault()
    const n = parseFloat(amount.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) { setError(t('order.err.amount')); return }
    if (!isDay(at)) { setError(t('sale.err.date')); return }
    onSave({ amount: n / rate, method, at, note })
  }

  return (
    <dialog ref={ref} className="sheet" aria-labelledby="pay-title">
      <form onSubmit={submit} noValidate>
        <h2 id="pay-title">{t('order.addPayment')}</h2>
        <div className="sheet-group">
          <label className="sheet-row">
            <span>{t('order.amount')}</span>
            <input type="text" inputMode="decimal" value={amount} autoFocus onChange={e => { setAmount(e.target.value); setError('') }} />
            <span className="unit">{currency}</span>
          </label>
          <label className="sheet-row">
            <span>{t('order.method')}</span>
            <select value={method} onChange={e => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(`order.method.${m}`)}</option>)}
            </select>
          </label>
          <label className="sheet-row">
            <span>{t('order.paidOn')}</span>
            <input type="date" value={at} onChange={e => setAt(e.target.value)} />
          </label>
          <label className="sheet-row">
            <span>{t('order.payNote')}</span>
            <input type="text" value={note} maxLength={120} placeholder={t('order.payNotePh')} onChange={e => setNote(e.target.value)} />
          </label>
        </div>
        {error && <p className="import-error" role="alert">{error}</p>}
        <div className="sheet-actions">
          <button type="button" className="controls" onClick={() => ref.current.close()}>{t('sale.cancel')}</button>
          <button type="submit" className="controls primary">{t('order.savePayment')}</button>
        </div>
      </form>
    </dialog>
  )
}
