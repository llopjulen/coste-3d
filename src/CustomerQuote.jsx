import { useEffect, useState } from 'react'

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
      .map(q => ({ id: q.id, name: q.name ?? 'Untitled part', qty: q.units ?? 1, unitPrice: q.price }))
  )

  // Business details: update the screen and save them for next time.
  const saveBusiness = (patch) => {
    const next = { ...business, ...patch }
    setBusiness(next)
    try {
      localStorage.setItem(BUSINESS_KEY, JSON.stringify(next))
      setBusinessError('')
    } catch {
      setBusinessError("Couldn't save your business details in this browser (storage full or blocked). The quote still works.")
    }
  }

  const uploadLogo = async (file) => {
    if (!file) return
    try {
      saveBusiness({ logo: await shrinkImage(file) })
    } catch {
      setBusinessError("That image couldn't be read. Try a PNG or JPG.")
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
  const money = (c) => `${(c / 100).toFixed(2)} ${currency}`
  const lineCents = (l) => l.qty * cents(l.unitPrice)
  const subtotal = lines.reduce((sum, l) => sum + lineCents(l), 0)
  const shippingCents = cents(shipping)
  const taxRate = Math.max(Number(business.tax) || 0, 0)
  const tax = Math.round((subtotal + shippingCents) * taxRate / 100)
  const total = subtotal + shippingCents + tax

  const today = new Date()
  const validUntil = new Date(today.getTime() + Math.max(Number(business.validDays) || 0, 0) * DAY)
  const fmtDate = dt => dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  // The PDF takes its file name from the page title: "Quote 2026-004 Ana".
  useEffect(() => {
    const previous = document.title
    document.title = `Quote ${number}${client ? ` ${client}` : ''}`
    return () => { document.title = previous }
  }, [number, client])

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
        <button type="button" className="controls" onClick={onBack}>← Back to history</button>
        <button type="button" className="controls primary" onClick={savePdf} disabled={lines.length === 0}>Save as PDF</button>
        <span className="muted">In the print window, choose “Save as PDF” as the destination.</span>
      </div>

      <div className="quote-editor no-print">
        <section className="panel">
          <h2>This quote</h2>
          <div className="form-grid">
            <div className="form-pair">
              <div className="form-row">
                <label htmlFor="q-client">Client</label>
                <input id="q-client" className="text-input" value={client} onChange={e => setClient(e.target.value)} placeholder="Client name" />
              </div>
              <div className="form-row">
                <label htmlFor="q-number">Quote number</label>
                <input id="q-number" className="text-input" value={number} onChange={e => setNumber(e.target.value)} />
              </div>
            </div>

            <div className="line-edit line-head" aria-hidden="true">
              <span>Item</span><span>Qty</span><span>Unit price ({currency})</span><span />
            </div>
            {lines.map(line => (
              <div className="line-edit" key={line.id}>
                <input
                  className="text-input"
                  aria-label="Item name"
                  value={line.name}
                  onChange={e => updateLine(line.id, { name: e.target.value })}
                />
                <input
                  className="text-input num-input"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  aria-label={`Quantity of ${line.name}`}
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
                  aria-label={`Unit price of ${line.name}`}
                  defaultValue={(line.unitPrice * rate).toFixed(2)}
                  onChange={e => updateLine(line.id, { unitPrice: toEur(e.target.value) })}
                />
                <button type="button" className="row-btn danger" aria-label={`Remove ${line.name}`} onClick={() => removeLine(line.id)}>✕</button>
              </div>
            ))}
            {lines.length === 0 && <p className="form-hint">No parts left. Go back to History and tick the parts for this client.</p>}

            <div className="form-pair">
              <div className="form-row">
                <label htmlFor="q-shipping">Shipping ({currency})</label>
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
                <label htmlFor="q-tax">Tax (%)</label>
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
            <p className="form-hint">Prices here only change this quote, not your history.</p>
          </div>
        </section>

        <section className="panel">
          <h2>Your business · saved for next time</h2>
          <div className="form-grid">
            <div className="form-row">
              <span className="form-label">Logo</span>
              <div className="logo-row">
                {business.logo && <img className="logo-preview" src={business.logo} alt="Your logo" />}
                <label className="controls file-label">
                  {business.logo ? 'Change logo' : 'Upload logo'}
                  <input type="file" accept="image/*" className="sr-only" onChange={e => { uploadLogo(e.target.files[0]); e.target.value = '' }} />
                </label>
                {business.logo && <button type="button" className="row-btn danger" onClick={() => saveBusiness({ logo: '' })}>Remove</button>}
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="b-name">Business name</label>
              <input id="b-name" className="text-input" value={business.name} onChange={e => saveBusiness({ name: e.target.value })} placeholder="e.g. Layer Lab 3D" />
            </div>
            <div className="form-row">
              <label htmlFor="b-contact">Contact details</label>
              <textarea id="b-contact" className="text-input" rows="2" value={business.contact} onChange={e => saveBusiness({ contact: e.target.value })} placeholder={'Email, phone, website\nTax ID if you invoice'} />
            </div>
            <div className="form-row">
              <label htmlFor="b-notes">Notes on every quote</label>
              <textarea id="b-notes" className="text-input" rows="2" value={business.notes} onChange={e => saveBusiness({ notes: e.target.value })} placeholder="e.g. Delivery in 5 working days. 50% paid upfront." />
            </div>
            <div className="form-row">
              <label htmlFor="b-valid">Quote valid for (days)</label>
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
      <article className="report quote-doc">
        <header className="quote-top">
          <div className="quote-from">
            {business.logo && <img className="quote-logo" src={business.logo} alt={business.name || 'Logo'} />}
            {business.name && <div className="quote-business">{business.name}</div>}
            {business.contact && <div className="quote-contact">{business.contact}</div>}
            {!business.logo && !business.name && <div className="quote-contact no-print">Your logo and business name go here.</div>}
          </div>
          <div className="quote-title">
            <h1>Quote</h1>
            <dl>
              <dt>No.</dt><dd>{number}</dd>
              <dt>Date</dt><dd>{fmtDate(today)}</dd>
              {Number(business.validDays) > 0 && <><dt>Valid until</dt><dd>{fmtDate(validUntil)}</dd></>}
            </dl>
          </div>
        </header>

        {client && (
          <div className="quote-to">
            <div className="label">Quote for</div>
            <div className="name">{client}</div>
          </div>
        )}

        <div className="table-scroll quote-lines">
          <table className="report-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Qty</th>
                <th className="num">Unit price</th>
                <th className="num">Total</th>
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
          <dt>Subtotal</dt><dd>{money(subtotal)}</dd>
          {shippingCents > 0 && <><dt>Shipping</dt><dd>{money(shippingCents)}</dd></>}
          {taxRate > 0 && <><dt>Tax ({taxRate}%)</dt><dd>{money(tax)}</dd></>}
          <dt className="grand">Total</dt><dd className="grand">{money(total)}</dd>
        </dl>

        {business.notes && (
          <section className="quote-notes">
            <h2>Notes</h2>
            <p>{business.notes}</p>
          </section>
        )}

        <footer className="report-foot">Quote made with Print Cost · llopjulen.github.io/coste-3d</footer>
      </article>
    </div>
  )
}
