import { useState, useEffect } from 'react'
import History from './History.jsx'
import Report from './Report.jsx'
import ImportFile from './ImportFile.jsx'
import CustomerQuote from './CustomerQuote.jsx'

/* ==================================================================
   1) FIELDS
   Every label, unit and default value lives HERE. Changing a text or
   adding a field means touching this list only: the form is drawn
   by looping over it.
================================================================== */
const SECTIONS = [
  {
    title: 'Material',
    fields: [
      { key: 'spoolPrice', label: 'Spool price',     unit: '€', initial: 20,   help: 'What you paid for the whole spool, shipping included.' },
      { key: 'spoolWeight', label: 'Spool weight',    unit: 'g', initial: 1000, help: 'Grams of filament it holds, not counting the reel itself. 1000 g is standard, but 750 g and 250 g spools exist too.' },
      { key: 'partGrams', label: 'Part weight',       unit: 'g', initial: 45,   help: "What your slicer shows after slicing. If you're printing several parts on one plate, enter the weight of a single one." },
      { key: 'purgeGrams', label: 'Purge & waste',    unit: 'g', initial: 0,    help: 'Filament that ends up in the bin: purge towers and AMS color changes. On multicolor prints this can outweigh the part itself.' },
    ],
  },
  {
    title: 'Printer',
    fields: [
      { key: 'hours', label: 'Print time',          unit: 'h', initial: 3.5,  help: "Your slicer's time estimate for one part." },
      { key: 'watts', label: 'Power draw',          unit: 'W', initial: 110,  help: "Average wattage while printing. PLA on an enclosed printer like the P1S sits around 100-120 W; a hot bed pushes it higher." },
      { key: 'kwhPrice', label: 'Price per kWh',    unit: '€', initial: 0.15, help: 'What your electricity provider charges per kilowatt-hour. Check your bill.' },
      { key: 'printerPrice', label: 'Printer cost', unit: '€', initial: 700,  help: 'What the machine cost you. Add upgrades or replacement parts if you have any.' },
      { key: 'lifespan', label: 'Expected lifespan', unit: 'h', initial: 3000, help: "Hours you expect it to last before retiring it. Its cost gets spread across those hours, same as any shop does with its machines." },
      { key: 'failRate', label: 'Failure rate',     unit: '%', initial: 8,    help: "Out of 100 prints, how many end up in the bin. Leaving this at 0 means claiming you never fail, and that's exactly the assumption that quietly loses money." },
    ],
  },
  {
    title: 'Labor',
    fields: [
      { key: 'postMinutes', label: 'Post-processing', unit: 'min', initial: 10, help: 'Minutes spent removing supports, sanding, assembling and packing. The part of the work almost everyone gives away for free.' },
      { key: 'hourlyRate', label: 'Hourly rate',       unit: '€',   initial: 15, help: "What you want to be paid per hour. If you're not sure, start with what you earn per hour at your day job." },
      { key: 'packaging', label: 'Packaging',          unit: '€',   initial: 0.8, help: 'Bag, box, label and filler for one unit.' },
    ],
  },
  {
    title: 'Selling',
    fields: [
      { key: 'quantity', label: 'Order quantity', unit: 'pcs', initial: 1,  help: "Parts in this order. Only changes the total — the per-part cost stays the same." },
      { key: 'fee', label: 'Platform fee',         unit: '%',  initial: 8,  help: 'What the platform keeps between commission and card processing. Selling in person, this is 0.' },
      { key: 'margin', label: 'Target margin',     unit: '%',  initial: 40, help: "What you want to earn on top of cost. Below 20% you have nothing left to reinvest or absorb a surprise." },
      { key: 'currentPrice', label: 'Current price', unit: '€', initial: 12, help: 'What you currently charge for the part. Used to compare against the recommended price.' },
    ],
  },
]

/* Initial state is built straight from the list above, so a default
   value can never be forgotten when a field is added. */
const INITIAL = Object.fromEntries(
  SECTIONS.flatMap(s => s.fields.map(f => [f.key, f.initial]))
)

/* Stack colors: material is green because it's the filament; the
   rest are the costs nobody sees. */
const LAYERS = [
  { key: 'material',      name: 'Material',      color: '#00AE42' },
  { key: 'power',         name: 'Power',         color: '#12A594' },
  { key: 'depreciation',  name: 'Depreciation',  color: '#3E8FD0' },
  { key: 'failures',      name: 'Failures',      color: '#6E74C4' },
  { key: 'labor',         name: 'Labor',         color: '#7E7E8C' },
  { key: 'packaging',     name: 'Packaging',     color: '#4E4E58' },
]



/* ==================================================================
   2) CALCULATION — a pure function: numbers in, numbers out.
   It knows nothing about React or the screen.
================================================================== */
function calculate(d) {
  const pricePerGram = d.spoolWeight > 0 ? d.spoolPrice / d.spoolWeight : 0

  const material = (d.partGrams + d.purgeGrams) * pricePerGram
  const power = (d.watts / 1000) * d.hours * d.kwhPrice
  const depreciation = d.lifespan > 0 ? d.hours * (d.printerPrice / d.lifespan) : 0

  // If 8 out of 100 prints go to the bin, the 92 good ones have to
  // cover the material and hours spent on the 8 failed ones.
  const failures = (material + power + depreciation) * (d.failRate / 100)

  const labor = (d.postMinutes / 60) * d.hourlyRate
  const packaging = d.packaging

  const parts = { material, power, depreciation, failures, labor, packaging }
  const cost = Object.values(parts).reduce((a, b) => a + b, 0)

  // The platform fee is taken from the FINAL price, not from your
  // cost: that's why we DIVIDE by (1 - fee) instead of multiplying.
  const f = Math.min(Math.max(d.fee, 0) / 100, 0.95)
  const recommendedPrice = (cost * (1 + d.margin / 100)) / (1 - f)

  const currentNet = d.currentPrice * (1 - f)
  const profit = currentNet - cost
  const perHour = d.hours > 0 ? profit / d.hours : 0
  const units = Math.max(Math.floor(d.quantity), 1)

  return {
    parts, cost, recommendedPrice, profit, perHour, currentNet, units,
    orderPrice: recommendedPrice * units,
    materialPct: cost > 0 ? (material / cost) * 100 : 0,
  }
}

/* ==================================================================
   3) UI PIECES
================================================================== */
function Field({ id, label, unit, help, value, onChange, open, onHelp }) {
  return (
    <div className="field">
      <div className="row">
        <div className="label-group">
          <label htmlFor={id}>{label}</label>
          {/* aria-expanded tells screen readers whether the text is
              open; aria-controls links it to the help block. */}
          <button
            type="button"
            className="info"
            aria-label={`What is ${label}`}
            aria-expanded={open}
            aria-controls={`help-${id}`}
            onClick={onHelp}
          >
            i
          </button>
        </div>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={value}
          /* The input doesn't hold its own value: it receives it from
             above and reports changes upward (controlled component). */
          onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        />
        <span className="unit">{unit}</span>
      </div>

      {/* Conditional rendering: when not open, this chunk simply
          doesn't exist on the page. */}
      {open && <p className="help" id={`help-${id}`}>{help}</p>}
    </div>
  )
}

/* ==================================================================
   4) APP
================================================================== */
export default function App() {
  const [d, setD] = useState(INITIAL)

  /* =========================
    ·Guardar Presupuesto
    =========================*/
    const [savedQuotes, setSavedQuotes] = useState(() => {
      // If the stored data is broken or blocked, start with an empty
      // list instead of crashing the whole app.
      try {
        const saved = JSON.parse(localStorage.getItem('savedQuotes'))
        return Array.isArray(saved) ? saved : []
      } catch {
        return []
      }
    })

    useEffect(() => {
      localStorage.setItem('savedQuotes', JSON.stringify(savedQuotes))
    }, [savedQuotes]) //al poner ahi el savedQuotes se ejecuta cada vez que savedQuotes cambie

    // What the user types in the "Part name" and "Client" boxes.
    const [quoteName, setQuoteName] = useState('')
    const [quoteClient, setQuoteClient] = useState('')

    const saveQuote = (e) => {
      // A <form> reloads the page when submitted; this stops it.
      e.preventDefault()
      const now = new Date()
      const quote = {
        id: now.getTime(),
        createdAt: now.toISOString(),
        date: now.toLocaleDateString(),
        name: quoteName.trim() || 'Untitled part',
        client: quoteClient.trim(),
        // A copy of every input and every cost layer, so the quote can
        // be exported or reviewed later even after the form changes.
        inputs: { ...d },
        parts: { ...r.parts },
        cost: r.cost,
        price: r.recommendedPrice,
        units: r.units,
        orderTotal: r.orderPrice,
      }
      setSavedQuotes([...savedQuotes, quote])
      setQuoteName('')
      setQuoteClient('')
      setJustSaved(quote.name)
    }

    // Name of the last saved quote, to show "Saved · View history".
    // The message hides itself after 5 seconds.
    const [justSaved, setJustSaved] = useState(null)
    useEffect(() => {
      if (!justSaved) return
      const timer = setTimeout(() => setJustSaved(null), 5000)
      return () => clearTimeout(timer)
    }, [justSaved])

    // "Load" in the history: put that quote's numbers back in the form.
    const loadQuote = (quote) => {
      setD({ ...INITIAL, ...quote.inputs })
      setQuoteName(quote.name ?? '')
      setQuoteClient(quote.client ?? '')
      setView('calculator')
      window.scrollTo(0, 0)
    }

    const deleteQuote = (id) => {
      setSavedQuotes(savedQuotes.filter( q => q.id !== id))
    }


  
  const [showFullBreakdown, setShowFullBreakdown] = useState(true)

  // Which screen is shown: 'calculator', 'history', 'report' or 'quote'.
  const [view, setView] = useState('calculator')

  // The report shows whatever History was showing when the button was
  // pressed (all quotes, or only the ones matching the search).
  const [report, setReport] = useState({ quotes: [], filter: '' })
  const openReport = (quotes, filter) => {
    setReport({ quotes, filter })
    setView('report')
    window.scrollTo(0, 0)
  }

  // The quotes ticked in History for a customer quote.
  const [quoteParts, setQuoteParts] = useState([])
  const openCustomerQuote = (quotes) => {
    setQuoteParts(quotes)
    setView('quote')
    window.scrollTo(0, 0)
  }

  const [currency, setCurrency] = useState('EUR')

  const[rates, setRates] = useState({ EUR: 1})

  const formatMoney = (n) => {
  const rate = rates[currency] || 1
  const value = (isFinite(n) ? n : 0) * rate
  return `${value.toFixed(2)} ${currency}`
}

  useEffect(() => {
    fetch('https://api.frankfurter.dev/v1/latest?from=EUR')
      .then(res => res.json())
      .then(data => setRates({ EUR: 1, ...data.rates}))
      .catch(() => {})
  }, [])
  
  /* The Excel code (and its library) is only downloaded the first
     time someone presses the button, so the page stays fast. */
  const [exporting, setExporting] = useState(false)
  const exportExcel = async (quotes) => {
    setExporting(true)
    try {
      const { exportQuotesToExcel } = await import('./exportExcel.js')
      await exportQuotesToExcel(quotes, currency, rates[currency] || 1)
    } catch (err) {
      console.error(err)
      alert('Could not create the Excel file. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const botonApagarCalculo = () => {
    setShowFullBreakdown(!showFullBreakdown)
  }
  // Only one help panel open at a time: store the key of the open
  // field, or null if none is open.
  const [openHelp, setOpenHelp] = useState(null)

  // Build a NEW object instead of mutating the old one: React detects
  // changes by comparing references, not contents.
  const set = key => value => setD(current => ({ ...current, [key]: value }))

  /* =========================
    ·Import from slicer
    =========================*/
  // What the fields held before the last imported file filled them,
  // so "Undo" can put exactly those fields back.
  const [beforeImport, setBeforeImport] = useState(null)

  const applyImport = (values, isNewFile) => {
    const previous = (keys) => Object.fromEntries(keys.map(key => [key, d[key]]))
    if (isNewFile) {
      setBeforeImport(previous(Object.keys(values)))
    } else {
      // Changing plate or parts can fill a field the first import didn't touch.
      setBeforeImport(prev => prev && { ...previous(Object.keys(values).filter(k => !(k in prev))), ...prev })
    }
    setD(current => ({ ...current, ...values }))
  }

  const undoImport = () => {
    if (!beforeImport) return
    setD(current => ({ ...current, ...beforeImport }))
    setBeforeImport(null)
  }

  // The result isn't stored in state, it's recalculated on every render.
  const r = calculate(d)

  return (
    <>
      <div className="topbar no-print">
        <i className="dot" />
        <strong>Print Cost</strong>
        <nav className="tabs">
          <button
            type="button"
            className={`tab ${view === 'calculator' ? 'active' : ''}`}
            aria-current={view === 'calculator' ? 'page' : undefined}
            onClick={() => setView('calculator')}
          >
            Calculator
          </button>
          <button
            type="button"
            className={`tab ${view !== 'calculator' ? 'active' : ''}`}
            aria-current={view !== 'calculator' ? 'page' : undefined}
            onClick={() => setView('history')}
          >
            History <span className="count">{savedQuotes.length}</span>
          </button>
        </nav>
        <select
          className="currency"
          aria-label="Currency"
          value={currency}
          onChange={e => setCurrency(e.target.value)}
        >
          {Object.keys(rates).map(code => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>
      </div>

      {view === 'quote' ? (
        <CustomerQuote
          quotes={quoteParts}
          currency={currency}
          rate={rates[currency] || 1}
          onBack={() => setView('history')}
        />
      ) : view === 'report' ? (
        <Report
          quotes={report.quotes}
          filter={report.filter}
          currency={currency}
          formatMoney={formatMoney}
          onBack={() => setView('history')}
        />
      ) : view === 'history' ? (
        <div className="wrap">
          <h1>Quote history</h1>
          <p className="subtitle">Every quote you saved on this device, newest first.</p>
          <History
            quotes={savedQuotes}
            formatMoney={formatMoney}
            onLoad={loadQuote}
            onDelete={deleteQuote}
            onExport={exportExcel}
            exporting={exporting}
            onReport={openReport}
            onCustomerQuote={openCustomerQuote}
            onGoToCalculator={() => setView('calculator')}
          />
        </div>
      ) : (
      <div className="wrap">
        <h1>What a printed part actually costs you</h1>
        <p className="subtitle">
          Material, power, printer depreciation, failed prints and your own time.
        </p>

        <div className="toolbar">
          <button className="controls" onClick={botonApagarCalculo}>{showFullBreakdown ? 'Show cost only' : 'Show Full Breakdown'}</button>
        </div>

        <form className="save-bar" onSubmit={saveQuote}>
          <input
            className="text-input"
            type="text"
            placeholder="Part name, e.g. Phone stand"
            aria-label="Part name"
            value={quoteName}
            onChange={e => setQuoteName(e.target.value)}
          />
          <input
            className="text-input"
            type="text"
            placeholder="Client (optional)"
            aria-label="Client"
            value={quoteClient}
            onChange={e => setQuoteClient(e.target.value)}
          />
          <button type="submit" className="controls">Save quote</button>
        </form>

        {/* role="status" makes screen readers announce the message */}
        <p className="saved-note" role="status">
          {justSaved && (
            <>
              Saved “{justSaved}” ·{' '}
              <button type="button" className="link" onClick={() => setView('history')}>View history</button>
            </>
          )}
        </p>

        <div className="columns">
          {/* --- Form: drawn by looping over SECTIONS --- */}
          <div>
            <ImportFile onApply={applyImport} onUndo={undoImport} />
            {SECTIONS.map(section => (
              (showFullBreakdown || !['Labor', 'Selling'].includes(section.title)) &&(
                <section className="panel" key={section.title}>
                  <h2>{section.title}</h2>
                  <div className="body">
                    {section.fields.map(field => (
                      <Field
                        key={field.key}
                        id={field.key}
                        label={field.label}
                        unit={field.unit}
                        help={field.help}
                        value={d[field.key]}
                        onChange={set(field.key)}
                        open={openHelp === field.key}
                        onHelp={() =>
                          setOpenHelp(k => (k === field.key ? null : field.key))
                        }
                      />
                    ))}
                  </div>
                </section>
              )
            ))}
          </div>

          {/* --- Result --- */}
          <div className="result">
            <div className="panel">
              <h2>Breakdown</h2>
              <div className="cross-section">
                <div className="stack" aria-hidden="true">
                  {LAYERS.map(layer => (
                    <div
                      key={layer.key}
                      className="layer"
                      style={{
                        height: `${r.cost > 0 ? (r.parts[layer.key] / r.cost) * 100 : 0}%`,
                        backgroundColor: layer.color,
                      }}
                    />
                  ))}
                </div>
                <div className="legend">
                  {LAYERS.map(layer => (
                    <div className="row-legend" key={layer.key}>
                      <i className="swatch" style={{ backgroundColor: layer.color }} />
                      <span className="name">{layer.name}</span>
                      <span className="value">{formatMoney(r.parts[layer.key])}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="figure main">
                <span className="label">Cost per part</span>
                <span className="value">{formatMoney(r.cost)}</span>
              </div>
              <div className="figure highlight">
                <span className="label">Recommended price</span>
                <span className="value">{formatMoney(r.recommendedPrice)}</span>
              </div>
              <div className="figure">
                <span className="label">Profit per printer hour</span>
                <span className="value">{formatMoney(r.perHour)}</span>
              </div>
              {r.units > 1 && (
                <div className="figure">
                  <span className="label">Order total ({r.units} pcs)</span>
                  <span className="value">{formatMoney(r.orderPrice)}</span>
                </div>
              )}
            </div>

            <div className="panel">
              <div className="verdict">
                <span className="context">At your current selling price</span>
                <div className={`sentence ${r.profit < 0 ? 'loss' : 'gain'}`}>
                  {r.profit < 0
                    ? `You lose ${formatMoney(Math.abs(r.profit))} per part`
                    : `You make ${formatMoney(r.profit)} per part`}
                </div>
                <span className="note">
                  Filament is only {r.materialPct.toFixed(0)}% of what it actually costs you.
                  After fees you keep {formatMoney(r.currentNet)} out of {formatMoney(d.currentPrice)}.
                </span>
              </div>
            </div>
          </div>
        </div>

        <footer>
          The platform fee is applied to the final selling price, the same way
          the platform actually charges it. Nothing is sent to any server.
        </footer>
      </div>
      )}
    </>
  )
}
