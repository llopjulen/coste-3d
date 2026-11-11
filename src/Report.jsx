import { useEffect, useMemo, useState } from 'react'
import DocLangSelect from './DocLangSelect.jsx'
import Logo from './Logo.jsx'
import { useI18n } from './i18n/context.js'
import { translatorFor } from './i18n/dicts.js'
import { fmtDay, fmtMoney, fmtMonthShort, fmtNumber } from './i18n/format.js'

/* ==================================================================
   REPORT — a printable summary of the quotes shown in History.
   On screen it looks like a sheet of paper; "Save as PDF" opens the
   browser's print dialog, where you choose "Save as PDF".
   Charts are plain divs whose width/height is a percentage, so they
   print sharply without any chart library.
================================================================== */

// The cost layers, in the order of the calculator. Their names are the
// 'layer.<key>' texts, in the language of the document.
const LAYER_KEYS = ['material', 'power', 'depreciation', 'failures', 'labor', 'packaging', 'extras']

const quoteDate = q => new Date(q.createdAt ?? q.id)
const orderTotal = q => q.orderTotal ?? q.price
const average = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0)
// Fewer months than this are drawn as rows, not columns.
const MIN_COLUMNS = 4
const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0)

/* Horizontal bar list: one bar per row, longest = full width. */
function BarList({ rows, formatMoney, showShare, locale }) {
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
            {showShare && <span className="bar-share">{new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(total > 0 ? r.value / total : 0)}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function Report({ quotes, filter, currency, rate, onBack }) {
  // The screen (buttons) follows the interface language; the sheet follows
  // `docLang`, which starts the same and can be changed (see DocLangSelect).
  const { t, lang } = useI18n()
  const [docLang, setDocLang] = useState(lang)
  const doc = useMemo(() => translatorFor(docLang), [docLang])
  // Money in the document's language: the decimal comma in Spanish and French.
  const formatMoney = n => fmtMoney(doc.locale, (Number.isFinite(n) ? n : 0) * rate, currency)
  const sorted = [...quotes].sort((a, b) => quoteDate(a) - quoteDate(b))
  const first = sorted[0] ? quoteDate(sorted[0]) : null
  const last = sorted.length ? quoteDate(sorted[sorted.length - 1]) : null
  const fmtDate = dt => fmtDay(doc.locale, dt)

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
    const month = fmtMonthShort(doc.locale, dt)
    const entry = monthMap.get(key) ?? { key, month, year: dt.getFullYear(), january: dt.getMonth() === 0, value: 0, count: 0 }
    entry.value += orderTotal(q)
    entry.count += 1
    monthMap.set(key, entry)
  }
  const months = [...monthMap.values()].slice(-12)
  const maxMonth = Math.max(...months.map(m => m.value), 0)

  // --- Chart 2: where the cost of an average part goes ---
  const withParts = quotes.filter(q => q.parts)
  const breakdown = LAYER_KEYS
    // ?? 0: older quotes have no `extras` (saved before it existed), and one
    // undefined would turn the whole average into NaN.
    .map(key => ({ key, label: doc.t(`layer.${key}`), value: average(withParts.map(q => q.parts[key] ?? 0)) }))
    // A cost nobody had (no other costs in any quote) isn't a bar worth drawing.
    .filter(row => row.key !== 'extras' || row.value > 0)
    .sort((a, b) => b.value - a.value)

  // --- Chart 3: top clients by quoted value ---
  const clientMap = new Map()
  for (const q of quotes) {
    const name = q.client || doc.t('report.noClient')
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
    document.title = doc.t('report.pageTitle', { date: new Date().toISOString().slice(0, 10) })
    return () => { document.title = previous }
  }, [doc])

  return (
    <div className="report-screen">
      <div className="report-actions no-print">
        <button type="button" className="controls" onClick={onBack}>← {t('doc.back')}</button>
        {/* The hint is the button's tooltip here; the customer quote, used first, shows it in full. */}
        <button type="button" className="controls primary" title={t('doc.printHint')} onClick={() => window.print()}>{t('doc.savePdf')}</button>
        <DocLangSelect value={docLang} onChange={setDocLang} />
      </div>

      <article className="report" lang={doc.lang}>
        <header className="report-head">
          <div>
            <div className="report-brand"><Logo size={16} small /> layercents</div>
            <h1>{doc.t('report.title')}</h1>
            <p className="report-sub">
              {first && `${fmtDate(first)} – ${fmtDate(last)}`}
              {filter && <> · {doc.t('report.filtered', { filter })}</>}
            </p>
          </div>
          <div className="report-meta">
            <span>{doc.t('report.generated', { date: fmtDate(new Date()) })}</span>
            <span>{doc.t('report.amountsIn', { currency })}</span>
          </div>
        </header>

        {/* Figures in a row split by thin rules, not five boxes. A figure
            nobody can compute (profit, when no quote has its form data)
            is left out instead of printing a dash. */}
        <dl className="report-kpis">
          <div className="kpi"><dt>{doc.t('report.kpi.quotes')}</dt><dd>{quotes.length}</dd></div>
          <div className="kpi"><dt>{doc.t('report.kpi.total')}</dt><dd>{formatMoney(totalQuoted)}</dd></div>
          <div className="kpi"><dt>{doc.t('report.kpi.avgPrice')}</dt><dd>{formatMoney(avgPrice)}</dd></div>
          <div className="kpi"><dt>{doc.t('report.kpi.avgCost')}</dt><dd>{formatMoney(avgCost)}</dd></div>
          {withInputs.length > 0 && (
            <div className="kpi"><dt>{doc.t('report.kpi.avgProfit')}</dt><dd className={avgProfit < 0 ? 'loss' : undefined}>{formatMoney(avgProfit)}</dd></div>
          )}
        </dl>

        <section className="report-block">
          <h2>{doc.t('report.perMonth')}</h2>
          {months.length < MIN_COLUMNS ? (
            /* With two or three months, columns were a couple of bars stuck
               to the left of an empty axis: the same data reads better as rows. */
            <BarList rows={months.map(m => ({ label: `${m.month} ${m.year}`, value: m.value }))} formatMoney={formatMoney} />
          ) : (
          <div className="columns-chart" role="img" aria-label={doc.t('report.perMonth')}>
            {months.map((m, i) => (
              <div className="col" key={m.key} title={`${m.month} ${m.year}: ${formatMoney(m.value)} (${doc.tp('count.quotes', m.count)})`}>
                {/* Whole units over the bar: "1 250" fits where "1 250,00 €" would not. */}
                <span className="col-value">{fmtNumber(doc.locale, m.value * rate, 0)}</span>
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
          )}
        </section>

        <div className={`report-two${withParts.length ? '' : ' one'}`}>
          {/* No quote with a breakdown: no chart, instead of a sentence apologising for it. */}
          {withParts.length > 0 && (
            <section className="report-block">
              <h2>{doc.t('report.breakdown')}</h2>
              <BarList rows={breakdown} formatMoney={formatMoney} showShare locale={doc.locale} />
            </section>
          )}
          <section className="report-block">
            <h2>{doc.t('report.topClients')}</h2>
            <BarList rows={clients} formatMoney={formatMoney} />
          </section>
        </div>

        {/* "breakable": a long table may continue on the next page */}
        <section className="report-block breakable">
          <h2>{doc.t('report.all')}</h2>
          <div className="table-scroll">
          <table className="report-table">
            <thead>
              <tr>
                <th>{doc.t('history.col.date')}</th>
                <th>{doc.t('history.col.part')}</th>
                <th>{doc.t('history.col.client')}</th>
                <th className="num">{doc.t('history.col.qty')}</th>
                <th className="num">{doc.t('history.col.cost')}</th>
                <th className="num">{doc.t('history.col.price')}</th>
                <th className="num">{doc.t('history.col.total')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(q => (
                <tr key={q.id}>
                  <td>{fmtDate(quoteDate(q))}</td>
                  <td className="strong">{q.name ?? doc.t('save.untitled')}</td>
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
                <td colSpan={3}>{doc.t('report.total')}</td>
                <td className="num">{quotes.reduce((sum, q) => sum + (q.units ?? 1), 0)}</td>
                <td colSpan={2} />
                <td className="num">{formatMoney(totalQuoted)}</td>
              </tr>
            </tbody>
          </table>
          </div>
        </section>

        <footer className="report-foot">
          {doc.t('report.foot')}
        </footer>
      </article>
    </div>
  )
}
