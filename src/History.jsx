import { useState } from 'react'
import { useI18n } from './i18n/context.js'
import { fmtDay, fmtMonthYear } from './i18n/format.js'

/* ==================================================================
   HISTORY — every saved quote, newest first, grouped by month.
   It doesn't own any data: App passes the quotes in and gets told
   when the user wants to load, delete or export something.
================================================================== */

// Older quotes only have `id` (a Date.now() timestamp), newer ones
// also have `createdAt`. Both turn into a real Date here.
const quoteDate = q => new Date(q.createdAt ?? q.id)
const orderTotal = q => q.orderTotal ?? q.price

// The key groups the quotes; the label (language-dependent) is only what the heading shows.
function monthOf(q, locale) {
  const dt = quoteDate(q)
  return {
    key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`,
    label: fmtMonthYear(locale, dt),
  }
}

export default function History({ quotes, formatMoney, onLoad, onDelete, onExport, exporting, onReport, onCustomerQuote, onGoToCalculator }) {
  const { t, tp, locale } = useI18n()
  const day = dt => fmtDay(locale, dt)
  const [query, setQuery] = useState('')
  // Ids of the quotes ticked for a customer quote. A Set holds each id once.
  const [selected, setSelected] = useState(() => new Set())

  if (quotes.length === 0) {
    return (
      <div className="panel empty">
        <p>{t('history.empty.title')}</p>
        <p className="muted">{t('history.empty.hint', { button: t('save.button') })}</p>
        <button type="button" className="controls" onClick={onGoToCalculator}>{t('history.goCalc')}</button>
      </div>
    )
  }

  // Search by part name or client, ignoring upper/lower case.
  const q = query.trim().toLowerCase()
  const visible = quotes
    .filter(item =>
      !q ||
      (item.name ?? '').toLowerCase().includes(q) ||
      (item.client ?? '').toLowerCase().includes(q)
    )
    .sort((a, b) => quoteDate(b) - quoteDate(a))

  // Group the visible quotes by month: [{ key, label, items, total }]
  const months = []
  for (const item of visible) {
    const { key, label } = monthOf(item, locale)
    let group = months.find(m => m.key === key)
    if (!group) {
      group = { key, label, items: [], total: 0 }
      months.push(group)
    }
    group.items.push(item)
    group.total += orderTotal(item)
  }

  const totalValue = visible.reduce((sum, item) => sum + orderTotal(item), 0)
  const avgPrice = visible.length ? visible.reduce((sum, item) => sum + item.price, 0) / visible.length : 0
  const clients = new Set(visible.map(item => item.client).filter(Boolean)).size

  // Ticking works on a copy of the Set: React only redraws on a new object.
  const toggle = id => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const allShownTicked = visible.length > 0 && visible.every(item => selected.has(item.id))
  const toggleAllShown = () => setSelected(prev => {
    const next = new Set(prev)
    for (const item of visible) {
      if (allShownTicked) next.delete(item.id)
      else next.add(item.id)
    }
    return next
  })
  const ticked = quotes.filter(item => selected.has(item.id))

  const remove = item => {
    if (window.confirm(t('history.confirmDelete', { name: item.name ?? t('save.untitled'), date: day(quoteDate(item)) }))) {
      onDelete(item.id)
    }
  }

  return (
    <>
      <div className="stats">
        <div className="stat"><span className="label">{t('history.stat.quotes')}</span><span className="value">{visible.length}</span></div>
        <div className="stat"><span className="label">{t('history.stat.total')}</span><span className="value">{formatMoney(totalValue)}</span></div>
        <div className="stat"><span className="label">{t('history.stat.avg')}</span><span className="value">{formatMoney(avgPrice)}</span></div>
        <div className="stat"><span className="label">{t('history.stat.clients')}</span><span className="value">{clients}</span></div>
      </div>

      <div className="history-tools">
        <input
          className="text-input"
          type="search"
          placeholder={t('history.search')}
          aria-label={t('history.search')}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button type="button" className="controls" onClick={() => onExport(visible)} disabled={exporting || visible.length === 0}>
          {exporting ? t('history.exporting') : t('history.exportExcel', { n: visible.length })}
        </button>
        <button type="button" className="controls" onClick={() => onReport(visible, query.trim())} disabled={visible.length === 0}>
          {t('history.pdfReport')}
        </button>
      </div>

      <div className="quote-tools">
        <label className="select-all">
          <input type="checkbox" checked={allShownTicked} onChange={toggleAllShown} disabled={visible.length === 0} />
          {t('history.selectAll')}
        </label>
        <button type="button" className="controls primary" onClick={() => onCustomerQuote(ticked)} disabled={ticked.length === 0}>
          {t('history.customerQuote', { n: ticked.length })}
        </button>
        {ticked.length === 0 && <span className="muted">{t('history.tickHint')}</span>}
      </div>

      {visible.length === 0 && <p className="muted no-results">{t('history.noMatch', { query })}</p>}

      {months.map(month => (
        <section className="panel" key={month.key}>
          <h2 className="month-head">
            <span>{month.label}</span>
            <span>{tp('count.quotes', month.items.length)} · {formatMoney(month.total)}</span>
          </h2>
          {/* On narrow screens the table scrolls sideways inside this box
              instead of breaking the page layout. */}
          <div className="table-scroll">
            <table className="history-table">
              <thead>
                <tr>
                  <th className="check"><span className="sr-only">{t('history.col.select')}</span></th>
                  {/* "wide": columns a phone hides (index.css). Client and date
                      then appear under the part name instead (.row-sub). */}
                  <th className="wide">{t('history.col.date')}</th>
                  <th>{t('history.col.part')}</th>
                  <th className="wide">{t('history.col.client')}</th>
                  <th className="num wide">{t('history.col.qty')}</th>
                  <th className="num wide">{t('history.col.cost')}</th>
                  <th className="num wide">{t('history.col.price')}</th>
                  <th className="num">{t('history.col.total')}</th>
                  <th><span className="sr-only">{t('history.col.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {month.items.map(item => (
                  <tr key={item.id} className={selected.has(item.id) ? 'ticked' : undefined}>
                    <td className="check">
                      <input
                        type="checkbox"
                        aria-label={t('history.selectItem', { name: item.name ?? t('save.untitled') })}
                        checked={selected.has(item.id)}
                        onChange={() => toggle(item.id)}
                      />
                    </td>
                    <td className="muted wide">{day(quoteDate(item))}</td>
                    <td className="strong part">
                      {item.name ?? t('save.untitled')}
                      {/* Only visible on a phone, where the Qty, Client and Date
                          columns are hidden: the same facts, in one line.
                          filter(Boolean) drops the empty ones (no client, 1 pc). */}
                      <span className="row-sub">{[(item.units ?? 1) > 1 && `${item.units} ${t('unit.pcs')}`, item.client, day(quoteDate(item))].filter(Boolean).join(' · ')}</span>
                    </td>
                    <td className="wide">{item.client || <span className="muted">—</span>}</td>
                    <td className="num wide">{item.units ?? 1}</td>
                    <td className="num wide">{formatMoney(item.cost)}</td>
                    <td className="num accent wide">{formatMoney(item.price)}</td>
                    <td className="num strong">{formatMoney(orderTotal(item))}</td>
                    <td className="actions">
                      {/* Quotes saved before this version don't have the
                          form data, so there is nothing to load. */}
                      <button
                        type="button"
                        className="row-btn"
                        onClick={() => onLoad(item)}
                        disabled={!item.inputs}
                        title={item.inputs ? t('history.loadTitle') : t('history.loadOld')}
                      >
                        {t('history.load')}
                      </button>
                      <button
                        type="button"
                        className="row-btn danger"
                        aria-label={t('history.deleteItem', { name: item.name ?? t('save.untitled') })}
                        onClick={() => remove(item)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  )
}
