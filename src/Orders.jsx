import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from './i18n/context.js'
import { fmtDay } from './i18n/format.js'
import { OPEN_STATUSES, formatOrderNumber, matchesOrder, ordersSummary, orderTotals, today } from './orders.js'
import { createCustomer, customerStats, editCustomer } from './customers.js'
import { CommitText, PaymentPill, StatusPill } from './OrderParts.jsx'
import OrderDetail from './OrderDetail.jsx'
import NewOrderDialog from './NewOrderDialog.jsx'

/* ==================================================================
   ORDERS — the workshop's orders and customers.

   One tab, two lists (segmented control, as in iOS): Orders and
   Customers. Tapping a row opens its page; "‹ Orders" goes back. The
   page to show is local state ({ kind, id }), not a URL: the app has no
   router, and the order is always one tap away from the list.

   All data comes from `api` (useOrders in App), which talks to the store.
================================================================== */
const FILTERS = ['open', 'delivered', 'cancelled', 'all']
const day = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d) }

export default function Orders({ api, quotes, formatMoney, currency, rate, open, onOpen, preset, onPresetUsed }) {
  const { t } = useI18n()
  // open = null (lists) | { kind: 'order' | 'customer', id }. Held by App so
  // other tabs (History, Calendar) can open an order directly.
  const [section, setSection] = useState('orders')
  const [creating, setCreating] = useState(false)
  const closeNew = useCallback(() => { setCreating(false); onPresetUsed?.() }, [onPresetUsed])

  if (api.status === 'loading') return <main className="wrap"><p className="muted">{t('orders.loading')}</p></main>

  const order = open?.kind === 'order' ? api.orders.find(o => o.id === open.id) : null
  const customer = open?.kind === 'customer' ? api.customers.find(c => c.id === open.id) : null

  const errorBanner = api.error && (
    <p className="import-error orders-error" role="alert">
      {t('orders.err.save')} <button type="button" className="link" onClick={api.clearError}>{t('orders.dismiss')}</button>
    </p>
  )

  if (order) {
    return (
      <>
        {errorBanner}
        <OrderDetail
          key={order.id}
          order={order}
          customers={api.customers}
          quotes={quotes}
          formatMoney={formatMoney}
          currency={currency}
          rate={rate}
          onChange={api.saveOrder}
          onDelete={id => { api.deleteOrder(id); onOpen(null) }}
          onBack={() => onOpen(null)}
          onOpenCustomer={id => onOpen({ kind: 'customer', id })}
        />
      </>
    )
  }
  if (customer) {
    return (
      <>
        {errorBanner}
        <CustomerDetail
          key={customer.id}
          customer={customer}
          orders={api.orders.filter(o => o.customerId === customer.id)}
          formatMoney={formatMoney}
          onChange={api.saveCustomer}
          onDelete={id => { api.deleteCustomer(id); onOpen(null); setSection('customers') }}
          onBack={() => { onOpen(null); setSection('customers') }}
          onOpenOrder={id => onOpen({ kind: 'order', id })}
        />
      </>
    )
  }

  const showNew = creating || preset?.length > 0

  return (
    <main className="wrap orders">
      <div className="orders-head">
        <div>
          <h1>{t('orders.title')}</h1>
          <p className="subtitle">{t('orders.lead')}</p>
        </div>
        {section === 'orders'
          ? <button type="button" className="controls primary" onClick={() => setCreating(true)}>+ {t('orders.new')}</button>
          : <NewCustomerButton onCreate={c => { api.saveCustomer(c); onOpen({ kind: 'customer', id: c.id }) }} />}
      </div>
      {errorBanner}

      <div className="segmented orders-switch" role="group" aria-label={t('orders.title')}>
        {['orders', 'customers'].map(s => (
          <button key={s} type="button" aria-pressed={section === s} className={section === s ? 'on' : undefined} onClick={() => setSection(s)}>
            {t(`orders.section.${s}`)}
            <span className="seg-count">{s === 'orders' ? api.orders.length : api.customers.length}</span>
          </button>
        ))}
      </div>

      {section === 'orders'
        ? <OrderList orders={api.orders} formatMoney={formatMoney} onOpen={id => onOpen({ kind: 'order', id })} onNew={() => setCreating(true)} />
        : <CustomerList customers={api.customers} orders={api.orders} formatMoney={formatMoney} onOpen={id => onOpen({ kind: 'customer', id })} />}

      {showNew && (
        <NewOrderDialog
          quotes={quotes}
          customers={api.customers}
          formatMoney={formatMoney}
          preset={preset ?? []}
          onCreate={async input => {
            const created = await api.addOrder(input)
            if (created) { closeNew(); onOpen({ kind: 'order', id: created.id }) }
            return created
          }}
          onClose={closeNew}
        />
      )}
    </main>
  )
}

function OrderList({ orders, formatMoney, onOpen, onNew }) {
  const { t, locale } = useI18n()
  const [filter, setFilter] = useState('open')
  const [query, setQuery] = useState('')
  const summary = useMemo(() => ordersSummary(orders), [orders])
  const now = today()

  const counts = useMemo(() => ({
    open: orders.filter(o => OPEN_STATUSES.includes(o.status)).length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
    all: orders.length,
  }), [orders])

  const visible = orders
    .filter(o => filter === 'all' || (filter === 'open' ? OPEN_STATUSES.includes(o.status) : o.status === filter))
    .filter(o => matchesOrder(o, query))
  // Open orders by delivery date (what's due first is what matters);
  // the rest newest first (orders already come sorted that way).
  const sorted = filter === 'open'
    ? [...visible].sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || a.number - b.number)
    : visible

  if (orders.length === 0) {
    return (
      <div className="panel empty">
        <h2>{t('orders.empty.title')}</h2>
        <p className="muted">{t('orders.empty.text')}</p>
        <button type="button" className="controls primary" onClick={onNew}>+ {t('orders.new')}</button>
      </div>
    )
  }

  return (
    <>
      <div className="stats">
        <div className="stat"><span className="label">{t('orders.stat.open')}</span>
          <span className="value">{summary.open}{summary.late > 0 && <small className="late-note"> · {t('orders.stat.late', { n: summary.late })}</small>}</span></div>
        <div className="stat"><span className="label">{t('orders.stat.toCollect')}</span><span className="value">{formatMoney(summary.toCollect)}</span></div>
        <div className="stat"><span className="label">{t('orders.stat.collected')}</span><span className="value">{formatMoney(summary.collected)}</span></div>
        <div className="stat"><span className="label">{t('orders.stat.profit')}</span>
          <span className={`value${summary.profit < 0 ? ' loss' : ''}`}>{formatMoney(summary.profit)}</span></div>
      </div>

      <div className="history-tools">
        <input className="text-input" type="search" placeholder={t('orders.search')} aria-label={t('orders.search')}
          value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <div className="segmented" role="group" aria-label={t('orders.filter')}>
        {FILTERS.map(f => (
          <button key={f} type="button" aria-pressed={filter === f} className={filter === f ? 'on' : undefined} onClick={() => setFilter(f)}>
            {t(`orders.filter.${f}`)}<span className="seg-count">{counts[f]}</span>
          </button>
        ))}
      </div>

      {sorted.length === 0
        ? <p className="muted no-results">{query ? t('history.noMatch', { query }) : t('orders.none')}</p>
        : (
          <ul className="panel order-list">
            {sorted.map(o => {
              const tot = orderTotals(o)
              const late = OPEN_STATUSES.includes(o.status) && o.dueAt && o.dueAt < now
              const parts = o.lines.map(l => (l.qty > 1 ? `${l.name} ×${l.qty}` : l.name)).join(', ')
              return (
                <li key={o.id}>
                  <button type="button" className="order-row" onClick={() => onOpen(o.id)}>
                    <span className="order-main">
                      <span className="order-title">
                        <span className="order-num">{formatOrderNumber(o.number)}</span>
                        {o.customerName || t('order.noClient')}
                      </span>
                      <span className="muted order-parts">{parts || t('order.noParts')}</span>
                    </span>
                    <span className="order-side">
                      <span className="order-total">{formatMoney(tot.total)}</span>
                      <span className={`order-due${late ? ' late' : ''}`}>
                        {o.status === 'delivered' && o.deliveredAt
                          ? t('orders.deliveredOn', { date: fmtDay(locale, day(o.deliveredAt)) })
                          : o.dueAt ? t('cal.dueOn', { date: fmtDay(locale, day(o.dueAt)) }) : t('cal.noDue')}
                      </span>
                    </span>
                    <span className="order-pills">
                      <StatusPill status={o.status} />
                      <PaymentPill payment={tot.payment} />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
    </>
  )
}

function CustomerList({ customers, orders, formatMoney, onOpen }) {
  const { t, tp } = useI18n()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const visible = customers.filter(c => !q || `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(q))

  if (customers.length === 0) {
    return <div className="panel empty"><h2>{t('customers.empty.title')}</h2><p className="muted">{t('customers.empty.text')}</p></div>
  }
  return (
    <>
      <div className="history-tools">
        <input className="text-input" type="search" placeholder={t('customers.search')} aria-label={t('customers.search')}
          value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <ul className="panel order-list">
        {visible.map(c => {
          const s = customerStats(c.id, orders)
          return (
            <li key={c.id}>
              <button type="button" className="order-row customer-row" onClick={() => onOpen(c.id)}>
                <span className="order-main">
                  <span className="order-title">{c.name}</span>
                  <span className="muted order-parts">{[c.email, c.phone].filter(Boolean).join(' · ') || tp('customers.orders', s.count)}</span>
                </span>
                <span className="order-side">
                  <span className="order-total">{formatMoney(s.spent)}</span>
                  <span className="order-due">{s.due > 0 ? t('customers.due', { amount: formatMoney(s.due) }) : tp('customers.orders', s.count)}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {visible.length === 0 && <p className="muted no-results">{t('history.noMatch', { query })}</p>}
    </>
  )
}

function NewCustomerButton({ onCreate }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <button type="button" className="controls primary" onClick={() => setOpen(true)}>+ {t('customers.new')}</button>
      {open && <NewCustomerDialog onCreate={c => { setOpen(false); onCreate(c) }} onClose={close} />}
    </>
  )
}

/* Name (required), email and phone: the rest is filled in on the card. */
function NewCustomerDialog({ onCreate, onClose }) {
  const { t } = useI18n()
  const ref = useRef(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
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
    const c = createCustomer(form)
    if (!c) { setError(t('customers.err.name')); return }
    onCreate(c)
  }
  return (
    <dialog ref={ref} className="sheet" aria-labelledby="newcust-title">
      <form onSubmit={submit} noValidate>
        <h2 id="newcust-title">{t('customers.new')}</h2>
        <div className="sheet-group">
          {[['name', 80, 'text'], ['email', 120, 'email'], ['phone', 40, 'tel']].map(([field, max, type]) => (
            <label className="sheet-row" key={field}>
              <span>{t(`customers.field.${field}`)}</span>
              <input type={type} value={form[field]} maxLength={max} autoFocus={field === 'name'}
                onChange={e => { setForm(f => ({ ...f, [field]: e.target.value })); setError('') }} />
            </label>
          ))}
        </div>
        {error && <p className="import-error" role="alert">{error}</p>}
        <div className="sheet-actions">
          <button type="button" className="controls" onClick={() => ref.current.close()}>{t('sale.cancel')}</button>
          <button type="submit" className="controls primary">{t('customers.create')}</button>
        </div>
      </form>
    </dialog>
  )
}

function CustomerDetail({ customer, orders, formatMoney, onChange, onDelete, onBack, onOpenOrder }) {
  const { t, tp, locale } = useI18n()
  const s = customerStats(customer.id, orders)
  const edit = patch => onChange(editCustomer(customer, patch))
  return (
    <main className="wrap order-detail">
      <button type="button" className="back-link" onClick={onBack}>‹ {t('orders.section.customers')}</button>
      <header className="order-head">
        <div>
          <h1>{customer.name}</h1>
          <p className="subtitle">{tp('customers.orders', s.count)}{s.lastOrderAt ? ` · ${t('customers.last', { date: fmtDay(locale, new Date(s.lastOrderAt)) })}` : ''}</p>
        </div>
      </header>

      <div className="stats">
        <div className="stat"><span className="label">{t('customers.stat.orders')}</span><span className="value">{s.count}</span></div>
        <div className="stat"><span className="label">{t('customers.stat.spent')}</span><span className="value">{formatMoney(s.spent)}</span></div>
        <div className="stat"><span className="label">{t('customers.stat.due')}</span><span className="value">{formatMoney(s.due)}</span></div>
        <div className="stat"><span className="label">{t('customers.stat.avg')}</span><span className="value">{formatMoney(s.count ? s.spent / s.count : 0)}</span></div>
      </div>

      <div className="order-cols">
        <div>
          <h2 className="group-title">{t('customers.card')}</h2>
          <div className="panel list-group">
            {[['name', 80, 'text'], ['email', 120, 'email'], ['phone', 40, 'tel']].map(([field, max, type]) => (
              <label className="lrow" key={field}>
                <span>{t(`customers.field.${field}`)}</span>
                <CommitText key={`${field}-${customer.id}`} className="lrow-input" type={type} value={customer[field]} maxLength={max}
                  onCommit={v => (field !== 'name' || v.trim()) && edit({ [field]: v })} />
              </label>
            ))}
          </div>
          <h2 className="group-title">{t('order.notes')}</h2>
          <div className="panel list-group">
            <CommitText key={`cn-${customer.id}`} multiline className="notes-input" value={customer.notes} maxLength={1000} rows={3}
              placeholder={t('customers.notesPh')} aria-label={t('order.notes')} onCommit={v => edit({ notes: v })} />
          </div>
          <button type="button" className="link danger-link delete-order"
            onClick={() => window.confirm(t('customers.deleteConfirm', { name: customer.name })) && onDelete(customer.id)}>
            {t('customers.delete')}
          </button>
        </div>
        <div>
          <h2 className="group-title">{t('orders.section.orders')}</h2>
          {orders.length === 0
            ? <p className="muted">{t('customers.noOrders')}</p>
            : (
              <ul className="panel order-list">
                {orders.map(o => (
                  <li key={o.id}>
                    <button type="button" className="order-row" onClick={() => onOpenOrder(o.id)}>
                      <span className="order-main">
                        <span className="order-title"><span className="order-num">{formatOrderNumber(o.number)}</span>{fmtDay(locale, new Date(o.createdAt))}</span>
                        <span className="muted order-parts">{o.lines.map(l => l.name).join(', ') || t('order.noParts')}</span>
                      </span>
                      <span className="order-side"><span className="order-total">{formatMoney(orderTotals(o).total)}</span></span>
                      <span className="order-pills"><StatusPill status={o.status} /><PaymentPill payment={orderTotals(o).payment} /></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>
    </main>
  )
}
