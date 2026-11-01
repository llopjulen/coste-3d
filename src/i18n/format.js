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

// 12.5 -> "12.50 EUR" / "12,50 EUR". Siempre dos decimales y sin separador de
// miles, igual que formatMoney de la app: solo cambia la coma o el punto.
export const fmtMoney = (locale, amount, currency) =>
  `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(amount)} ${currency}`
