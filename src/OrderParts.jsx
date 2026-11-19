import { useState } from 'react'
import { useI18n } from './i18n/context.js'

/* ==================================================================
   Small pieces shared by the Orders screens.

   Inputs here SAVE ON BLUR (or Enter), not on every key: each save is a
   store write, and with a database behind it a note typed letter by letter
   would be forty requests. The text being typed lives in local state and is
   handed over once, when the person leaves the field.
================================================================== */

/* Status of an order: a dot and a word. The colour is never the only cue
   (the word is there), so it reads the same for colour-blind people. */
export function StatusPill({ status }) {
  const { t } = useI18n()
  return <span className={`opill st-${status}`}><i aria-hidden="true" />{t(`order.status.${status}`)}</span>
}

export function PaymentPill({ payment }) {
  const { t } = useI18n()
  return <span className={`opill pay-${payment}`}>{t(`order.pay.${payment}`)}</span>
}

// With the language's decimal separator ("4,95" in Spanish and French), so an
// amount being edited looks like the amounts around it. Reading accepts both.
const toText = (n, decimal) => (Math.round(n * 100) / 100).toFixed(2).replace('.', decimal)
const toNumber = text => parseFloat(String(text).replace(',', '.'))

/* A text field that commits on blur / Enter. `key` it by the record id
   when the record can change underneath, so the draft starts over. */
export function CommitText({ value, onCommit, multiline = false, ...rest }) {
  const [draft, setDraft] = useState(value ?? '')
  const commit = () => { if (draft !== (value ?? '')) onCommit(draft) }
  const props = {
    ...rest,
    value: draft,
    onChange: e => setDraft(e.target.value),
    onBlur: commit,
  }
  return multiline
    ? <textarea {...props} />
    : <input type="text" {...props} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
}

/* Money in EUR, typed in the currency on screen (× rate to show, ÷ rate to
   store, like the old sale sheet). An empty or invalid entry goes back to what it
   was instead of saving NaN. */
export function MoneyInput({ value, rate, onCommit, ...rest }) {
  const { decimal } = useI18n()
  const [draft, setDraft] = useState(null)
  const shown = draft ?? toText(value * rate, decimal)
  const commit = () => {
    if (draft === null) return
    const n = toNumber(draft)
    setDraft(null)
    if (Number.isFinite(n) && n >= 0 && Math.abs(n / rate - value) > 1e-9) onCommit(n / rate)
  }
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={shown}
      onFocus={e => e.currentTarget.select()}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
    />
  )
}

/* A whole number ≥ 1 (quantities). */
export function QtyInput({ value, onCommit, ...rest }) {
  const [draft, setDraft] = useState(null)
  const commit = () => {
    if (draft === null) return
    const n = Number(draft)
    setDraft(null)
    if (Number.isSafeInteger(n) && n >= 1 && n !== value) onCommit(n)
  }
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={draft ?? String(value)}
      onFocus={e => e.currentTarget.select()}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
    />
  )
}
