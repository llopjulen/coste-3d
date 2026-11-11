/* Fechas y numeros segun el idioma. Sin React: se prueban directamente.
   `locale` es una etiqueta de Intl (LOCALES en index.js: en-GB, es-ES, fr-FR).

   Por que en un archivo aparte y con el locale como parametro: antes cada
   pantalla tenia su propio `toLocaleDateString('en-GB', ...)` escrito a mano,
   y cambiar el idioma exigia tocarlos todos. */

// "12 Oct 2026", "12 oct 2026", "12 oct. 2026": con el mes en letras nadie confunde dia y mes.
export const fmtDay = (locale, dt) =>
  dt.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })

// "22 Oct 2026, 07:15"
export const fmtDateTime = (locale, dt) =>
  dt.toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// "22 Oct, 07:15" (sin año: para listas de trabajos recientes)
export const fmtShort = (locale, dt) =>
  dt.toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// "October 2026" / "Octubre de 2026" / "Octobre 2026": titulo de un mes, con mayuscula inicial
// (en español y francés los meses van en minuscula en una frase, pero un titulo la lleva).
export const fmtMonthYear = (locale, dt) => {
  const text = dt.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
}

// 3.5 -> "3.5" / "3,5". `digits` = decimales maximos; los ceros sobrantes no se escriben.
export const fmtNumber = (locale, n, digits = 2) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n)

// Gramos con un decimal fijo: "45.0 g" / "45,0 g".
export const fmtGrams = (locale, g) =>
  `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(g)} g`

// "12 October 2026" / "12 de octubre de 2026" / "12 octobre 2026": la fecha de un documento.
export const fmtLongDay = (locale, dt) =>
  dt.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })

// "Oct" / "oct" / "oct.": el mes solo, para el pie de una barra de gráfica.
export const fmtMonthShort = (locale, dt) => dt.toLocaleDateString(locale, { month: 'short' })

/* Money, as a person writes it: "7,94 €" in Spanish and French, "€7.94" in
   English. Until 2026-11-11 this was "7.94 EUR": the ISO code after every
   amount, dozens of times per screen, read like a database dump.

   Intl.NumberFormat with style "currency" knows, for each language, where the
   symbol goes, which separator to use and how many decimals the currency has
   (the yen has none). `narrowSymbol` gives "$" instead of "US$": the currency
   selector already says which dollar it is.

   Building an Intl.NumberFormat is slow (it loads locale data) and a screen
   formats hundreds of amounts, so the formatters are kept in a Map. */
const moneyFormats = new Map()
function moneyFormat(locale, currency) {
  const key = `${locale}|${currency}`
  let f = moneyFormats.get(key)
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
    } catch {
      // A code Intl does not know (it throws RangeError): plain number and the code.
      const n = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      f = { format: v => `${n.format(v)} ${currency}`, formatToParts: v => [...n.formatToParts(v), { type: 'literal', value: ' ' }, { type: 'currency', value: currency }] }
    }
    moneyFormats.set(key, f)
  }
  return f
}
const finite = n => (Number.isFinite(n) ? n : 0)

export const fmtMoney = (locale, amount, currency) => moneyFormat(locale, currency).format(finite(amount))

/* The same amount in pieces, so the big price can draw the cents and the
   symbol smaller: { prefix: "€", whole: "7", decimal: ".", cents: "94", suffix: "" }
   in English, { prefix: "", whole: "7", decimal: ",", cents: "94", suffix: "€" }
   in Spanish. */
export function moneyParts(locale, amount, currency) {
  const out = { prefix: '', whole: '', decimal: '', cents: '', suffix: '' }
  let seenNumber = false
  for (const part of moneyFormat(locale, currency).formatToParts(finite(amount))) {
    if (part.type === 'integer' || part.type === 'group' || part.type === 'minusSign') { out.whole += part.value; seenNumber = true }
    else if (part.type === 'decimal') out.decimal = part.value
    else if (part.type === 'fraction') out.cents = part.value
    else if (part.type === 'currency') out[seenNumber ? 'suffix' : 'prefix'] = part.value
  }
  return out
}

/* A number as text for a form field, in the language's notation ("0,8"), and
   back. parseNumber takes a comma or a point whatever the language: people
   paste "0.8" from a slicer into a Spanish page. Not valid -> null. */
export const numberToText = (n, decimal) => (Number.isFinite(n) ? String(n).replace('.', decimal) : '')
export function parseNumber(text) {
  const clean = String(text).trim().replace(',', '.')
  if (clean === '') return 0
  return /^-?\d*\.?\d*$/.test(clean) && Number.isFinite(Number(clean)) ? Number(clean) : null
}
