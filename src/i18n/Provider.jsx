import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { I18nContext } from './context.js'
import { LOCALES, decimalSeparator, normalizeLang, rawText, readLang, saveLang, splitSlots, translate } from './index.js'
import en from './en.js'
import es from './es.js'
import fr from './fr.js'

const DICTS = { en, es, fr }

/* Da a toda la app `t` (traducir), el idioma, su locale de Intl y el
   separador decimal. Cambiar de idioma re-renderiza el arbol entero: es lo
   que se quiere, y con una app de este tamaño cuesta microsegundos. */
export default function I18nProvider({ children }) {
  const [lang, setLangState] = useState(readLang)

  // <html lang> importa: lectores de pantalla (pronunciacion), el traductor
  // automatico del navegador (no ofrece traducir lo que ya esta en tu idioma)
  // y la hifenacion/comillas del CSS dependen de el.
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback(next => {
    const safe = normalizeLang(next)
    if (!safe) return
    setLangState(safe)
    saveLang(safe)
  }, [])

  const t = useCallback((key, vars) => translate(DICTS, lang, key, vars), [lang])

  // Como t, pero algunos huecos se rellenan con elementos de React:
  //   tr('hero.keep', { amount: '' }, { amount: <strong>12,00 EUR</strong> })
  // Cada idioma decide DONDE va el hueco (en frances, "Il vous reste X par
  // pièce"), por eso no se puede montar el JSX a mano alrededor de t().
  const tr = useCallback((key, vars, slots) => {
    const pieces = splitSlots(rawText(DICTS, lang, key), vars, Object.keys(slots))
    return pieces.map((p, i) => <Fragment key={i}>{typeof p === 'string' ? p : slots[p.slot]}</Fragment>)
  }, [lang])

  const value = useMemo(() => {
    const locale = LOCALES[lang]
    return { lang, setLang, t, tr, locale, decimal: decimalSeparator(locale) }
  }, [lang, setLang, t, tr])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
