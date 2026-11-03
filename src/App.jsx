import { useState, useEffect, useMemo, useRef } from 'react'
import History from './History.jsx'
import Report from './Report.jsx'
import ImportFile from './ImportFile.jsx'
import CustomerQuote from './CustomerQuote.jsx'
import Logo from './Logo.jsx'
import CostSymbol from './CostSymbol.jsx'
import BackupPanel, { BackupReminder } from './BackupPanel.jsx'
import { applyRestore, backupStatus, clearSetup, downloadBackup, readLastBackup, readSetup, saveSetupField } from './backup.js'
import Printers from './Printers.jsx'
import RealData from './RealData.jsx'
import { adviceFor } from './advice.js'
import NavIcon from './NavIcons.jsx'
import SubNav from './SubNav.jsx'
import { applyTheme, readTheme, saveTheme } from './theme.js'
import { isAgentEnabled, setAgentEnabled } from './agent.js'
import { MAX_EXTRA_FILAMENTS, calculate, capacity, normalizeExtras } from './calculate.js'
import { useI18n } from './i18n/context.js'
import { LANGS, LANG_NAMES, selectorVisible } from './i18n/index.js'
import { fmtNumber } from './i18n/format.js'

/* ==================================================================
   1) FIELDS
   Every label, unit and default value lives HERE. Changing a text or
   adding a field means touching this list only: the form is drawn
   by looping over it.
================================================================== */
// The blocks of the calculator's FORM column, in screen order, for the sidebar's
// second level. The result column (price, costs, save) is left out on purpose: it
// is sticky, and scrolling to a sticky element does nothing useful.
// Only ids and translation keys live here; the labels are looked up with t() at
// render time, so the list itself never depends on the language.
const CALC_NAV = [
  { id: 'sec-import', labelKey: 'nav.import' },
  { id: 'sec-material', labelKey: 'nav.material' },
  { id: 'sec-this-print', labelKey: 'nav.thisPrint' },
  { id: 'sec-this-sale', labelKey: 'nav.thisSale' },
  { id: 'sec-setup', labelKey: 'nav.setup' },
]

const SECTIONS = [
  {
    id: 'sec-material',
    titleKey: 'section.material',
    fields: [
      { key: 'spoolPrice', unit: '€', initial: 20 },
      { key: 'spoolWeight', unit: 'g', initial: 1000 },
      { key: 'partGrams', unit: 'g', initial: 45 },
      { key: 'purgeGrams', unit: 'g', initial: 0 },
    ],
  },
  {
    id: 'sec-this-print',
    titleKey: 'section.thisPrint',
    fields: [
      { key: 'hours', unit: 'h', initial: 3.5 },
      { key: 'postMinutes', unit: 'min', initial: 10 },
      { key: 'packaging', unit: '€', initial: 0.8 },
    ],
  },
  {
    id: 'sec-this-sale',
    titleKey: 'section.thisSale',
    fields: [
      { key: 'quantity', unitKey: 'unit.pcs', initial: 1 },
      { key: 'currentPrice', unit: '€', initial: 12 },
    ],
  },
  /* The two sections below are "Your setup": numbers a person sets once
     (their printer, their electricity, their rate) and not per part.
     `setup: true` is what makes the app remember them on this device. */
  {
    id: 'sec-printer',
    titleKey: 'section.printer',
    setup: true,
    fields: [
      { key: 'printerPrice', unit: '€', initial: 700 },
      { key: 'lifespan', unit: 'h', initial: 3000 },
      { key: 'watts', unit: 'W', initial: 110 },
      { key: 'kwhPrice', unit: '€', initial: 0.15 },
      { key: 'failRate', unit: '%', initial: 8 },
      { key: 'printHoursPerWeek', unit: 'h', initial: 60 },
    ],
  },
  {
    id: 'sec-platform',
    titleKey: 'section.platform',
    setup: true,
    fields: [
      { key: 'hourlyRate', unit: '€', initial: 15 },
      { key: 'fee', unit: '%', initial: 8 },
      { key: 'margin', unit: '%', initial: 40 },
    ],
  },
]

/* The field names that belong to "Your setup", taken from the list above
   so there is no second list to keep in sync. */
const SETUP_FIELDS = SECTIONS.filter(s => s.setup).flatMap(s => s.fields.map(f => f.key))

/* Initial state is built straight from the list above, so a default
   value can never be forgotten when a field is added. */
const INITIAL = {
  ...Object.fromEntries(SECTIONS.flatMap(s => s.fields.map(f => [f.key, f.initial]))),
  // The part's other filaments (see calculate.js). Not a form field: it has its own panel.
  extraFilaments: [],
}

/* Keeps only the saved numbers that are really "Your setup" fields.
   backup.js checks that they are numbers; WHICH names are valid is decided
   here, from SECTIONS, so a stale or hand-edited key can't reach the form. */
const pickSetup = saved =>
  Object.fromEntries(Object.entries(saved ?? {}).filter(([key]) => SETUP_FIELDS.includes(key)))

/* Chart colors, in the order the symbol is printed (bottom to top):
   material is gold, the brand colour, because it's the filament; the
   rest are the costs nobody sees. They are muted on purpose (2026-11-03
   redesign): the old saturated teal, blue and violet made the chart the
   loudest thing on the page and gave it a "neon dashboard" look. Same
   lightness band, different hues, so each layer is still told apart; the
   legend carries the exact amounts anyway. Packaging, the top layer, stays
   light enough that the mark keeps its shape on the dark panel. */
const LAYERS = [
  { key: 'material',      nameKey: 'layer.material',      color: '#E3AE4F' },
  { key: 'power',         nameKey: 'layer.power',         color: '#7EA89F' },
  { key: 'depreciation',  nameKey: 'layer.depreciation',  color: '#8A9CB8' },
  { key: 'failures',      nameKey: 'layer.failures',      color: '#B48A9C' },
  { key: 'labor',         nameKey: 'layer.labor',         color: '#AAA59A' },
  { key: 'packaging',     nameKey: 'layer.packaging',     color: '#77756F' },
]



/* ==================================================================
   3) UI PIECES
================================================================== */
function Field({ id, label, unit, help, value, onChange, open, onHelp }) {
  const { t } = useI18n()
  return (
    <div className="field">
      <div className="row">
        <div className="label-group">
          <label htmlFor={id}>{label}</label>
          {/* aria-expanded tells screen readers whether the text is
              open; aria-controls links it to the help block. A field with
              no help text (the extra filaments' own) gets no button. */}
          {help && (
            <button
              type="button"
              className="info"
              aria-label={t('field.whatIs', { label })}
              aria-expanded={open}
              aria-controls={`help-${id}`}
              onClick={onHelp}
            >
              i
            </button>
          )}
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
      {open && help && <p className="help" id={`help-${id}`}>{help}</p>}
    </div>
  )
}

/* The part's other filaments: each one with its own spool price, spool weight
   and grams, so a two-colour print is priced with what each spool really cost.
   `list` and `onChange` come from App (the form's state lives there). */
function ExtraFilaments({ list, onChange }) {
  const { t } = useI18n()
  const update = (id, patch) => onChange(list.map(f => (f.id === id ? { ...f, ...patch } : f)))
  const remove = id => onChange(list.filter(f => f.id !== id))
  const toNumber = text => (text === '' ? 0 : Number(text))
  return (
    <div className="extra-filaments">
      {list.map((f, i) => {
        const title = t('filament.extra.title', { n: i + 2 })
        return (
          <div className="extra-filament" key={f.id} role="group" aria-label={f.label || title}>
            <div className="extra-head">
              {/* The name is optional and only for the person ("PETG black"); it doesn't change the price. */}
              <input
                className="text-input"
                type="text"
                maxLength={40}
                aria-label={t('filament.extra.name', { n: i + 2 })}
                placeholder={title}
                value={f.label ?? ''}
                onChange={e => update(f.id, { label: e.target.value })}
              />
              <button type="button" className="row-btn danger" aria-label={t('filament.remove', { name: f.label || title })} onClick={() => remove(f.id)}>✕</button>
            </div>
            <Field id={`extra-${f.id}-price`} label={t('filament.price')} unit="€" value={f.spoolPrice} onChange={v => update(f.id, { spoolPrice: v })} />
            <Field id={`extra-${f.id}-weight`} label={t('filament.weight')} unit="g" value={f.spoolWeight} onChange={v => update(f.id, { spoolWeight: v })} />
            <Field id={`extra-${f.id}-grams`} label={t('filament.grams')} unit="g" value={f.grams} onChange={v => update(f.id, { grams: toNumber(v) })} />
          </div>
        )
      })}
    </div>
  )
}

/* Footer under the calculator and the history: what it is, the privacy
   promise and where to send ideas. */
function SiteFooter() {
  const { t } = useI18n()
  return (
    <footer className="site-foot">
      <strong className="brand"><Logo size={16} small /> layercents</strong>
      <span>{t('footer.tagline')}</span>
      <a href="https://github.com/llopjulen/coste-3d/issues">{t('footer.feedback')}</a>
    </footer>
  )
}

/* ==================================================================
   4) APP
================================================================== */
// agentOptIn: true when this page load came from layercents.com/?agent (see main.jsx).
export default function App({ agentOptIn = false }) {
  const { t, tr, lang, setLang, decimal, locale } = useI18n()
  // Built here (not at module level) because the labels depend on the language.
  // t changes only when the language does, so the observer in SubNav is rebuilt
  // only then.
  const calcNav = useMemo(() => CALC_NAV.map(item => ({ id: item.id, label: t(item.labelKey) })), [t])
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
        name: quoteName.trim() || t('save.untitled'),
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
      // normalizeExtras: a quote from before this existed has no list, and one from a
      // hand-edited file might have a broken one.
      setD({ ...INITIAL, ...quote.inputs, extraFilaments: normalizeExtras(quote.inputs?.extraFilaments) })
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
      alert(t('error.backup'))
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
  // Light or dark. The page already got its theme from index.html before
  // painting; this state only drives the toggle and keeps the two in sync.
  const [theme, setTheme] = useState(readTheme)
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
    saveTheme(next)
  }

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
    // `decimal` is "." or "," depending on the language (see i18n/index.js).
    // Only the separator changes: the digits are the same, so the saved
    // quotes and the totals never depend on the language.
    return { whole, cents, decimal, currency }
  }
  const formatMoney = (n) => {
    const { whole, cents } = moneyParts(n)
    return `${whole}${decimal}${cents} ${currency}`
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
      await exportQuotesToExcel(quotes, currency, rates[currency] || 1, lang)
    } catch (err) {
      console.error(err)
      alert(t('error.excel'))
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
    if (!window.confirm(t('setup.resetConfirm'))) return
    if (!clearSetup()) return
    setD(current => ({ ...current, ...Object.fromEntries(SETUP_FIELDS.map(key => [key, INITIAL[key]])) }))
    setHasSavedSetup(false)
  }

  // A new extra filament starts with the first one's spool (same brand is the common case): only the grams are left to type.
  const addFilament = () => setD(current => {
    if (current.extraFilaments.length >= MAX_EXTRA_FILAMENTS) return current
    const id = current.extraFilaments.reduce((max, f) => Math.max(max, f.id), 0) + 1
    return { ...current, extraFilaments: [...current.extraFilaments, { id, label: '', spoolPrice: current.spoolPrice, spoolWeight: current.spoolWeight, grams: 0 }] }
  })

  // The unit is a symbol (€, g, h) except for "pcs", which is a word and is translated.
  const fieldUnit = field => (field.unitKey ? t(field.unitKey) : field.unit)

  // One input row of the form; used by the per-print sections and by the setup.
  const renderField = field => (
    <Field
      key={field.key}
      id={field.key}
      label={t(`field.${field.key}.label`)}
      unit={fieldUnit(field)}
      help={t(`field.${field.key}.help`)}
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
    setD(current => ({ ...current, ...values, ...importedExtras(values, current, isNewFile) }))
  }

  /* A file gives the grams (and type) of each extra filament but not what the
     spool cost. A new file starts every extra at the first filament's spool;
     changing the plate or the number of parts of the SAME file keeps the
     prices the person already typed, matching extras by position. */
  const importedExtras = (values, current, isNewFile) => {
    if (!values.extraFilaments) return {}
    return {
      extraFilaments: values.extraFilaments.slice(0, MAX_EXTRA_FILAMENTS).map((f, i) => {
        const old = isNewFile ? null : current.extraFilaments[i]
        return {
          id: i + 1,
          label: f.label,
          grams: f.grams,
          spoolPrice: old?.spoolPrice ?? current.spoolPrice,
          spoolWeight: old?.spoolWeight ?? current.spoolWeight,
        }
      }),
    }
  }

  const undoImport = () => {
    if (!beforeImport) return
    setD(current => ({ ...current, ...beforeImport }))
    setBeforeImport(null)
  }

  // The result isn't stored in state, it's recalculated on every render.
  const r = calculate(d)
  const cap = capacity(d)
  const tips = adviceFor(d)
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
            <span className="tab-label">{t('nav.calculator')}</span>
          </button>
          {/* Second level: only on the calculator, which is the long page. */}
          {view === 'calculator' && <SubNav items={calcNav} />}
          {/* History stays lit on its sub-screens (report, customer quote),
              which are reached from it; Printers is a tab of its own. */}
          <button
            type="button"
            className={`tab ${['history', 'report', 'quote'].includes(view) ? 'active' : ''}`}
            aria-current={['history', 'report', 'quote'].includes(view) ? 'page' : undefined}
            onClick={() => setView('history')}
          >
            <NavIcon name="history" />
            <span className="tab-label">{t('nav.history')}</span>
            <span className="count">{savedQuotes.length}</span>
            {/* The dot is decoration; the hidden text gives screen readers the same news. */}
            {backupDue && <><span className="tab-dot" aria-hidden="true" /><span className="sr-only">{t('nav.backupDue')}</span></>}
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
              <span className="tab-label">{t('nav.printers')}</span>
            </button>
          )}
        </nav>
        <div className="topbar-end">
          <button
            type="button"
            className="theme-btn"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}
            title={theme === 'dark' ? t('theme.light') : t('theme.dark')}
          >
            <NavIcon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          {/* Hidden until the translation covers the whole app (i18n/index.js). */}
          {selectorVisible() && (
            <select
              className="currency lang-select"
              aria-label={t('lang.label')}
              value={lang}
              onChange={e => setLang(e.target.value)}
            >
              {/* Short codes, like the currency next to it: the compact sidebar is narrow. */}
              {LANGS.map(code => (
                <option key={code} value={code} lang={code} title={LANG_NAMES[code]}>{code.toUpperCase()}</option>
              ))}
            </select>
          )}
          <select
            className="currency"
            aria-label={t('currency.label')}
            value={currency}
            onChange={e => setCurrency(e.target.value)}
          >
            {Object.keys(rates).map(code => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </div>
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
          rate={rates[currency] || 1}
          onBack={() => setView('history')}
        />
      ) : view === 'history' ? (
        <div className="wrap">
          <h1>{t('history.title')}</h1>
          <p className="subtitle">{t('history.subtitle')}</p>
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
        <h1>{t('calc.title')}</h1>
        <p className="subtitle">{t('calc.subtitle')}</p>

        <div className="columns">
          {/* --- Form: drawn by looping over SECTIONS. "form-col" gives it the
               grouped-list look (titles outside, rows inside; index.css). --- */}
          <div className="form-col">
            <div id="sec-import"><ImportFile onApply={applyImport} onUndo={undoImport} /></div>
            {/* The numbers that change with every part */}
            {SECTIONS.filter(section => !section.setup).map(section => (
              <section className="panel" key={section.id} id={section.id}>
                <h2>{t(section.titleKey)}</h2>
                <div className="body">
                  {section.fields.map(renderField)}
                  {section.id === 'sec-material' && (
                    <>
                      <ExtraFilaments list={d.extraFilaments} onChange={set('extraFilaments')} />
                      <div className="extra-add">
                        <button type="button" className="controls" onClick={addFilament} disabled={d.extraFilaments.length >= MAX_EXTRA_FILAMENTS}>
                          + {t('filament.add')}
                        </button>
                        {d.extraFilaments.length === 0 && <span className="muted">{t('filament.hint')}</span>}
                      </div>
                    </>
                  )}
                </div>
              </section>
            ))}

            {/* Only for people who turned the agent on, and only if their job log
                has enough prints: the real failure rate and print time. The
                failure rate is a setup field, so it goes through `set` (saved
                on this device); the time is this part's, so it doesn't. */}
            <RealData
              enabled={agentOn}
              failRate={d.failRate}
              hours={d.hours}
              onUseFailRate={set('failRate')}
              onUseTime={hours => setD(current => ({ ...current, hours }))}
            />

            {/* The numbers that stay: saved on this device the moment they
                change, so they are typed once. Folded once saved. */}
            <section className="panel setup-panel" id="sec-setup">
              <h2 className="with-value">
                <span>{t('setup.title')}</span>
                <button type="button" className="link" aria-expanded={setupOpen} onClick={() => setSetupOpen(open => !open)}>
                  {setupOpen ? t('setup.hide') : t('setup.edit')}
                </button>
              </h2>
              {setupOpen ? (
                <>
                  <p className="setup-note">
                    {hasSavedSetup
                      ? t('setup.noteSaved')
                      : t('setup.noteSaving')}
                  </p>
                  {SECTIONS.filter(section => section.setup).map(section => (
                    <div className="body setup-group" key={section.id}>
                      <h3>{t(section.titleKey)}</h3>
                      {section.fields.map(renderField)}
                    </div>
                  ))}
                  {hasSavedSetup && (
                    <div className="setup-actions">
                      <button type="button" className="link" onClick={resetSetup}>{t('setup.reset')}</button>
                    </div>
                  )}
                </>
              ) : (
                /* Folded: one line per field, read-only, so the numbers behind
                   the price are still visible without taking the whole column. */
                <dl className="setup-summary">
                  {SECTIONS.filter(section => section.setup).flatMap(section => section.fields).map(field => (
                    <div key={field.key}>
                      <dt>{t(`field.${field.key}.label`)}</dt>
                      <dd>{d[field.key]} {fieldUnit(field)}</dd>
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
              <span className="hero-label">{t('hero.label')}</span>
              <div className="hero-price">
                <span className="hero-whole">{price.whole}</span>
                <span className="hero-cents">{price.decimal}{price.cents}</span>
                <span className="hero-currency">{price.currency}</span>
              </div>
              <p className="hero-sub">
                {tr('hero.keep', {}, { amount: <strong>{formatMoney(r.recommendedProfit)}</strong> })}
              </p>
              {cap && (
                <p className="hero-sub">
                  {tr('hero.perWeek', { hours: fmtNumber(locale, d.printHoursPerWeek, 1) }, { amount: <strong>{fmtNumber(locale, cap.goodPerWeek, 1)}</strong> })}
                  {r.units > 1 && <> {tr('hero.orderDays', { units: r.units }, { days: <strong>{fmtNumber(locale, cap.orderDays, 1)}</strong> })}</>}
                </p>
              )}
              {r.units > 1 && (
                <p className="hero-sub">
                  {tr('hero.orderTotal', { units: r.units }, { amount: <strong>{formatMoney(r.orderPrice)}</strong> })}
                </p>
              )}
            </div>

            <div className="panel">
              <h2 className="with-value">
                <span>{t('cost.title')}</span>
                <strong>{formatMoney(r.cost)}</strong>
              </h2>
              <div className="cross-section">
                {/* The chart is the layercents mark itself, "printed" with the
                    costs. The text label is what a screen reader reads; the
                    legend next to it carries the exact amounts. */}
                <CostSymbol
                  parts={r.parts}
                  layers={LAYERS}
                  label={t('cost.chartLabel', { list: LAYERS.map(l => `${t(l.nameKey)} ${formatMoney(r.parts[l.key])}`).join(', ') })}
                />
                <div className="legend">
                  {LAYERS.map(layer => (
                    <div className="row-legend" key={layer.key}>
                      <i className="swatch" style={{ backgroundColor: layer.color }} />
                      <span className="name">{t(layer.nameKey)}</span>
                      <span className="value">{formatMoney(r.parts[layer.key])}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="verdict">
                <span className="context">{t('verdict.context')}</span>
                <div className={`sentence ${r.profit < 0 ? 'loss' : 'gain'}`}>
                  {r.profit < 0
                    ? t('verdict.lose', { amount: formatMoney(Math.abs(r.profit)) })
                    : t('verdict.make', { amount: formatMoney(r.profit) })}
                </div>
                <span className="note">
                  {t('verdict.note', { net: formatMoney(r.currentNet), price: formatMoney(d.currentPrice) })}
                </span>
              </div>
              {/* This figure is computed from the CURRENT price, so it lives
                  here and not next to the recommended price, where it
                  looked like the profit of the price shown above it. */}
              <div className="figure">
                <span className="label">{t('verdict.perHour')}</span>
                <span className="value">{formatMoney(r.perHour)}</span>
              </div>
            </div>

            {/* Tips from the numbers above (advice.js): plain rules, at most three.
                Hidden when there is nothing worth saying. */}
            {tips.length > 0 && (
              <section className="panel" aria-labelledby="advice-title">
                <h2 id="advice-title">{t('advice.title')}</h2>
                <ul className="body advice">
                  {tips.map(tip => (
                    <li key={tip.id}>{t(`advice.${tip.id}`, {
                      ...tip.vars,
                      takes: tip.vars.takes != null ? formatMoney(tip.vars.takes) : undefined,
                      direct: tip.vars.direct != null ? formatMoney(tip.vars.direct) : undefined,
                    })}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Saving comes after the result: you save what you've just seen. */}
            <form className="panel" onSubmit={saveQuote}>
              <h2>{t('save.title')}</h2>
              <div className="body">
                <div className="save-bar">
                  <input
                    className="text-input"
                    type="text"
                    placeholder={t('save.partPlaceholder')}
                    aria-label={t('save.partLabel')}
                    value={quoteName}
                    onChange={e => setQuoteName(e.target.value)}
                  />
                  <input
                    className="text-input"
                    type="text"
                    placeholder={t('save.clientPlaceholder')}
                    aria-label={t('save.clientLabel')}
                    value={quoteClient}
                    onChange={e => setQuoteClient(e.target.value)}
                  />
                  <button type="submit" className="controls">{t('save.button')}</button>
                </div>
                {/* role="status" makes screen readers announce the message */}
                <p className="saved-note" role="status">
                  {justSaved && (
                    <>
                      {t('save.saved', { name: justSaved })} ·{' '}
                      <button type="button" className="link" onClick={() => setView('history')}>{t('save.viewHistory')}</button>
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
          <span className="price">{t('mobile.price')}<strong>{formatMoney(r.recommendedPrice)}</strong></span>
          <span>{t('mobile.cost')}<strong>{formatMoney(r.cost)}</strong></span>
          <button type="button" className="controls" onClick={showResult}>{t('mobile.seeDetails')}</button>
        </div>

        <SiteFooter />
      </div>
      )}
    </>
  )
}
