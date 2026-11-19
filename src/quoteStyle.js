/* ==================================================================
   QUOTE STYLE — how the customer quote looks: an accent colour, a layout
   and a typeface, chosen by the business and saved with its details
   (localStorage `business`, so it also travels in the backup).

   Pure, no React: CustomerQuote.jsx reads it and backup.js validates it
   with the same lists, so a value can't be valid in one place and not in
   the other.
================================================================== */

// Colours that print well on white paper and read as "a business", not as
// a toy. The person can also pick any other with the colour picker.
export const ACCENTS = ['#1D1D1F', '#B7791F', '#1F3A5F', '#2F5D50', '#7A2E3A', '#4B3F72']
export const DEFAULT_ACCENT = '#1D1D1F'

// line: rules in the accent colour (the classic sheet)
// band: the header is a block of the accent colour, the name in white on it
// minimal: no rules at all, only the title and the total in the accent colour
export const STYLES = ['line', 'band', 'minimal']
export const FONTS = ['sans', 'serif']

export const isHexColor = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

/* Whatever the business object holds -> a complete, valid style. */
export function quoteStyleOf(business) {
  return {
    accent: isHexColor(business?.accent) ? business.accent.toUpperCase() : DEFAULT_ACCENT,
    style: STYLES.includes(business?.docStyle) ? business.docStyle : 'line',
    font: FONTS.includes(business?.docFont) ? business.docFont : 'sans',
  }
}

/* Relative luminance (WCAG): 0 for black, 1 for white. */
export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/* The text colour to put ON the accent (the "band" header): whichever of
   white or near-black contrasts more with it. */
export function textOn(hex) {
  const l = luminance(hex)
  return contrast(l, 1) >= contrast(l, luminance('#1D1D1F')) ? '#FFFFFF' : '#1D1D1F'
}

/* An accent too light to read as text on white paper (under 3:1, the WCAG
   minimum for large text) is darkened for titles and totals, and kept as
   it is for fills. Returns the colour to use for text on white. */
export function inkOf(hex) {
  if (contrast(luminance(hex), 1) >= 3) return hex
  // Mix with black until it reaches 3:1.
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  for (let k = 0.9; k > 0; k -= 0.05) {
    const mixed = '#' + rgb.map(c => Math.round(c * k).toString(16).padStart(2, '0')).join('').toUpperCase()
    if (contrast(luminance(mixed), 1) >= 3) return mixed
  }
  return '#1D1D1F'
}
