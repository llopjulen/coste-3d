import { useEffect, useMemo, useState } from 'react'
import { useI18n } from './i18n/context.js'
import { fmtMoney, fmtNumber, parseNumber } from './i18n/format.js'
import { embedQuote, embedRates, embedTheme } from './embed.js'

/* ==================================================================
   EMBED — the customer's quote, small enough to live inside an iframe in
   a shop's page (src/embed.js has the parameters and the arithmetic).

   It is NOT the calculator. The calculator is for the seller: it knows the
   seller's costs and margin. This is for the seller's CUSTOMER: three
   lines with the seller's final rates, a subtotal, tax and a total. Two
   consequences:
   - It reads nothing from the visitor's browser (no localStorage, no
     saved quotes, no setup) and makes no network request: no exchange
     rates, no agent on 127.0.0.1. Everything it knows is in its address.
     main.jsx renders it INSTEAD of <App />, so none of App's state runs.
   - The seller's costs never reach this page. Only what the customer
     pays does, and that is public by nature.
================================================================== */

/* Tells the page that holds the iframe how tall the widget is, so it can
   resize the iframe and avoid an inner scroll bar. An iframe cannot size
   itself: the parent page is a different document (and a different
   origin), so it can't read our height either. postMessage is the one
   door the browser leaves open between the two.
   targetOrigin is '*' on purpose: we don't know which shop embeds us, and
   what we send is only a number. Never put anything private in this
   message. The receiving side must check `event.origin` (docs/EMBED.md). */
function useReportHeight() {
  useEffect(() => {
    if (window.parent === window) return // opened on its own, not inside an iframe
    let last = 0
    const send = () => {
      const height = Math.ceil(document.documentElement.getBoundingClientRect().height)
      if (height === last) return
      last = height
      window.parent.postMessage({ type: 'layercents:height', height }, '*')
    }
    const watcher = new ResizeObserver(send)
    watcher.observe(document.documentElement)
    send()
    return () => watcher.disconnect()
  }, [])
}

function Row({ id, label, value, onChange }) {
  return (
    <div className="embed-row">
      <label htmlFor={id}>{label}</label>
      {/* type="text" + inputMode="decimal": the number pad on a phone, and a
          comma or a point both work (DESIGN.md, "Campos numéricos"). */}
      <input id={id} type="text" inputMode="decimal" autoComplete="off" value={value} onChange={e => onChange(e.target.value)} placeholder="0" />
    </div>
  )
}

export default function Embed() {
  const { t, locale } = useI18n()
  // The address doesn't change while the widget is open: read it once.
  const [search] = useState(() => window.location.search)
  const look = useMemo(() => embedTheme(search), [search])
  const rates = useMemo(() => embedRates(search), [search])

  const [text, setText] = useState({ grams: '', hours: '', minutes: '' })
  const set = key => value => setText(prev => ({ ...prev, [key]: value }))

  useReportHeight()

  // An unreadable value counts as 0: while typing "1," the total shouldn't flicker or break.
  const n = v => parseNumber(v) ?? 0
  const q = embedQuote({ grams: n(text.grams), hours: n(text.hours), labourMinutes: n(text.minutes) }, rates)
  const money = c => fmtMoney(locale, c / 100, rates.currency)
  const detail = (key, v) => (n(v) > 0 ? t(key, { amount: fmtNumber(locale, n(v), 1) }) : '')

  return (
    <main
      className="embed"
      data-transparent={look.transparent ? '' : undefined}
      style={{ ...look.vars, colorScheme: look.theme }}
    >
      <h1 className="sr-only">{t('embed.title')}</h1>

      <section className="embed-group" aria-label={t('embed.title')}>
        <Row id="e-grams" label={t('embed.grams')} value={text.grams} onChange={set('grams')} />
        <Row id="e-hours" label={t('embed.hours')} value={text.hours} onChange={set('hours')} />
        <Row id="e-min" label={t('embed.minutes')} value={text.minutes} onChange={set('minutes')} />
      </section>

      {/* aria-live: a screen reader hears the new total when a value changes. */}
      <section className="embed-group embed-quote" aria-live="polite">
        <dl>
          <div className="embed-line">
            <dt>{t('embed.filament')}<small>{detail('embed.detailGrams', text.grams)}</small></dt>
            <dd>{money(q.filament)}</dd>
          </div>
          <div className="embed-line">
            <dt>{t('embed.machine')}<small>{detail('embed.detailHours', text.hours)}</small></dt>
            <dd>{money(q.machine)}</dd>
          </div>
          <div className="embed-line">
            <dt>{t('embed.labour')}<small>{detail('embed.detailMinutes', text.minutes)}</small></dt>
            <dd>{money(q.labour)}</dd>
          </div>
          {rates.taxPercent > 0 && (
            <>
              <div className="embed-line embed-sub">
                <dt>{t('embed.subtotal')}</dt>
                <dd>{money(q.subtotal)}</dd>
              </div>
              <div className="embed-line embed-sub">
                <dt>{rates.taxName ? t('embed.taxRate', { name: rates.taxName, rate: fmtNumber(locale, rates.taxPercent, 2) }) : t('embed.tax')}</dt>
                <dd>{money(q.tax)}</dd>
              </div>
            </>
          )}
          <div className="embed-line embed-total">
            <dt>{t('embed.total')}</dt>
            <dd>{money(q.total)}</dd>
          </div>
        </dl>
      </section>

      <p className="embed-foot">
        <a href="https://layercents.com/" target="_blank" rel="noopener">{t('embed.poweredBy')}</a>
      </p>
    </main>
  )
}
