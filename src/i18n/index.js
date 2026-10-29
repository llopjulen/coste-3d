/* ==================================================================
   i18n — el nucleo: idiomas, deteccion y traduccion. Sin React.

   Por que a mano y no react-i18next / FormatJS: la app tiene unos cientos
   de textos y tres idiomas. Una libreria añadiria dependencia, peso y
   una API que aprender para hacer lo que aqui son 40 lineas: buscar una
   clave en un objeto y sustituir {huecos}. Si algun dia hacen falta
   plurales complejos o idiomas con genero gramatical, se migra.

   Como funciona:
   - Cada idioma es un objeto plano `clave -> texto` (en.js, es.js, fr.js).
   - El ingles es la REFERENCIA: es el que se escribe primero y al que
     se recurre si a otro idioma le falta una clave (mejor un texto en
     ingles que una pantalla con "history.title" escrito).
   - Los huecos van entre llaves: "Saved “{name}”". El test de
     i18n.test.js comprueba que los tres idiomas tienen las mismas
     claves y los mismos huecos.
   - La eleccion se guarda en localStorage (clave `lang`), fuera de la
     copia de seguridad: es una preferencia del dispositivo, como `theme`.

   READY: mientras la traduccion no cubra TODA la app, el idioma queda en
   ingles y el selector oculto, salvo con `?lang=es` o `?lang=fr` en la
   direccion (para probar). Asi nadie ve una app traducida a medias.
   Se pone a true en el PR que termina la traduccion.
================================================================== */
export const LANGS = ['en', 'es', 'fr']
export const READY = false

// Nombre de cada idioma en SU idioma: es lo que se enseña en el selector.
export const LANG_NAMES = { en: 'English', es: 'Español', fr: 'Français' }

// Etiqueta de Intl para fechas y numeros de cada idioma.
export const LOCALES = { en: 'en-GB', es: 'es-ES', fr: 'fr-FR' }

const KEY = 'lang'

/* "es-MX", "ES", "fr_CA" -> 'es' / 'fr'; cualquier otra cosa -> null. */
export function normalizeLang(value) {
  if (typeof value !== 'string') return null
  const base = value.toLowerCase().split(/[-_]/)[0]
  return LANGS.includes(base) ? base : null
}

/* El primer idioma de la lista del navegador que tengamos, o 'en'.
   navigator.languages va por orden de preferencia de la persona. */
export function detectLang(languages) {
  for (const l of languages ?? []) {
    const found = normalizeLang(l)
    if (found) return found
  }
  return 'en'
}

function fromUrl() {
  try {
    return normalizeLang(new URLSearchParams(window.location.search).get('lang'))
  } catch {
    return null
  }
}

function stored() {
  try {
    return normalizeLang(localStorage.getItem(KEY))
  } catch {
    return null // modo privado o almacenamiento bloqueado
  }
}

/* Orden: ?lang= en la direccion (solo para probar), luego la eleccion
   guardada, luego el navegador. Mientras READY sea false, solo cuenta la URL. */
export function readLang() {
  const url = fromUrl()
  if (url) return url
  if (!READY) return 'en'
  return stored() ?? detectLang(typeof navigator !== 'undefined' ? navigator.languages : [])
}

export function saveLang(lang) {
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    // sin almacenamiento: el cambio vale solo hasta recargar
  }
}

/* "Hola {name}" + { name: 'Ana' } -> "Hola Ana". Un hueco sin valor se queda
   tal cual ({name}) para que el fallo se vea en pantalla y no desaparezca. */
export function fill(text, vars) {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole))
}

/* Para textos con un trozo que no es texto (un <strong>, un enlace): parte el
   texto en piezas, strings normales y {slot: 'nombre'} donde va el hueco que
   se quiere rellenar con un elemento. Los demas huecos se rellenan como
   siempre. Lo convierte en JSX Provider.jsx (este modulo no usa React). */
export function splitSlots(text, vars, slots) {
  return text
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map(piece => {
      const name = piece.match(/^\{(\w+)\}$/)?.[1]
      if (name && slots.includes(name)) return { slot: name }
      return fill(piece, vars)
    })
}

/* Busca `key` en el idioma pedido, luego en ingles, y si no esta en ninguno
   devuelve la propia clave. Object.hasOwn y no `dict[key]`: una clave como
   "constructor" o "toString" no debe devolver una funcion de Object. */
export function rawText(dicts, lang, key) {
  const own = dicts[lang]
  return own && Object.hasOwn(own, key) ? own[key] : Object.hasOwn(dicts.en, key) ? dicts.en[key] : key
}

export function translate(dicts, lang, key, vars) {
  return fill(rawText(dicts, lang, key), vars)
}

/* El separador decimal de un idioma ("." o ","), sacado de Intl y no
   escrito a mano. */
export function decimalSeparator(locale) {
  return new Intl.NumberFormat(locale).formatToParts(1.1).find(p => p.type === 'decimal')?.value ?? '.'
}

/* El selector se enseña cuando la traduccion esta lista, o si la direccion
   lleva ?lang= (para que Julen y quien revise puedan probarla antes). */
export function selectorVisible() {
  return READY || fromUrl() !== null
}
