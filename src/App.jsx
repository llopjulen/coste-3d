import { useState, useEffect, useRef } from 'react'
import History from './History.jsx'
import Report from './Report.jsx'
import ImportFile from './ImportFile.jsx'
import CustomerQuote from './CustomerQuote.jsx'
import Logo from './Logo.jsx'
import CostSymbol from './CostSymbol.jsx'
import BackupPanel, { BackupReminder } from './BackupPanel.jsx'
import { applyRestore, backupStatus, clearSetup, downloadBackup, readLastBackup, readSetup, saveSetupField } from './backup.js'
import Printers from './Printers.jsx'
import NavIcon from './NavIcons.jsx'
import { isAgentEnabled, setAgentEnabled } from './agent.js'

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
    title: 'This print',
    fields: [
      { key: 'hours', label: 'Print time',          unit: 'h', initial: 3.5,  help: "Your slicer's time estimate for one part." },
      { key: 'postMinutes', label: 'Post-processing', unit: 'min', initial: 10, help: 'Minutes spent removing supports, sanding, assembling and packing. The part of the work almost everyone gives away for free.' },
      { key: 'packaging', label: 'Packaging',          unit: '€',   initial: 0.8, help: 'Bag, box, label and filler for one unit.' },
    ],
  },
  {
    title: 'This sale',
    fields: [
      { key: 'quantity', label: 'Order quantity', unit: 'pcs', initial: 1,  help: "Parts in this order. Only changes the total — the per-part cost stays the same." },
      { key: 'currentPrice', label: 'Current price', unit: '€', initial: 12, help: 'What you currently charge for the part. Used to compare against the recommended price.' },
    ],
  },
  /* The two sections below are "Your setup": numbers a person sets once
     (their printer, their electricity, their rate) and not per part.
     `setup: true` is what makes the app remember them on this device. */
  {
    title: 'Your printer',
    setup: true,
    fields: [
      { key: 'printerPrice', label: 'Printer cost', unit: '€', initial: 700,  help: 'What the machine cost you. Add upgrades or replacement parts if you have any.' },
      { key: 'lifespan', label: 'Expected lifespan', unit: 'h', initial: 3000, help: "Hours you expect it to last before retiring it. Its cost gets spread across those hours, same as any shop does with its machines." },
      { key: 'watts', label: 'Power draw',          unit: 'W', initial: 110,  help: "Average wattage while printing. PLA on an enclosed printer like the P1S sits around 100-120 W; a hot bed pushes it higher." },
      { key: 'kwhPrice', label: 'Price per kWh',    unit: '€', initial: 0.15, help: 'What your electricity provider charges per kilowatt-hour. Check your bill.' },
      { key: 'failRate', label: 'Failure rate',     unit: '%', initial: 8,    help: "Out of 100 prints, how many end up in the bin. Leaving this at 0 means claiming you never fail, and that's exactly the assumption that quietly loses money." },
    ],
  },
  {
    title: 'You and your platform',
    setup: true,
    fields: [
      { key: 'hourlyRate', label: 'Hourly rate',       unit: '€',   initial: 15, help: "What you want to be paid per hour. If you're not sure, start with what you earn per hour at your day job." },
      { key: 'fee', label: 'Platform fee',         unit: '%',  initial: 8,  help: "What the platform keeps between commission and card processing. It's taken from the final selling price, the same way the platform charges it. Selling in person, this is 0." },
      { key: 'margin', label: 'Target margin',     unit: '%',  initial: 40, help: "What you want to earn on top of cost. Below 20% you have nothing left to reinvest or absorb a surprise." },
    ],
  },
]

/* The field names that belong to "Your setup", taken from the list above
   so there is no second list to keep in sync. */
const SETUP_FIELDS = SECTIONS.filter(s => s.setup).flatMap(s => s.fields.map(f => f.key))

/* Initial state is built straight from the list above, so a default
   value can never be forgotten when a field is added. */
const INITIAL = Object.fromEntries(
  SECTIONS.flatMap(s => s.fields.map(f => [f.key, f.initial]))
)

/* Keeps only the saved numbers that are really "Your setup" fields.
   backup.js checks that they are numbers; WHICH names are valid is decided
   here, from SECTIONS, so a stale or hand-edited key can't reach the form. */
const pickSetup = saved =>
  Object.fromEntries(Object.entries(saved ?? {}).filter(([key]) => SETUP_FIELDS.includes(key)))

/* Chart colors, in the order the symbol is printed (bottom to top):
   material is gold, the brand colour, because it's the filament; the
   rest are the costs nobody sees. The two greys are lighter than the
   old ones: on the dark panel the darkest grey nearly vanished, and
   since packaging is the top layer, the mark lost its shape. */
const LAYERS = [
  { key: 'material',      name: 'Material',      color: '#F2B33D' },
  { key: 'power',         name: 'Power',         color: '#12A594' },
  { key: 'depreciation',  name: 'Depreciation',  color: '#3E8FD0' },
  { key: 'failures',      name: 'Failures',      color: '#6E74C4' },
  { key: 'labor',         name: 'Labor',         color: '#A3A3B1' },
  { key: 'packaging',     name: 'Packaging',     color: '#6C6C7A' },
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

  // What you keep per part at the RECOMMENDED price, once the platform
  // has taken its fee. (The "profit" below is at your CURRENT price.)
  const recommendedProfit = recommendedPrice * (1 - f) - cost

  const currentNet = d.currentPrice * (1 - f)
  const profit = currentNet - cost
  const perHour = d.hours > 0 ? profit / d.hours : 0
  const units = Math.max(Math.floor(d.quantity), 1)

  return {
    parts, cost, recommendedPrice, recommendedProfit, profit, perHour, currentNet, units,
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

/* Footer under the calculator and the history: what it is, the privacy
   promise and where to send ideas. */
function SiteFooter() {
  return (
    <footer className="site-foot">
      <strong className="brand"><Logo size={16} small /> layercents</strong>
      <span>Free 3D print cost calculator. Nothing you type or drop leaves your browser.</span>
      <a href="https://github.com/llopjulen/coste-3d/issues">Ideas or bugs? Tell me on GitHub</a>
    </footer>
  )
}

/* ==================================================================
   4) APP
================================================================== */
// agentOptIn: true when this page load came from layercents.com/?agent (see main.jsx).
export default function App({ agentOptIn = false }) {
  // The calculator starts from the defaults with the person's saved setup
  // on top. A function, not a value: React runs it once, instead of
  // reading localStorage on every render.
  const [d, setD] = useState(() => ({ ...INITIAL, ...pickSetup(readSetup()) }))
  // Whether anything is saved. It decides the "Reset" button and whether the
  // setup panel starts folded (a returning person doesn't need to see it).
  const [hasSavedSetup, setHasSavedSetup] = useState(() => Object.keys(pickSetup(readSetup())).length > 0)
  const [setupOpen, setSetupOpen] = useState(() => Object.keys(pickSetup(readSetup())).length === 0)

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
      // A field added here must also be type-checked in sanitizeQuote
      // (backup.js), or restoring a backup won't validate it.
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

  /* =========================
    ·Backup & restore (logic in backup.js, screen in BackupPanel.jsx)
    =========================*/
  // When this browser was last backed up (ISO string) or null. It lives in
  // state, not only in storage, so the reminder, the tab dot and the "Last
  // backup" line all update the moment a backup is downloaded or restored.
  const [lastBackupAt, setLastBackupAt] = useState(readLastBackup)

  const backupNow = () => {
    try {
      // The list on screen is what gets saved: it's the source of truth,
      // and the effect above copies it to storage only after each render.
      setLastBackupAt(downloadBackup(savedQuotes))
    } catch (err) {
      console.error(err)
      alert('Could not create the backup file. Please try again.')
    }
  }

  // Storage is written first and React state after: if the write fails it
  // throws before setSavedQuotes, so the screen never shows a restore that
  // didn't happen. Business details and the quote counter live only in
  // storage (CustomerQuote reads them when it opens), so only the quotes
  // need state. Returns the stats for BackupPanel's message.
  const restoreBackup = (backup, mode) => {
    const result = applyRestore(backup, mode, savedQuotes)
    setSavedQuotes(result.quotes)
    // The numbers now stored must also be the ones on screen: the form
    // keeps them in state, so without this the restore would only show
    // after a reload.
    const restoredSetup = pickSetup(result.setup)
    setD(current => ({ ...current, ...restoredSetup }))
    setHasSavedSetup(Object.keys(restoredSetup).length > 0)
    if (result.lastBackupAt) setLastBackupAt(result.lastBackupAt)
    return result.stats
  }

  // Drives the dot on the History tab, so the reminder is visible from the
  // calculator too, where people spend most of their time.
  const backupDue = backupStatus(savedQuotes, lastBackupAt).due


  // Which screen is shown: 'calculator', 'history', 'report', 'quote' or
  // 'printers'. Arriving through the ?agent link opens Printers directly.
  const [view, setView] = useState(agentOptIn ? 'printers' : 'calculator')

  // Whether this browser shows the Printers tab (opt-in, see agent.js).
  // State, not just storage, so hiding the tab takes effect at once.
  const [agentOn, setAgentOn] = useState(() => agentOptIn || isAgentEnabled())
  const turnOffAgent = () => {
    setAgentEnabled(false)
    setAgentOn(false)
    // The Printers screen is about to disappear: go somewhere that exists.
    setView('calculator')
  }

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

  /* On a phone the result comes after all the fields, so a bar at the
     bottom shows cost and price while you type. It hides itself when
     the real result panel scrolls into view. */
  const resultRef = useRef(null)
  const [resultInView, setResultInView] = useState(false)
  useEffect(() => {
    const el = resultRef.current
    if (!el || !('IntersectionObserver' in window)) return
    const watcher = new IntersectionObserver(([entry]) => setResultInView(entry.isIntersecting))
    watcher.observe(el)
    return () => watcher.disconnect()
  }, [view])
  const showResult = () => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    resultRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  const [currency, setCurrency] = useState('EUR')

  const[rates, setRates] = useState({ EUR: 1})

  // The amount split in three, so the big price can show the cents and
  // the currency smaller. formatMoney below is built on top of it, so
  // the whole app keeps formatting money in exactly one place.
  const moneyParts = (n) => {
    const rate = rates[currency] || 1
    const value = (isFinite(n) ? n : 0) * rate
    const [whole, cents] = value.toFixed(2).split('.')
    return { whole, cents, currency }
  }
  const formatMoney = (n) => {
    const { whole, cents } = moneyParts(n)
    return `${whole}.${cents} ${currency}`
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

  // Only one help panel open at a time: store the key of the open
  // field, or null if none is open.
  const [openHelp, setOpenHelp] = useState(null)

  // Build a NEW object instead of mutating the old one: React detects
  // changes by comparing references, not contents.
  const set = key => value => {
    setD(current => ({ ...current, [key]: value }))
    // Only a field of "Your setup" is remembered, and only when the PERSON
    // edits it. Loading a saved quote or importing a slicer file call setD
    // directly, so they never overwrite the saved setup with old numbers.
    if (SETUP_FIELDS.includes(key) && saveSetupField(key, value)) setHasSavedSetup(true)
  }

  // Back to the app's defaults for every setup field, and forget what was saved.
  const resetSetup = () => {
    if (!window.confirm('Reset your setup to the default numbers?')) return
    if (!clearSetup()) return
    setD(current => ({ ...current, ...Object.fromEntries(SETUP_FIELDS.map(key => [key, INITIAL[key]])) }))
    setHasSavedSetup(false)
  }

  // One input row of the form; used by the per-print sections and by the setup.
  const renderField = field => (
    <Field
      key={field.key}
      id={field.key}
      label={field.label}
      unit={field.unit}
      help={field.help}
      value={d[field.key]}
      onChange={set(field.key)}
      open={openHelp === field.key}
      onHelp={() => setOpenHelp(k => (k === field.key ? null : field.key))}
    />
  )

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
  // The big price at the top of the result, split to style its cents.
  const price = moneyParts(r.recommendedPrice)

  return (
    <>
      <header className="topbar no-print">
        <strong className="brand"><Logo size={20} small /> <span className="brand-name">layercents</span></strong>
        <nav className="tabs">
          <button
            type="button"
            className={`tab ${view === 'calculator' ? 'active' : ''}`}
            aria-current={view === 'calculator' ? 'page' : undefined}
            onClick={() => setView('calculator')}
          >
            <NavIcon name="calculator" />
            <span className="tab-label">Calculator</span>
          </button>
          {/* History stays lit on its sub-screens (report, customer quote),
              which are reached from it; Printers is a tab of its own. */}
          <button
            type="button"
            className={`tab ${['history', 'report', 'quote'].includes(view) ? 'active' : ''}`}
            aria-current={['history', 'report', 'quote'].includes(view) ? 'page' : undefined}
            onClick={() => setView('history')}
          >
            <NavIcon name="history" />
            <span className="tab-label">History</span>
            <span className="count">{savedQuotes.length}</span>
            {/* The dot is decoration; the hidden text gives screen readers the same news. */}
            {backupDue && <><span className="tab-dot" aria-hidden="true" /><span className="sr-only">, backup due</span></>}
          </button>
          {/* Only for those who turned it on: nobody else ever calls 127.0.0.1. */}
          {agentOn && (
            <button
              type="button"
              className={`tab ${view === 'printers' ? 'active' : ''}`}
              aria-current={view === 'printers' ? 'page' : undefined}
              onClick={() => setView('printers')}
            >
              <NavIcon name="printer" />
              <span className="tab-label">Printers</span>
            </button>
          )}
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
      </header>

      {/* agentOn is checked again here: if the tab was hidden, the screen goes too. */}
      {view === 'printers' && agentOn ? (
        <Printers onTurnOff={turnOffAgent} />
      ) : view === 'quote' ? (
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
          {/* Above the list, so it's seen; renders nothing unless a backup is due. */}
          <BackupReminder quotes={savedQuotes} lastBackupAt={lastBackupAt} onBackup={backupNow} />
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
          {/* Outside History on purpose: History returns early when it's
              empty, and an empty History (a new computer) is exactly
              where "Restore from file" is needed most. */}
          <BackupPanel quotes={savedQuotes} lastBackupAt={lastBackupAt} onBackup={backupNow} onRestore={restoreBackup} />
          <SiteFooter />
        </div>
      ) : (
      <div className="wrap calc-page">
        <h1>What a printed part actually costs you</h1>
        <p className="subtitle">
          Material, power, printer depreciation, failed prints and your own time.
        </p>
        <ol className="steps">
          <li><span className="step-n" aria-hidden="true">1</span>Drop your sliced file</li>
          <li><span className="step-n" aria-hidden="true">2</span>See the real cost and price</li>
          <li><span className="step-n" aria-hidden="true">3</span>Save it and send a quote</li>
        </ol>

        <div className="columns">
          {/* --- Form: drawn by looping over SECTIONS --- */}
          <div>
            <ImportFile onApply={applyImport} onUndo={undoImport} />
            {/* The numbers that change with every part */}
            {SECTIONS.filter(section => !section.setup).map(section => (
              <section className="panel" key={section.title}>
                <h2>{section.title}</h2>
                <div className="body">{section.fields.map(renderField)}</div>
              </section>
            ))}

            {/* The numbers that stay: saved on this device the moment they
                change, so they are typed once. Folded once saved. */}
            <section className="panel setup-panel">
              <h2 className="with-value">
                <span>Your setup</span>
                <button type="button" className="link" aria-expanded={setupOpen} onClick={() => setSetupOpen(open => !open)}>
                  {setupOpen ? 'Hide' : 'Edit'}
                </button>
              </h2>
              {setupOpen ? (
                <>
                  <p className="setup-note">
                    {hasSavedSetup
                      ? 'Saved on this device. It comes back every time you open layercents.'
                      : 'Saved on this device as you type, so you only enter it once.'}
                  </p>
                  {SECTIONS.filter(section => section.setup).map(section => (
                    <div className="body setup-group" key={section.title}>
                      <h3>{section.title}</h3>
                      {section.fields.map(renderField)}
                    </div>
                  ))}
                  {hasSavedSetup && (
                    <div className="setup-actions">
                      <button type="button" className="link" onClick={resetSetup}>Reset to defaults</button>
                    </div>
                  )}
                </>
              ) : (
                /* Folded: one line per field, read-only, so the numbers behind
                   the price are still visible without taking the whole column. */
                <dl className="setup-summary">
                  {SECTIONS.filter(section => section.setup).flatMap(section => section.fields).map(field => (
                    <div key={field.key}>
                      <dt>{field.label}</dt>
                      <dd>{d[field.key]} {field.unit}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          </div>

          {/* --- Result: the price first, because it's the answer the
               person came for; then why (the symbol), then what happens
               at their current price, then saving it. --- */}
          <div className="result" ref={resultRef}>
            <div className="panel hero">
              <span className="hero-label">Recommended price</span>
              <div className="hero-price">
                <span className="hero-whole">{price.whole}</span>
                <span className="hero-cents">.{price.cents}</span>
                <span className="hero-currency">{price.currency}</span>
              </div>
              <p className="hero-sub">
                You keep <strong>{formatMoney(r.recommendedProfit)}</strong> per part after fees.
              </p>
              {r.units > 1 && (
                <p className="hero-sub">
                  Order total ({r.units} pcs): <strong>{formatMoney(r.orderPrice)}</strong>
                </p>
              )}
            </div>

            <div className="panel">
              <h2 className="with-value">
                <span>Cost to make it</span>
                <strong>{formatMoney(r.cost)}</strong>
              </h2>
              <div className="cross-section">
                {/* The chart is the layercents mark itself, "printed" with the
                    costs. The text label is what a screen reader reads; the
                    legend next to it carries the exact amounts. */}
                <CostSymbol
                  parts={r.parts}
                  layers={LAYERS}
                  label={`Cost breakdown: ${LAYERS.map(l => `${l.name} ${formatMoney(r.parts[l.key])}`).join(', ')}`}
                />
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
              <div className="verdict">
                <span className="context">At your current selling price</span>
                <div className={`sentence ${r.profit < 0 ? 'loss' : 'gain'}`}>
                  {r.profit < 0
                    ? `You lose ${formatMoney(Math.abs(r.profit))} per part`
                    : `You make ${formatMoney(r.profit)} per part`}
                </div>
                <span className="note">
                  After fees you keep {formatMoney(r.currentNet)} out of {formatMoney(d.currentPrice)}.
                </span>
              </div>
              {/* This figure is computed from the CURRENT price, so it lives
                  here and not next to the recommended price, where it
                  looked like the profit of the price shown above it. */}
              <div className="figure">
                <span className="label">Profit per printer hour</span>
                <span className="value">{formatMoney(r.perHour)}</span>
              </div>
            </div>

            {/* Saving comes after the result: you save what you've just seen. */}
            <form className="panel" onSubmit={saveQuote}>
              <h2>Save this quote</h2>
              <div className="body">
                <div className="save-bar">
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
                </div>
                {/* role="status" makes screen readers announce the message */}
                <p className="saved-note" role="status">
                  {justSaved && (
                    <>
                      Saved “{justSaved}” ·{' '}
                      <button type="button" className="link" onClick={() => setView('history')}>View history</button>
                    </>
                  )}
                </p>
              </div>
            </form>
          </div>
        </div>

        {/* Phone only (CSS hides it on wide screens): the answer stays in
            view while you type. The price leads, because it is the answer;
            the cost is the second number. It hides itself when the real
            result is on screen, so the price is never shown twice. */}
        <div className={`mobile-total ${resultInView ? 'away' : ''}`}>
          <span className="price">Recommended price<strong>{formatMoney(r.recommendedPrice)}</strong></span>
          <span>Cost<strong>{formatMoney(r.cost)}</strong></span>
          <button type="button" className="controls" onClick={showResult}>See details</button>
        </div>

        <SiteFooter />
      </div>
      )}
    </>
  )
}
