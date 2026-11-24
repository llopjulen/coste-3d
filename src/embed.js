/* ==================================================================
   EMBED — the calculator as a small widget inside someone else's page.

   A shop (Shopify, WordPress…) puts an <iframe src="https://layercents.com/
   ?embed&cur=CAD&pg=0.09&…"> on its own page. This file is the pure part:
   it reads the address of the iframe and turns it into (1) the look and
   (2) the seller's rates, and it does the quote arithmetic. No React, so
   `npm test` can run it.

   The address is UNTRUSTED INPUT. Anyone can send a link with whatever
   they like after the "?", and the page runs with the visitor's browser.
   The rule that keeps this safe: no text from the address is ever pasted
   into CSS or HTML.
   - Colours must be exactly 3 or 6 hex digits, and are re-written by us
     ("#C6FF00"). `accent=red;background:url(//evil)` is rejected whole.
   - The font is a KEY into a list of our own font stacks, never a name.
   - The radius is an integer between 0 and 24.
   - Rates are numbers, clamped. The currency is 3 letters.
   - The only free text is `taxname`, which React prints as text (it
     escapes it) and which is cut to 12 characters.
   Anything invalid falls back to the default instead of breaking the
   page: a wrong link should still show a working widget.

   Why the colours go WITHOUT "#": in a URL, "#" starts the fragment, so
   `?accent=#C6FF00` reaches the page as `?accent=` and the colour is
   lost. `accent=C6FF00` works; `accent=%23C6FF00` (encoded) works too.

   What goes in the address is PUBLIC: anyone who opens the shop page can
   read it in the iframe tag. So only the rates the customer is charged
   belong there, never the seller's costs or margin.
================================================================== */
import { contrast, luminance, textOn } from './quoteStyle.js'

export const isEmbed = search => new URLSearchParams(search).has('embed')

// Two looks, the same tokens as the app (DESIGN.md). `bg` is the lienzo.
const THEMES = {
  dark: { bg: '#111113', text: '#F2F2F0' },
  light: { bg: '#FFFFFF', text: '#1D1D1F' },
}
const DEFAULT_ACCENT = '#E3AE4F' // the brand gold, until the shop picks its own

// Only the fonts the site already serves itself (Inter, @fontsource) plus
// the visitor's system font and a serif. More fonts = one npm package each
// (self-hosted, no Google): added when a shop actually asks for one.
export const EMBED_FONTS = {
  inter: "'Inter Variable', system-ui, sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  serif: "ui-serif, Georgia, 'Times New Roman', serif",
}

/* "c6ff00" | "#C6FF00" | "fb0" -> "#C6FF00" (a 3-digit colour is expanded:
   #fb0 = #ffbb00). Anything else -> null. */
export function parseHex(value) {
  if (typeof value !== 'string') return null
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value.trim())
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1]
  return `#${h.toUpperCase()}`
}

const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

/* `weight` (0..1) of `b` mixed into `a`: mix('#000000', '#FFFFFF', .5) = '#808080'.
   The panel and the separators are the canvas nudged towards the text colour,
   so any pair of colours the shop chooses gets a matching set of greys. */
export function mix(a, b, weight) {
  const [ca, cb] = [channels(a), channels(b)]
  return '#' + ca.map((c, i) => Math.round(c + (cb[i] - c) * weight).toString(16).padStart(2, '0')).join('').toUpperCase()
}

/* Whatever is after the "?" -> the complete, valid look. */
export function embedTheme(search) {
  const p = new URLSearchParams(search)
  const theme = p.get('theme') === 'light' ? 'light' : 'dark'
  const base = THEMES[theme]
  const transparent = p.get('bg') === 'transparent'
  // A transparent canvas still needs a colour to derive the greys from: the theme's.
  const bg = transparent ? base.bg : parseHex(p.get('bg')) ?? base.bg
  const text = parseHex(p.get('text')) ?? base.text
  const accent = parseHex(p.get('accent')) ?? DEFAULT_ACCENT
  // Digits only: parseInt('1e3') is 1 and parseInt('9px;x') is 9, both would
  // accept text that is not a number. A whole-string check does not.
  const rawRadius = p.get('radius') ?? ''
  const r = /^\d{1,2}$/.test(rawRadius) ? Number(rawRadius) : NaN
  const radius = r >= 0 && r <= 24 ? r : 14
  const font = Object.hasOwn(EMBED_FONTS, p.get('font')) ? p.get('font') : 'inter'

  // The accent as TEXT (the total) must read on the canvas: under 3:1 (WCAG
  // minimum for large text) it falls back to the text colour. As a FILL
  // (the focus ring, the line above the total) it stays as chosen.
  // Muted text: the canvas pulled towards the text colour, as little as it takes
  // to reach 4.5:1 on the panel (WCAG AA). A fixed share worked on dark but gave
  // 3.5:1 on white, so it is searched for instead of guessed.
  const panel = mix(bg, text, 0.06)
  let tenue = mix(bg, text, 0.62)
  for (let w = 0.62; w <= 1 && contrast(luminance(tenue), luminance(panel)) < 4.5; w += 0.04) tenue = mix(bg, text, w)
  const accentReads = contrast(luminance(accent), luminance(bg)) >= 3
  return {
    theme,
    transparent,
    font,
    radius,
    vars: {
      '--fondo': bg,
      '--panel': panel,
      '--hundido': mix(bg, text, 0.1),
      '--borde': mix(bg, text, 0.14),
      '--texto': text,
      '--tenue': tenue,
      '--oro': accent,
      '--oro-vivo': mix(accent, text, 0.18),
      '--oro-texto': accentReads ? accent : text,
      '--sobre-oro': textOn(accent),
      '--radio': `${radius}px`,
      '--radio-campo': `${Math.round(radius * 0.65)}px`,
      fontFamily: EMBED_FONTS[font],
    },
  }
}

const num = (value, fallback, min, max) => {
  if (value == null || value.trim() === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback
}

/* The seller's rates, what THE CUSTOMER pays (not the seller's costs):
   pg  per gram of filament      ph  per hour of machine time
   pl  per hour of labour        tax  percent (13 for Ontario's HST)
   cur ISO 4217 code of the seller's currency, shown as it is: in the
       widget there is NO conversion (the exchange rate would move the
       price a little every day, and a shop must show a stable price).
   The defaults only exist so a bare `?embed` shows a working demo. */
export function embedRates(search) {
  const p = new URLSearchParams(search)
  const cur = (p.get('cur') ?? '').trim().toUpperCase()
  return {
    currency: /^[A-Z]{3}$/.test(cur) ? cur : 'EUR',
    perGram: num(p.get('pg'), 0.04, 0, 1000),
    perMachineHour: num(p.get('ph'), 2.5, 0, 10000),
    perLabourHour: num(p.get('pl'), 25, 0, 10000),
    taxPercent: num(p.get('tax'), 0, 0, 100),
    taxName: (p.get('taxname') ?? '').trim().slice(0, 12),
  }
}

// Money as whole cents, so the lines always add up to the total shown.
const cents = amount => Math.round((Number.isFinite(amount) ? amount : 0) * 100 + 1e-9)

/* The customer's quote: three lines, subtotal, tax, total, all in cents.
   Every line is rounded on its own and the subtotal is the SUM OF THE
   ROUNDED LINES (what the customer can check with a calculator), the tax is
   rounded once on the subtotal, and the total is subtotal + tax. If the total
   were computed apart and rounded at the end, a 1-cent difference would show. */
export function embedQuote({ grams, hours, labourMinutes }, rates) {
  const pos = n => (Number.isFinite(n) && n > 0 ? n : 0)
  const filament = cents(pos(grams) * rates.perGram)
  const machine = cents(pos(hours) * rates.perMachineHour)
  const labour = cents((pos(labourMinutes) / 60) * rates.perLabourHour)
  const subtotal = filament + machine + labour
  const tax = Math.round((subtotal * rates.taxPercent) / 100 + 1e-9)
  return { filament, machine, labour, subtotal, tax, total: subtotal + tax }
}
