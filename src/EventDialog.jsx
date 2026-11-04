import { useEffect, useRef, useState } from 'react'
import { useI18n } from './i18n/context.js'
import { MAX_NOTE, MAX_TITLE, newEventId } from './calendarEvents.js'
import { isDay } from './schedule.js'

/* ==================================================================
   EVENT DIALOG — write something into the calendar by hand.

   `event` is an existing entry (edit, with Delete) or { date } for a new
   one on the day that was selected. Same native <dialog> + showModal() as
   OrderDialog and SaleDialog: focus trap, Esc to close and the backdrop
   come from the browser. Validation lives in calendarEvents.js
   (sanitizeEvent); this only refuses to save without a title or a day,
   so the person sees why instead of the entry silently not appearing.
================================================================== */
export default function EventDialog({ event, onSave, onDelete, onClose }) {
  const { t } = useI18n()
  const ref = useRef(null)
  const isNew = !event.id
  const [title, setTitle] = useState(event.title ?? '')
  const [date, setDate] = useState(event.date ?? '')
  const [time, setTime] = useState(event.time ?? '')
  const [note, setNote] = useState(event.note ?? '')
  const [error, setError] = useState(null)

  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    const close = () => onClose()
    dialog.addEventListener('close', close)
    return () => { dialog.removeEventListener('close', close); if (dialog.open) dialog.close() }
  }, [onClose])

  const submit = e => {
    e.preventDefault()
    if (!title.trim()) return setError(t('event.needTitle'))
    if (!isDay(date)) return setError(t('event.needDate'))
    // A new entry gets its id here, on save: cancelling a new one leaves nothing behind.
    onSave({ id: event.id ?? newEventId(), date, title, time: time || undefined, note })
  }

  return (
    <dialog ref={ref} className="sheet" aria-labelledby="event-title">
      <form onSubmit={submit} noValidate>
        <h2 id="event-title">{isNew ? t('event.titleNew') : t('event.titleEdit')}</h2>
        <div className="sheet-group">
          <label className="sheet-row">
            <span className="sr-only">{t('event.what')}</span>
            <input
              className="wide"
              type="text"
              value={title}
              maxLength={MAX_TITLE}
              placeholder={t('event.placeholder')}
              // A new entry is opened to type into it; editing shouldn't jump the cursor around.
              autoFocus={isNew}
              onChange={e => { setTitle(e.target.value); setError(null) }}
            />
          </label>
        </div>
        <div className="sheet-group">
          <label className="sheet-row">
            <span>{t('event.date')}</span>
            <input type="date" value={date} onChange={e => { setDate(e.target.value); setError(null) }} />
          </label>
          <label className="sheet-row">
            <span>{t('event.time')}</span>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} />
          </label>
        </div>
        <div className="sheet-group">
          <label className="sheet-row sheet-row-text">
            <span className="sr-only">{t('event.note')}</span>
            <textarea rows={3} value={note} maxLength={MAX_NOTE} placeholder={t('event.note')} onChange={e => setNote(e.target.value)} />
          </label>
        </div>
        {error && <p className="import-error" role="alert">{error}</p>}

        <div className="sheet-actions">
          {!isNew && (
            <button type="button" className="controls danger-text" onClick={() => onDelete(event.id)}>{t('event.delete')}</button>
          )}
          <span className="sheet-spacer" />
          <button type="button" className="controls" onClick={() => ref.current.close()}>{t('sale.cancel')}</button>
          <button type="submit" className="controls primary">{t('event.save')}</button>
        </div>
      </form>
    </dialog>
  )
}
