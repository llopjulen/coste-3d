import { useEffect, useMemo, useState } from 'react'
import DocLangSelect from './DocLangSelect.jsx'
import { useI18n } from './i18n/context.js'
import { translatorFor } from './i18n/dicts.js'
import { fmtLongDay, fmtMoney, fmtNumber } from './i18n/format.js'

/* ==================================================================
   CUSTOMER QUOTE — the document you send to a client.
   Built from the parts ticked in History. It only shows prices: no
   costs, margins or fees, those stay private. On screen the form is
   on top and the sheet below; "Save as PDF" prints only the sheet.
================================================================== */

const BUSINESS_KEY = 'business'
const COUNTER_KEY = 'quoteCounter'
const EMPTY_BUSINESS = { name: '', contact: '', logo: '', notes: '', tax: 0, validDays: 30 }
const DAY = 24 * 60 * 60 * 1000

// Your business details are saved in the browser and reused next time.
function loadBusiness() {
  try {
    return { ...EMPTY_BUSINESS, ...JSON.parse(localStorage.getItem(BUSINESS_KEY)) }
  } catch {
    return EMPTY_BUSINESS
  }
}
function loadCounter() {
  try {
    const n = Number(localStorage.getItem(COUNTER_KEY))
    return n > 0 ? n : 1
  } catch {
    return 1
  }
}

// If every ticked part has the same client, that's who the quote is for.
function defaultClient(quotes) {
  const clients = [...new Set(quotes.map(q => q.client).filter(Boolean))]
  return clients.length === 1 ? clients[0] : ''
}

/* Shrinks a logo to at most 480 × 200 px so it fits in localStorage. */
async function shrinkImage(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    // Some SVG files have no size of their own: ask for a PNG or JPG.
    if (!img.width || !img.height) throw new Error('image without size')
    const scale = Math.min(1, 480 / img.width, 200 / img.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function CustomerQuote({ quotes, currency, rate, onBack }) {
  // `t` speaks the language of the screen (the form); `doc` speaks the language
  // of the SHEET the client reads, which starts the same but can be changed:
  // you can work in Spanish and send the quote in English.
  const { t, lang } = useI18n()
  const [docLang, setDocLang] = useState(lang)
  const doc = useMemo(() => translatorFor(docLang), [docLang])
  const [business, setBusiness] = useState(loadBusiness)
  const [businessError, setBusinessError] = useState('')
  const [counter] = useState(loadCounter)
  const defaultNumber = `${new Date().getFullYear()}-${String(counter).padStart(3, '0')}`
  const [number, setNumber] = useState(defaultNumber)
  const [client, setClient] = useState(() => defaultClient(quotes))
  const [shipping, setShipping] = useState(0) // stored in EUR, like every price
  const [lines, setLines] = useState(() =>
    [...quotes]
      .sort((a, b) => new Date(a.createdAt ?? a.id) - new Date(b.createdAt ?? b.id))
      .map(q => ({ id: q.id, name: q.name ?? t('save.untitled'), qty: q.units ?? 1, unitPrice: q.price }))
  )

  // Business details: update the screen and save them for next time.
  const saveBusiness = (patch) => {
    const next = { ...business, ...patch }
    setBusiness(next)
    try {
      localStorage.setItem(BUSINESS_KEY, JSON.stringify(next))
      setBusinessError('')
    } catch {
      setBusinessError(t('quote.err.save'))
    }
  }

  const uploadLogo = async (file) => {
    if (!file) return
    try {
      saveBusiness({ logo: await shrinkImage(file) })
    } catch {
      setBusinessError(t('quote.err.logo'))
    }
  }

  // Prices are typed in the currency on screen and stored in EUR.
  const toEur = (text) => (parseFloat(String(text).replace(',', '.')) || 0) / rate
  const updateLine = (id, patch) => setLines(lines.map(l => (l.id === id ? { ...l, ...patch } : l)))
  const removeLine = (id) => setLines(lines.filter(l => l.id !== id))

  // --- Totals, in cents of the currency on screen ---
  // Every amount is rounded to the cent BEFORE adding, so the lines on
  // the sheet always add up exactly to the total the client reads.
  const cents = (eur) => Math.round(eur * rate * 100)
  // In the language of the document: "12.50 EUR" or "12,50 EUR". The cents stay integers; only the text changes.
  const money = (c) => fmtMoney(doc.locale, c / 100, currency)
  const lineCents = (l) => l.qty * cents(l.unitPrice)
  const subtotal = lines.reduce((sum, l) => sum + lineCents(l), 0)
  const shippingCents = cents(shipping)
  const taxRate = Math.max(Number(business.tax) || 0, 0)
  const tax = Math.round((subtotal + shippingCents) * taxRate / 100)
  const total = subtotal + shippingCents + tax

  const today = new Date()
  const validUntil = new Date(today.getTime() + Math.max(Number(business.validDays) || 0, 0) * DAY)
  const fmtDate = dt => fmtLongDay(doc.locale, dt)

  // The PDF takes its file name from the page title: "Quote 2026-004 Ana".
  useEffect(() => {
    const previous = document.title
    document.title = `${doc.t('quote.pageTitle', { number })}${client ? ` ${client}` : ''}`
    return () => { document.title = previous }
  }, [number, client, doc])

  const [counterUsed, setCounterUsed] = useState(false)
  const savePdf = () => {
    window.print()
    // The next quote gets the next number, once this one has been used.
    if (!counterUsed && number === defaultNumber) {
      try { localStorage.setItem(COUNTER_KEY, String(counter + 1)) } catch { /* not critical */ }
      setCounterUsed(true)
    }
  }

  return (
    <div className="report-screen">
      <div className="report-actions no-print">
        <button type="button" className="controls" onClick={onBack}>← {t('doc.back')}</button>
        <button type="button" className="controls primary" onClick={savePdf} disabled={lines.length === 0}>{t('doc.savePdf')}</button>
        <DocLangSelect value={docLang} onChange={setDocLang} />
        <span className="muted">{t('doc.printHint')}</span>
      </div>

      <div className="quote-editor no-print">
        <section className="panel">
          <h2>{t('quote.this')}</h2>
          <div className="form-grid">
            <div className="form-pair">
              <div className="form-row">
                <label htmlFor="q-client">{t('quote.client')}</label>
                <input id="q-client" className="text-input" value={client} onChange={e => setClient(e.target.value)} placeholder={t('quote.clientPlaceholder')} />
              </div>
              <div className="form-row">
                <label htmlFor="q-number">{t('quote.number')}</label>
                <input id="q-number" className="text-input" value={number} onChange={e => setNumber(e.target.value)} />
              </div>
            </div>

            <div className="line-edit line-head" aria-hidden="true">
              <span>{t('quote.col.item')}</span><span>{t('quote.col.qty')}</span><span>{t('quote.col.unitCur', { currency })}</span><span />
            </div>
            {lines.map(line => (
              <div className="line-edit" key={line.id}>
                <input
                  className="text-input"
                  aria-label={t('quote.itemName')}
                  value={line.name}
                  onChange={e => updateLine(line.id, { name: e.target.value })}
                />
                <input
                  className="text-input num-input"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  aria-label={t('quote.qtyOf', { name: line.name })}
                  value={line.qty}
                  onChange={e => updateLine(line.id, { qty: Math.max(0, Math.floor(Number(e.target.value)) || 0) })}
                />
                {/* Typed in the currency on screen. The key makes the box
                    redraw its number when the currency changes. */}
                <input
                  key={`${line.id}-${currency}`}
                  className="text-input num-input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  aria-label={t('quote.unitOf', { name: line.name })}
                  defaultValue={(line.unitPrice * rate).toFixed(2)}
                  onChange={e => updateLine(line.id, { unitPrice: toEur(e.target.value) })}
                />
                <button type="button" className="row-btn danger" aria-label={t('quote.remove', { name: line.name })} onClick={() => removeLine(line.id)}>✕</button>
              </div>
            ))}
            {lines.length === 0 && <p className="form-hint">{t('quote.noParts')}</p>}

            <div className="form-pair">
              <div className="form-row">
                <label htmlFor="q-shipping">{t('quote.shipping', { currency })}</label>
                <input
                  id="q-shipping"
                  key={`shipping-${currency}`}
                  className="text-input num-input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  defaultValue={(shipping * rate).toFixed(2)}
                  onChange={e => setShipping(toEur(e.target.value))}
                />
              </div>
              <div className="form-row">
                <label htmlFor="q-tax">{t('quote.tax')}</label>
                <input
                  id="q-tax"
                  className="text-input num-input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={business.tax}
                  onChange={e => saveBusiness({ tax: Math.max(Number(e.target.value) || 0, 0) })}
                />
              </div>
            </div>
            <p className="form-hint">{t('quote.pricesHint')}</p>
          </div>
        </section>

        <section className="panel">
          <h2>{t('quote.business')}</h2>
          <div className="form-grid">
            <div className="form-row">
              <span className="form-label">{t('quote.logo')}</span>
              <div className="logo-row">
                {business.logo && <img className="logo-preview" src={business.logo} alt={t('quote.logoAlt')} />}
                <label className="controls file-label">
                  {business.logo ? t('quote.logo.change') : t('quote.logo.upload')}
                  <input type="file" accept="image/*" className="sr-only" onChange={e => { uploadLogo(e.target.files[0]); e.target.value = '' }} />
                </label>
                {business.logo && <button type="button" className="row-btn danger" onClick={() => saveBusiness({ logo: '' })}>{t('quote.logo.remove')}</button>}
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="b-name">{t('quote.bizName')}</label>
              <input id="b-name" className="text-input" value={business.name} onChange={e => saveBusiness({ name: e.target.value })} placeholder={t('quote.bizNamePh')} />
            </div>
            <div className="form-row">
              <label htmlFor="b-contact">{t('quote.contact')}</label>
              <textarea id="b-contact" className="text-input" rows="2" value={business.contact} onChange={e => saveBusiness({ contact: e.target.value })} placeholder={t('quote.contactPh')} />
            </div>
            <div className="form-row">
              <label htmlFor="b-notes">{t('quote.notesLabel')}</label>
              <textarea id="b-notes" className="text-input" rows="2" value={business.notes} onChange={e => saveBusiness({ notes: e.target.value })} placeholder={t('quote.notesPh')} />
            </div>
            <div className="form-row">
              <label htmlFor="b-valid">{t('quote.valid')}</label>
              <input
                id="b-valid"
                className="text-input num-input"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={business.validDays}
                onChange={e => saveBusiness({ validDays: Math.max(Math.floor(Number(e.target.value)) || 0, 0) })}
              />
            </div>
            {businessError && <p className="form-error" role="alert">{businessError}</p>}
          </div>
        </section>
      </div>

      {/* ---------------- The sheet that becomes the PDF ---------------- */}
      <article className="report quote-doc" lang={doc.lang}>
        <header className="quote-top">
          <div className="quote-from">
            {business.logo && <img className="quote-logo" src={business.logo} alt={business.name || 'Logo'} />}
            {business.name && <div className="quote-business">{business.name}</div>}
            {business.contact && <div className="quote-contact">{business.contact}</div>}
            {!business.logo && !business.name && <div className="quote-contact no-print">{t('quote.doc.placeholder')}</div>}
          </div>
          <div className="quote-title">
            <h1>{doc.t('quote.doc.title')}</h1>
            <dl>
              <dt>{doc.t('quote.doc.no')}</dt><dd>{number}</dd>
              <dt>{doc.t('quote.doc.date')}</dt><dd>{fmtDate(today)}</dd>
              {Number(business.validDays) > 0 && <><dt>{doc.t('quote.doc.validUntil')}</dt><dd>{fmtDate(validUntil)}</dd></>}
            </dl>
          </div>
        </header>

        {client && (
          <div className="quote-to">
            <div className="label">{doc.t('quote.doc.for')}</div>
            <div className="name">{client}</div>
          </div>
        )}

        <div className="table-scroll quote-lines">
          <table className="report-table">
            <thead>
              <tr>
                <th>{doc.t('quote.col.item')}</th>
                <th className="num">{doc.t('quote.col.qty')}</th>
                <th className="num">{doc.t('quote.col.unit')}</th>
                <th className="num">{doc.t('quote.col.total')}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(line => (
                <tr key={line.id}>
                  <td className="strong">{line.name}</td>
                  <td className="num">{line.qty}</td>
                  <td className="num">{money(cents(line.unitPrice))}</td>
                  <td className="num">{money(lineCents(line))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="quote-totals">
          <dt>{doc.t('quote.doc.subtotal')}</dt><dd>{money(subtotal)}</dd>
          {shippingCents > 0 && <><dt>{doc.t('quote.doc.shipping')}</dt><dd>{money(shippingCents)}</dd></>}
          {taxRate > 0 && <><dt>{doc.t('quote.doc.tax', { rate: fmtNumber(doc.locale, taxRate, 2) })}</dt><dd>{money(tax)}</dd></>}
          <dt className="grand">{doc.t('quote.doc.total')}</dt><dd className="grand">{money(total)}</dd>
        </dl>

        {business.notes && (
          <section className="quote-notes">
            <h2>{doc.t('quote.doc.notes')}</h2>
            <p>{business.notes}</p>
          </section>
        )}

        <footer className="report-foot">{doc.t('quote.doc.footer')}</footer>
      </article>
    </div>
  )
}
