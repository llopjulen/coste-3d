import { useId } from 'react'
import { useI18n } from './i18n/context.js'
import { LANGS, LANG_NAMES, selectorVisible } from './i18n/index.js'

/* The language of a DOCUMENT (customer quote, report), separate from the
   language of the screen: someone working in Spanish can send an English
   quote. It starts as the screen's language. Hidden while the language
   selector itself is hidden (see READY in i18n/index.js). */
export default function DocLangSelect({ value, onChange }) {
  const { t } = useI18n()
  const id = useId()
  if (!selectorVisible()) return null
  return (
    <span className="doc-lang">
      <label htmlFor={id}>{t('doc.lang')}</label>
      <select id={id} className="currency" value={value} onChange={e => onChange(e.target.value)}>
        {LANGS.map(code => <option key={code} value={code}>{LANG_NAMES[code]}</option>)}
      </select>
    </span>
  )
}
