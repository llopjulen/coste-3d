import { useEffect } from 'react'
import Logo from './Logo.jsx'

/* ==================================================================
   REPORT — a printable summary of the quotes shown in History.
   On screen it looks like a sheet of paper; "Save as PDF" opens the
   browser's print dialog, where you choose "Save as PDF".
   Charts are plain divs whose width/height is a percentage, so they
   print sharply without any chart library.
================================================================== */

const LAYER_NAMES = {
  material: 'Material',
  power: 'Power',
  depreciation: 'Depreciation',
  failures: 'Failures',
  labor: 'Labor',
  packaging: 'Packaging',
}

const quoteDate = q => new Date(q.createdAt ?? q.id)
const orderTotal = q => q.orderTotal ?? q.price
const average = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0)
const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0)

/* Horizontal bar list: one bar per row, longest = full width. */
function BarList({ rows, formatMoney, showShare }) {
  const max = Math.max(...rows.map(r => r.value), 0)
  const total = rows.reduce((sum, r) => sum + r.value, 0)
  return (
    <div className="bar-list">
      {rows.map(r => (
        <div className="bar-row" key={r.label} title={`${r.label}: ${formatMoney(r.value)}`}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${pct(r.value, max)}%` }} />
          </span>
          <span className="bar-value">
            {formatMoney(r.value)}
            {showShare && <span className="bar-share">{pct(r.value, total).toFixed(0)}%</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function Report({ quotes, filter, currency, formatMoney, onBack }) {
  const sorted = [...quotes].sort((a, b) => quoteDate(a) - quoteDate(b))
  const first = sorted[0] ? quoteDate(sorted[0]) : null
  const last = sorted.length ? quoteDate(sorted[sorted.length - 1]) : null
  const fmtDate = dt => dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  // --- Headline numbers ---
  const totalQuoted = quotes.reduce((sum, q) => sum + orderTotal(q), 0)
  const avgPrice = average(quotes.map(q => q.price))
  const avgCost = average(quotes.map(q => q.cost))
  // Profit per part after the platform's fee. Only quotes saved with
  // the full form data know their fee.
  const withInputs = quotes.filter(q => q.inputs)
  const avgProfit = average(withInputs.map(q => q.price * (1 - q.inputs.fee / 100) - q.cost))

  // --- Chart 1: quoted value per month (last 12 months with data) ---
  const monthMap = new Map()
  for (const q of sorted) {
    const dt = quoteDate(q)
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    // Month and year apart: "Oct 26" read like the 26th of October. The
    // bar shows "Oct", and the year only where it starts (see below).
    const month = dt.toLocaleDateString('en-GB', { month: 'short' })
    const entry = monthMap.get(key) ?? { key, month, year: dt.getFullYear(), january: dt.getMonth() === 0, value: 0, count: 0 }
    entry.value += orderTotal(q)
    entry.count += 1
    monthMap.set(key, entry)
  }
  const months = [...monthMap.values()].slice(-12)
  const maxMonth = Math.max(...months.map(m => m.value), 0)

  // --- Chart 2: where the cost of an average part goes ---
  const withParts = quotes.filter(q => q.parts)
  const breakdown = Object.keys(LAYER_NAMES)
    .map(key => ({ label: LAYER_NAMES[key], value: average(withParts.map(q => q.parts[key])) }))
    .sort((a, b) => b.value - a.value)

  // --- Chart 3: top clients by quoted value ---
  const clientMap = new Map()
  for (const q of quotes) {
    const name = q.client || 'No client'
    clientMap.set(name, (clientMap.get(name) ?? 0) + orderTotal(q))
  }
  const clients = [...clientMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  // The PDF file name comes from the page title, so set a nice one
  // while the report is open and put the old one back afterwards.
  useEffect(() => {
    const previous = document.title
    document.title = `layercents report ${new Date().toISOString().slice(0, 10)}`
    return () => { document.title = previous }
  }, [])

  return (
    <div className="report-screen">
      <div className="report-actions no-print">
        <button type="button" className="controls" onClick={onBack}>← Back to history</button>
        <button type="button" className="controls primary" onClick={() => window.print()}>Save as PDF</button>
        <span className="muted">In the print window, choose “Save as PDF” as the destination.</span>
      </div>

      <article className="report">
        <header className="report-head">
          <div>
            <div className="report-brand"><Logo size={16} small /> layercents</div>
            <h1>Quote report</h1>
            <p className="report-sub">
              {first && `${fmtDate(first)} – ${fmtDate(last)}`}
              {filter && <> · filtered by “{filter}”</>}
            </p>
          </div>
          <div className="report-meta">
            <span>Generated {fmtDate(new Date())}</span>
            <span>Amounts in {currency}</span>
          </div>
        </header>

        <section className="report-kpis">
          <div className="kpi"><span className="label">Quotes</span><span className="value">{quotes.length}</span></div>
          <div className="kpi"><span className="label">Total quoted</span><span className="value">{formatMoney(totalQuoted)}</span></div>
          <div className="kpi"><span className="label">Avg. price / part</span><span className="value">{formatMoney(avgPrice)}</span></div>
          <div className="kpi"><span className="label">Avg. cost / part</span><span className="value">{formatMoney(avgCost)}</span></div>
          <div className="kpi">
            <span className="label">Avg. profit / part</span>
            <span className="value">{withInputs.length ? formatMoney(avgProfit) : '—'}</span>
            <span className="hint">after platform fees</span>
          </div>
        </section>

        <section className="report-block">
          <h2>Quoted value per month</h2>
          <div className="columns-chart" role="img" aria-label="Quoted value per month">
            {months.map((m, i) => (
              <div className="col" key={m.key} title={`${m.month} ${m.year}: ${formatMoney(m.value)} (${m.count} quotes)`}>
                <span className="col-value">{formatMoney(m.value).replace(` ${currency}`, '')}</span>
                <span className="col-bar-area">
                  <span className="col-bar" style={{ height: `${pct(m.value, maxMonth)}%` }} />
                </span>
                <span className="col-label">
                  {m.month}
                  {/* The year under the first bar and under every January:
                      enough to place every month, without repeating it twelve times. */}
                  {(i === 0 || m.january) && <span className="col-year">{m.year}</span>}
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="report-two">
          <section className="report-block">
            <h2>Where the cost of an average part goes</h2>
            {withParts.length
              ? <BarList rows={breakdown} formatMoney={formatMoney} showShare />
              : <p className="muted">Quotes saved with an older version have no breakdown.</p>}
          </section>
          <section className="report-block">
            <h2>Top clients by quoted value</h2>
            <BarList rows={clients} formatMoney={formatMoney} />
          </section>
        </div>

        {/* "breakable": a long table may continue on the next page */}
        <section className="report-block breakable">
          <h2>All quotes</h2>
          <div className="table-scroll">
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Part</th>
                <th>Client</th>
                <th className="num">Qty</th>
                <th className="num">Cost / part</th>
                <th className="num">Price / part</th>
                <th className="num">Order total</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(q => (
                <tr key={q.id}>
                  <td>{fmtDate(quoteDate(q))}</td>
                  <td className="strong">{q.name ?? 'Untitled part'}</td>
                  <td>{q.client || '—'}</td>
                  <td className="num">{q.units ?? 1}</td>
                  <td className="num">{formatMoney(q.cost)}</td>
                  <td className="num">{formatMoney(q.price)}</td>
                  <td className="num strong">{formatMoney(orderTotal(q))}</td>
                </tr>
              ))}
              {/* A normal row, not <tfoot>: when printing, the browser
                  repeats <tfoot> on every page, which looks like a
                  wrong total under half the list. */}
              <tr className="total-row">
                <td colSpan={3}>Total</td>
                <td className="num">{quotes.reduce((sum, q) => sum + (q.units ?? 1), 0)}</td>
                <td colSpan={2} />
                <td className="num">{formatMoney(totalQuoted)}</td>
              </tr>
            </tbody>
          </table>
          </div>
        </section>

        <footer className="report-foot">
          Costs include material, power, printer depreciation, failed prints, labor and packaging.
          Prices include the target margin and platform fee. Generated with layercents.
        </footer>
      </article>
    </div>
  )
}
