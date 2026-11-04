import { useCallback, useMemo, useState } from 'react'
import { useI18n } from './i18n/context.js'
import { fmtDay, fmtLongDay, fmtMonthYear, fmtNumber } from './i18n/format.js'
import { dayKey, dayStart, eventsByDay, planOrders } from './schedule.js'
import { readEvents, removeEvent, upsertEvent, writeEvents } from './calendarEvents.js'
import EventDialog from './EventDialog.jsx'

/* ==================================================================
   CALENDAR — deliveries, the print queue and sales, by day.

   Left: the month, Monday first (as in Spain and France), with a dot for
   each thing on that day: a delivery agreed with a client, the day the
   queue says an order will be printed, a sale. Tapping a day lists them.
   Right: the print queue (schedule.js), earliest delivery first, with the
   estimated ready day of each order and a warning when it can't make it.

   Deliveries, the queue and sales are not stored: they're worked out from
   the saved quotes and the printing hours a week of "Your setup", every
   time it's drawn. The person's own entries ("buy PETG", "craft fair")
   are the one thing stored here (calendarEvents.js). They live in this
   component's state, read once on mount: a restore happens in History,
   and coming back here mounts the calendar again, so it reads the
   restored ones without App having to hold them.
================================================================== */

const KIND_ORDER = { due: 0, ready: 1, sold: 2, own: 3 }

export default function Calendar({ quotes, weekHours, formatMoney, onGoToHistory }) {
  const { t, tp, locale } = useI18n()
  const today = dayKey(new Date())
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [selected, setSelected] = useState(today)
  const [own, setOwn] = useState(() => readEvents())
  // null, or the entry in the dialog: an existing one, or { date } for a new one.
  const [editing, setEditing] = useState(null)
  const [storageError, setStorageError] = useState(false)

  // Every change goes to state AND storage; if storage refuses (full,
  // blocked), the entry stays on screen and a line says it won't survive a reload.
  const commit = next => { setOwn(next); setStorageError(!writeEvents(next)); setEditing(null) }
  // Stable identity: the dialog's effect depends on onClose.
  const closeDialog = useCallback(() => setEditing(null), [])

  const plan = useMemo(() => planOrders(quotes, { weekHours }), [quotes, weekHours])
  const events = useMemo(() => {
    const byDay = eventsByDay(quotes, plan)
    for (const e of own) (byDay[e.date] ??= []).push({ kind: 'own', event: e })
    return byDay
  }, [quotes, plan, own])

  // The 6 × 7 grid: from the Monday on or before the 1st.
  const first = new Date(month)
  const offset = (first.getDay() + 6) % 7
  const cells = Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + i))
  // Weekday initials in the language of the screen, starting on Monday (5 Jan 2026 was a Monday).
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(2026, 0, 5 + i)))

  const move = n => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1))
  const dayEvents = (events[selected] ?? []).slice().sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
  const late = plan.filter(p => p.late).length

  return (
    <main className="wrap">
      <h1>{t('cal.title')}</h1>
      <p className="subtitle">{t('cal.lead')}</p>

      <div className="cal-layout">
        <section className="panel cal" aria-labelledby="cal-month">
          <div className="cal-head">
            {/* First letter up only: "noviembre de 2026" -> "Noviembre de 2026" (CSS capitalize would also do "De"). */}
            <h2 id="cal-month">{(m => m.charAt(0).toUpperCase() + m.slice(1))(fmtMonthYear(locale, month))}</h2>
            <div className="cal-nav">
              <button type="button" className="row-btn" onClick={() => move(-1)} aria-label={t('cal.prev')}>‹</button>
              <button type="button" className="row-btn" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(today) }}>{t('cal.today')}</button>
              <button type="button" className="row-btn" onClick={() => move(1)} aria-label={t('cal.next')}>›</button>
            </div>
          </div>
          <div className="cal-grid" role="grid" aria-labelledby="cal-month">
            {weekdays.map((w, i) => <div key={i} className="cal-wd" aria-hidden="true">{w}</div>)}
            {cells.map(d => {
              const key = dayKey(d)
              const list = events[key] ?? []
              const kinds = [...new Set(list.map(e => e.kind))].sort((a, b) => KIND_ORDER[a] - KIND_ORDER[b])
              const out = d.getMonth() !== month.getMonth()
              return (
                <button
                  key={key}
                  type="button"
                  className={['cal-day', out && 'out', key === today && 'today', key === selected && 'sel'].filter(Boolean).join(' ')}
                  aria-pressed={key === selected}
                  aria-label={`${fmtLongDay(locale, d)}${list.length ? `, ${tp('cal.things', list.length)}` : ''}`}
                  onClick={() => setSelected(key)}
                >
                  <span className="cal-num">{d.getDate()}</span>
                  <span className="cal-dots" aria-hidden="true">{kinds.map(k => <i key={k} className={`dot dot-${k}`} />)}</span>
                </button>
              )
            })}
          </div>
          <div className="cal-legend" aria-hidden="true">
            <span><i className="dot dot-due" />{t('cal.kind.due')}</span>
            <span><i className="dot dot-ready" />{t('cal.kind.ready')}</span>
            <span><i className="dot dot-sold" />{t('cal.kind.sold')}</span>
            <span><i className="dot dot-own" />{t('cal.kind.own')}</span>
          </div>

          <div className="cal-daylist">
            <div className="cal-daylist-head">
              <h3>{fmtLongDay(locale, dayStart(selected))}</h3>
              <button
                type="button"
                className="row-btn cal-add"
                aria-label={t('cal.addLabel', { date: fmtLongDay(locale, dayStart(selected)) })}
                onClick={() => setEditing({ date: selected })}
              >
                + {t('cal.add')}
              </button>
            </div>
            {dayEvents.length === 0
              ? <p className="muted">{t('cal.nothing')}</p>
              : (
                <ul>
                  {dayEvents.map((e, i) => e.kind === 'own' ? (
                    <li key={e.event.id}>
                      {/* The whole row opens the entry: a 44 px target, like a row in iOS Calendar. */}
                      <button type="button" className="cal-own" onClick={() => setEditing(e.event)}>
                        <i className="dot dot-own" aria-hidden="true" />
                        <span className="name">
                          {e.event.title}
                          {e.event.note && <span className="muted cal-own-note">{e.event.note}</span>}
                        </span>
                        <span className="muted">{e.event.time ?? ''}</span>
                      </button>
                    </li>
                  ) : (
                    <li key={i}>
                      <i className={`dot dot-${e.kind}`} aria-hidden="true" />
                      <span className="name">{e.quote.name ?? t('save.untitled')}{e.quote.client ? ` — ${e.quote.client}` : ''}</span>
                      <span className="muted">
                        {e.kind === 'sold' ? formatMoney(e.quote.sale.amount) : t(`cal.kind.${e.kind}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            {storageError && <p className="import-error" role="alert">{t('cal.storageError')}</p>}
          </div>
        </section>

        <section aria-labelledby="queue-title">
          <h2 id="queue-title" className="group-title">
            {t('cal.queue')}
            {late > 0 && <span className="late-badge">{t('cal.lateCount', { n: late })}</span>}
          </h2>
          {plan.length === 0 ? (
            <div className="panel cal-empty">
              <p>{t('cal.empty')}</p>
              <button type="button" className="controls" onClick={onGoToHistory}>{t('cal.goHistory')}</button>
            </div>
          ) : (
            <ul className="panel queue">
              {plan.map(p => (
                <li key={p.quote.id} className="queue-row">
                  <div className="queue-main">
                    <span className="name">{p.quote.name ?? t('save.untitled')}</span>
                    <span className="muted">
                      {[p.quote.client, p.hours !== null && t('cal.hours', { h: fmtNumber(locale, p.hours, 1) })].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <div className="queue-dates">
                    <span>{p.readyAt ? t('cal.readyOn', { date: fmtDay(locale, p.readyAt) }) : t('cal.noEstimate')}</span>
                    <span className="muted">{p.dueAt ? t('cal.dueOn', { date: fmtDay(locale, p.dueAt) }) : t('cal.noDue')}</span>
                  </div>
                  {p.dueAt && p.readyAt && (
                    <span className={`queue-state ${p.late ? 'late' : 'ok'}`}>{p.late ? t('cal.late') : t('cal.onTime')}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="muted cal-note">
            {weekHours > 0 ? t('cal.note', { hours: fmtNumber(locale, weekHours, 0) }) : t('order.noHours')}
          </p>
        </section>
      </div>

      {editing && (
        <EventDialog
          event={editing}
          onSave={e => {
            commit(upsertEvent(own, e))
            // Follow the entry if its day was changed to another one, maybe in another month.
            const d = dayStart(e.date)
            setSelected(e.date)
            setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
          }}
          onDelete={id => commit(removeEvent(own, id))}
          onClose={closeDialog}
        />
      )}
    </main>
  )
}
