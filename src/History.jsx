import { useState } from 'react'

/* ==================================================================
   HISTORY — every saved quote, newest first, grouped by month.
   It doesn't own any data: App passes the quotes in and gets told
   when the user wants to load, delete or export something.
================================================================== */

// Older quotes only have `id` (a Date.now() timestamp), newer ones
// also have `createdAt`. Both turn into a real Date here.
const quoteDate = q => new Date(q.createdAt ?? q.id)
// "12 Oct 2026": with the month in letters nobody mixes up day and month.
const fmtDay = dt => dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const orderTotal = q => q.orderTotal ?? q.price

function monthOf(q) {
  const dt = quoteDate(q)
  return {
    key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`,
    label: dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  }
}

export default function History({ quotes, formatMoney, onLoad, onDelete, onExport, exporting, onReport, onCustomerQuote, onGoToCalculator }) {
  const [query, setQuery] = useState('')
  // Ids of the quotes ticked for a customer quote. A Set holds each id once.
  const [selected, setSelected] = useState(() => new Set())

  if (quotes.length === 0) {
    return (
      <div className="panel empty">
        <p>No saved quotes yet.</p>
        <p className="muted">Fill in the calculator, give the part a name and press “Save quote”.</p>
        <button type="button" className="controls" onClick={onGoToCalculator}>Go to calculator</button>
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
    const { key, label } = monthOf(item)
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
    if (window.confirm(`Delete “${item.name ?? 'Untitled part'}” from ${fmtDay(quoteDate(item))}?`)) {
      onDelete(item.id)
    }
  }

  return (
    <>
      <div className="stats">
        <div className="stat"><span className="label">Quotes</span><span className="value">{visible.length}</span></div>
        <div className="stat"><span className="label">Total quoted</span><span className="value">{formatMoney(totalValue)}</span></div>
        <div className="stat"><span className="label">Avg. price / part</span><span className="value">{formatMoney(avgPrice)}</span></div>
        <div className="stat"><span className="label">Clients</span><span className="value">{clients}</span></div>
      </div>

      <div className="history-tools">
        <input
          className="text-input"
          type="search"
          placeholder="Search part or client"
          aria-label="Search part or client"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button type="button" className="controls" onClick={() => onExport(visible)} disabled={exporting || visible.length === 0}>
          {exporting ? 'Exporting…' : `Export Excel (${visible.length})`}
        </button>
        <button type="button" className="controls" onClick={() => onReport(visible, query.trim())} disabled={visible.length === 0}>
          PDF report
        </button>
      </div>

      <div className="quote-tools">
        <label className="select-all">
          <input type="checkbox" checked={allShownTicked} onChange={toggleAllShown} disabled={visible.length === 0} />
          Select all shown
        </label>
        <button type="button" className="controls primary" onClick={() => onCustomerQuote(ticked)} disabled={ticked.length === 0}>
          Customer quote ({ticked.length})
        </button>
        {ticked.length === 0 && <span className="muted">Tick the parts for one client to send them a quote.</span>}
      </div>

      {visible.length === 0 && <p className="muted no-results">No quotes match “{query}”.</p>}

      {months.map(month => (
        <section className="panel" key={month.key}>
          <h2 className="month-head">
            <span>{month.label}</span>
            <span>{month.items.length} {month.items.length === 1 ? 'quote' : 'quotes'} · {formatMoney(month.total)}</span>
          </h2>
          {/* On narrow screens the table scrolls sideways inside this box
              instead of breaking the page layout. */}
          <div className="table-scroll">
            <table className="history-table">
              <thead>
                <tr>
                  <th className="check"><span className="sr-only">Select</span></th>
                  {/* "wide": columns a phone hides (index.css). Client and date
                      then appear under the part name instead (.row-sub). */}
                  <th className="wide">Date</th>
                  <th>Part</th>
                  <th className="wide">Client</th>
                  <th className="num wide">Qty</th>
                  <th className="num wide">Cost / part</th>
                  <th className="num wide">Price / part</th>
                  <th className="num">Order total</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {month.items.map(item => (
                  <tr key={item.id} className={selected.has(item.id) ? 'ticked' : undefined}>
                    <td className="check">
                      <input
                        type="checkbox"
                        aria-label={`Select ${item.name ?? 'Untitled part'}`}
                        checked={selected.has(item.id)}
                        onChange={() => toggle(item.id)}
                      />
                    </td>
                    <td className="muted wide">{fmtDay(quoteDate(item))}</td>
                    <td className="strong part">
                      {item.name ?? 'Untitled part'}
                      {/* Only visible on a phone, where the Qty, Client and Date
                          columns are hidden: the same facts, in one line.
                          filter(Boolean) drops the empty ones (no client, 1 pc). */}
                      <span className="row-sub">{[(item.units ?? 1) > 1 && `${item.units} pcs`, item.client, fmtDay(quoteDate(item))].filter(Boolean).join(' · ')}</span>
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
                        title={item.inputs ? 'Open this quote in the calculator' : 'Saved with an older version, no form data'}
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        className="row-btn danger"
                        aria-label={`Delete ${item.name ?? 'quote'}`}
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
