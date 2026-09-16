import { useState } from 'react'

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

const usd = n =>
  (isFinite(n) ? n : 0).toLocaleString('en-US', { style: 'currency', currency: 'EUR' })

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

  // Only one help panel open at a time: store the key of the open
  // field, or null if none is open.
  const [openHelp, setOpenHelp] = useState(null)

  // Build a NEW object instead of mutating the old one: React detects
  // changes by comparing references, not contents.
  const set = key => value => setD(current => ({ ...current, [key]: value }))

  // The result isn't stored in state, it's recalculated on every render.
  const r = calculate(d)

  return (
    <>
      <div className="topbar">
        <i className="dot" />
        <strong>Print Cost</strong>
        <span>Everything runs in your browser</span>
      </div>

      <div className="wrap">
        <h1>What a printed part actually costs you</h1>
        <p className="subtitle">
          Material, power, printer depreciation, failed prints and your own time.
        </p>

        <div className="columns">
          {/* --- Form: drawn by looping over SECTIONS --- */}
          <div>
            {SECTIONS.map(section => (
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
                      <span className="value">{usd(r.parts[layer.key])}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="figure main">
                <span className="label">Cost per part</span>
                <span className="value">{usd(r.cost)}</span>
              </div>
              <div className="figure highlight">
                <span className="label">Recommended price</span>
                <span className="value">{usd(r.recommendedPrice)}</span>
              </div>
              <div className="figure">
                <span className="label">Profit per printer hour</span>
                <span className="value">{usd(r.perHour)}</span>
              </div>
              {r.units > 1 && (
                <div className="figure">
                  <span className="label">Order total ({r.units} pcs)</span>
                  <span className="value">{usd(r.orderPrice)}</span>
                </div>
              )}
            </div>

            <div className="panel">
              <div className="verdict">
                <span className="context">At your current selling price</span>
                <div className={`sentence ${r.profit < 0 ? 'loss' : 'gain'}`}>
                  {r.profit < 0
                    ? `You lose ${usd(Math.abs(r.profit))} per part`
                    : `You make ${usd(r.profit)} per part`}
                </div>
                <span className="note">
                  Filament is only {r.materialPct.toFixed(0)}% of what it actually costs you.
                  After fees you keep {usd(r.currentNet)} out of {usd(d.currentPrice)}.
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
    </>
  )
}
