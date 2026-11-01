/* Los tres diccionarios juntos y un traductor para un idioma concreto.

   Por que existe: el Provider traduce al idioma de la INTERFAZ, pero los
   documentos (presupuesto del cliente, informe, Excel) pueden estar en otro
   idioma: quien trabaja en español puede mandar el presupuesto a un cliente
   en inglés. `translatorFor('en')` da un t/tp/locale fijos para ese idioma,
   sin React, y asi tambien lo usa exportExcel.js, que no es un componente. */
import { LOCALES, normalizeLang, translate, translatePlural } from './index.js'
import en from './en.js'
import es from './es.js'
import fr from './fr.js'

export const DICTS = { en, es, fr }

export function translatorFor(lang) {
  const code = normalizeLang(lang) ?? 'en'
  return {
    lang: code,
    locale: LOCALES[code],
    t: (key, vars) => translate(DICTS, code, key, vars),
    tp: (key, n, vars) => translatePlural(DICTS, code, key, n, vars),
  }
}
