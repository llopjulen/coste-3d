import { useEffect, useRef, useState } from 'react'
import { useI18n } from './i18n/context.js'
import { fmtLongDay, fmtNumber } from './i18n/format.js'
import { dayStart, isDay, planOrders, suggestDue } from './schedule.js'

/* ==================================================================
   ORDER DIALOG — the client said yes: when must it be delivered?

   The date starts at the day the print queue says the order would be
   ready (schedule.js), so the common case is one tap. The person can type
   the date agreed with the client instead; the calendar then warns if the
   queue can't make it. Same native <dialog> as SaleDialog.
================================================================== */
export default function OrderDialog({ quote, quotes, weekHours, onSave, onClose }) {
  const { t, locale } = useI18n()
  const ref = useRef(null)
  const suggested = suggestDue(quotes, quote, { weekHours })
  const [due, setDue] = useState(isDay(quote.dueAt) ? quote.dueAt : suggested)
  // Hours of the orders already queued in front of this one, to explain the suggestion.
  const ahead = planOrders(quotes.filter(q => q.id !== quote.id), { weekHours })
    .reduce((sum, p) => sum + (p.hours ?? 0), 0)

  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    const close = () => onClose()
    dialog.addEventListener('close', close)
    return () => { dialog.removeEventListener('close', close); if (dialog.open) dialog.close() }
  }, [onClose])

  const submit = e => {
    e.preventDefault()
    onSave(isDay(due) ? due : null)
  }

  return (
    <dialog ref={ref} className="sheet" aria-labelledby="order-title">
      <form onSubmit={submit} noValidate>
        <h2 id="order-title">{t('order.title')}</h2>
        <p className="muted sheet-sub">{quote.name ?? t('save.untitled')}{quote.client ? ` — ${quote.client}` : ''}</p>
        <div className="sheet-group">
          <label className="sheet-row">
            <span>{t('order.due')}</span>
            <input type="date" value={due} onChange={e => setDue(e.target.value)} />
          </label>
        </div>
        <p className="muted sheet-note">
          {!(weekHours > 0)
            ? t('order.noHours')
            : ahead > 0
              ? t('order.hint', { hours: fmtNumber(locale, ahead, 1), date: fmtLongDay(locale, dayStart(suggested)) })
              : t('order.hintEmpty', { date: fmtLongDay(locale, dayStart(suggested)) })}
        </p>
        <div className="sheet-actions">
          <button type="button" className="controls" onClick={() => ref.current.close()}>{t('sale.cancel')}</button>
          <button type="submit" className="controls primary">{t('order.save')}</button>
        </div>
      </form>
    </dialog>
  )
}
