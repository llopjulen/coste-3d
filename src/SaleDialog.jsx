import { useEffect, useRef, useState } from 'react'
import { useI18n } from './i18n/context.js'
import { defaultSale } from './sales.js'

/* ==================================================================
   SALE DIALOG — "Mark as sold": what was really charged, the fees, where
   and when. Opens over History, like a sheet in iOS.

   A native <dialog> opened with showModal(): the browser itself traps the
   focus inside, closes it with Esc, puts everything behind out of reach
   for screen readers and draws the ::backdrop. Writing that by hand is
   where modals usually break accessibility.

   Amounts are typed in the currency on screen and stored in EUR, like the
   customer quote does (divide by `rate` on the way in, multiply on the way out).
================================================================== */

// Suggestions for "Where": the usual places. Free text all the same.
const CHANNELS = ['Etsy', 'Wallapop', 'Vinted', 'eBay', 'Amazon', 'Instagram']

const toText = n => (Math.round(n * 100) / 100).toFixed(2)
const toNumber = text => parseFloat(String(text).replace(',', '.'))

export default function SaleDialog({ quote, currency, rate, onSave, onClose }) {
  const { t } = useI18n()
  const ref = useRef(null)
  // Start from the sale already recorded (editing) or from the quote (new sale).
  const start = quote.sale ?? defaultSale(quote)
  const [amount, setAmount] = useState(toText(start.amount * rate))
  const [fees, setFees] = useState(toText(start.fees * rate))
  const [channel, setChannel] = useState(start.channel)
  const [soldAt, setSoldAt] = useState(String(start.soldAt).slice(0, 10))
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    // Esc fires "cancel"; closing the dialog in any way tells App.
    const close = () => onClose()
    dialog.addEventListener('close', close)
    return () => { dialog.removeEventListener('close', close); if (dialog.open) dialog.close() }
  }, [onClose])

  const submit = e => {
    e.preventDefault()
    const a = toNumber(amount)
    const f = fees.trim() === '' ? 0 : toNumber(fees)
    if (!Number.isFinite(a) || a < 0) { setError(t('sale.err.amount')); return }
    if (!Number.isFinite(f) || f < 0 || f > a) { setError(t('sale.err.fees')); return }
    if (!soldAt) { setError(t('sale.err.date')); return }
    onSave({ amount: a / rate, fees: f / rate, channel, soldAt: new Date(`${soldAt}T12:00:00`).toISOString() })
  }

  return (
    <dialog ref={ref} className="sheet" aria-labelledby="sale-title">
      <form onSubmit={submit} noValidate>
        <h2 id="sale-title">{t('sale.title')}</h2>
        <p className="muted sheet-sub">{quote.name ?? t('save.untitled')}{quote.client ? ` — ${quote.client}` : ''}</p>

        <div className="sheet-group">
          <label className="sheet-row">
            <span>{t('sale.amount')}</span>
            <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
            <span className="unit">{currency}</span>
          </label>
          <label className="sheet-row">
            <span>{t('sale.fees')}</span>
            <input inputMode="decimal" value={fees} onChange={e => setFees(e.target.value)} />
            <span className="unit">{currency}</span>
          </label>
          <label className="sheet-row">
            <span>{t('sale.channel')}</span>
            <input list="sale-channels" value={channel} maxLength={40} placeholder={t('sale.channelPh')} onChange={e => setChannel(e.target.value)} />
            <datalist id="sale-channels">{CHANNELS.map(c => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="sheet-row">
            <span>{t('sale.date')}</span>
            <input type="date" value={soldAt} onChange={e => setSoldAt(e.target.value)} />
          </label>
        </div>
        <p className="muted sheet-note">{t('sale.note')}</p>
        {error && <p className="import-error" role="alert">{error}</p>}

        <div className="sheet-actions">
          <button type="button" className="controls" onClick={() => ref.current.close()}>{t('sale.cancel')}</button>
          <button type="submit" className="controls primary">{t('sale.save')}</button>
        </div>
      </form>
    </dialog>
  )
}
