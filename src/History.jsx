import { useState } from 'react'

/* ==================================================================
   HISTORY — every saved quote, newest first, grouped by month.
   It doesn't own any data: App passes the quotes in and gets told
   when the user wants to load, delete or export something.
================================================================== */

// Older quotes only have `id` (a Date.now() timestamp), newer ones
// also have `createdAt`. Both turn into a real Date here.
const quoteDate = q => new Date(q.createdAt ?? q.id)
const orderTotal = q => q.orderTotal ?? q.price

function monthOf(q) {
  const dt = quoteDate(q)
  return {
    key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`,
    label: dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  }
}

export default function History({ quotes, formatMoney, onLoad, onDelete, onExport, exporting, onGoToCalculator }) {
  const [query, setQuery] = useState('')

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

  const remove = item => {
    if (window.confirm(`Delete “${item.name ?? 'Untitled part'}” from ${quoteDate(item).toLocaleDateString()}?`)) {
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
                  <th>Date</th>
                  <th>Part</th>
                  <th>Client</th>
                  <th className="num">Qty</th>
                  <th className="num">Cost / part</th>
                  <th className="num">Price / part</th>
                  <th className="num">Order total</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {month.items.map(item => (
                  <tr key={item.id}>
                    <td className="muted">{quoteDate(item).toLocaleDateString()}</td>
                    <td className="strong">{item.name ?? 'Untitled part'}</td>
                    <td>{item.client || <span className="muted">—</span>}</td>
                    <td className="num">{item.units ?? 1}</td>
                    <td className="num">{formatMoney(item.cost)}</td>
                    <td className="num accent">{formatMoney(item.price)}</td>
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
