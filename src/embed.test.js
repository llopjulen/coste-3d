/* Tests for embed.js. Run them with:  npm test */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EMBED_FONTS, embedQuote, embedRates, embedTheme, isEmbed, mix, parseHex } from './embed.js'
import { contrast, luminance } from './quoteStyle.js'

const ratio = (a, b) => contrast(luminance(a), luminance(b))

test('isEmbed only looks for the ?embed flag', () => {
  assert.equal(isEmbed('?embed'), true)
  assert.equal(isEmbed('?embed=1&cur=CAD'), true)
  assert.equal(isEmbed('?view=history'), false)
  assert.equal(isEmbed(''), false)
})

test('parseHex accepts 3 or 6 digits, with or without #, and rewrites them', () => {
  assert.equal(parseHex('c6ff00'), '#C6FF00')
  assert.equal(parseHex('#c6ff00'), '#C6FF00')
  assert.equal(parseHex('fb0'), '#FFBB00')
  assert.equal(parseHex(' #FFF '), '#FFFFFF')
})

test('parseHex rejects anything that is not a plain colour (CSS injection)', () => {
  for (const bad of ['red', 'c6ff0', 'c6ff000', '#c6ff00; background:url(//x)', 'url(javascript:1)', '<script>', '', null, undefined, 42]) {
    assert.equal(parseHex(bad), null, String(bad))
  }
})

test('a "#" typed raw in the address is lost by the browser: documented, not guessed', () => {
  // ?accent=#C6FF00 reaches the page as ?accent= (the # starts the fragment).
  assert.equal(embedTheme('?embed&accent=').vars['--oro'], '#E3AE4F')
  // Encoded, it survives: %23 -> #.
  assert.equal(embedTheme('?embed&accent=%23C6FF00').vars['--oro'], '#C6FF00')
})

test('no parameters = the dark brand look', () => {
  const t = embedTheme('?embed')
  assert.equal(t.theme, 'dark')
  assert.equal(t.transparent, false)
  assert.equal(t.font, 'inter')
  assert.equal(t.radius, 14)
  assert.equal(t.vars['--fondo'], '#111113')
  assert.equal(t.vars['--oro'], '#E3AE4F')
})

test('theme=light switches the defaults, not the shop colours', () => {
  const t = embedTheme('?embed&theme=light&accent=C6FF00')
  assert.equal(t.vars['--fondo'], '#FFFFFF')
  assert.equal(t.vars['--texto'], '#1D1D1F')
  assert.equal(t.vars['--oro'], '#C6FF00')
})

test('a dark shop with a lime accent: lime text on the canvas, dark text on the lime button', () => {
  const t = embedTheme('?embed&theme=dark&bg=0A0A0A&text=FFFFFF&accent=C6FF00')
  assert.equal(t.vars['--oro-texto'], '#C6FF00') // lime reads on near-black
  assert.equal(t.vars['--sobre-oro'], '#1D1D1F') // and the button text is dark, not white
  assert.ok(ratio(t.vars['--sobre-oro'], t.vars['--oro']) >= 4.5)
})

test('an accent that does not read on the canvas is not used as text', () => {
  // Pale yellow on white is ~1.2:1: the total would be invisible.
  const t = embedTheme('?embed&theme=light&accent=FFE680')
  assert.equal(t.vars['--oro-texto'], '#1D1D1F')
  assert.equal(t.vars['--oro'], '#FFE680') // still fine as a fill
})

test('the greys are derived from the two colours and keep the text readable', () => {
  for (const q of ['?embed', '?embed&theme=light', '?embed&bg=0A0A0A&text=FFFFFF', '?embed&bg=F5F0E6&text=2B2B2B']) {
    const v = embedTheme(q).vars
    assert.ok(ratio(v['--tenue'], v['--panel']) >= 4.5, `${q}: muted text on the panel`)
    assert.ok(ratio(v['--texto'], v['--panel']) >= 7, `${q}: text on the panel`)
  }
})

test('bg=transparent keeps a base to derive greys from but paints nothing', () => {
  const t = embedTheme('?embed&bg=transparent&theme=dark')
  assert.equal(t.transparent, true)
  assert.equal(t.vars['--fondo'], '#111113')
})

test('radius is an integer from 0 to 24', () => {
  assert.equal(embedTheme('?embed&radius=0').radius, 0)
  assert.equal(embedTheme('?embed&radius=24').radius, 24)
  for (const bad of ['25', '-1', '9.5x', '9px;x', 'abc', '1e3', '']) assert.equal(embedTheme(`?embed&radius=${bad}`).radius, 14, bad)
})

test('font is a key of our own list, never a name from the address', () => {
  assert.equal(embedTheme('?embed&font=serif').vars.fontFamily, EMBED_FONTS.serif)
  assert.equal(embedTheme('?embed&font=Comic Sans; x:y').font, 'inter')
  assert.equal(embedTheme('?embed&font=constructor').font, 'inter')
  assert.equal(embedTheme('?embed&font=__proto__').font, 'inter')
})

test('every value that reaches CSS is a hex colour, a px number or one of our fonts', () => {
  const nasty = '?embed&bg=1;}body{display:none&text=url(x)&accent=red&radius=9px;x&font=a;b&theme=<b>'
  const v = embedTheme(nasty).vars
  for (const [k, val] of Object.entries(v)) {
    if (k === 'fontFamily') assert.ok(Object.values(EMBED_FONTS).includes(val))
    else assert.match(val, /^(#[0-9A-F]{6}|\d+px)$/, k)
  }
})

test('mix blends two colours', () => {
  assert.equal(mix('#000000', '#FFFFFF', 0.5), '#808080')
  assert.equal(mix('#102030', '#FFFFFF', 0), '#102030')
  assert.equal(mix('#102030', '#FFFFFF', 1), '#FFFFFF')
})

test('rates: defaults, valid values and clamping', () => {
  const d = embedRates('?embed')
  assert.equal(d.currency, 'EUR')
  assert.equal(d.taxPercent, 0)
  const r = embedRates('?embed&cur=cad&pg=0.09&ph=3&pl=40&tax=13&taxname=HST')
  assert.deepEqual(r, { currency: 'CAD', perGram: 0.09, perMachineHour: 3, perLabourHour: 40, taxPercent: 13, taxName: 'HST' })
})

test('rates: nonsense falls back to the default instead of NaN or negative prices', () => {
  const r = embedRates('?embed&cur=DOLLARS&pg=-1&ph=abc&pl=1e9&tax=150&taxname=A very long tax name indeed')
  assert.equal(r.currency, 'EUR')
  assert.equal(r.perGram, 0.04)
  assert.equal(r.perMachineHour, 2.5)
  assert.equal(r.perLabourHour, 25)
  assert.equal(r.taxPercent, 0)
  assert.equal(r.taxName.length, 12)
})

test('quote: lines, subtotal, tax and total add up to the cent', () => {
  const rates = { perGram: 0.09, perMachineHour: 3, perLabourHour: 40, taxPercent: 13 }
  const q = embedQuote({ grams: 120, hours: 5.5, labourMinutes: 15 }, rates)
  assert.equal(q.filament, 1080) // 120 g x 0.09
  assert.equal(q.machine, 1650) // 5.5 h x 3
  assert.equal(q.labour, 1000) // 15 min = 0.25 h x 40
  assert.equal(q.subtotal, q.filament + q.machine + q.labour)
  assert.equal(q.subtotal, 3730)
  assert.equal(q.tax, 485) // 3730 x 13 % = 484.9 cents -> 485
  assert.equal(q.total, 4215)
})

test('quote: the subtotal is the sum of the ROUNDED lines', () => {
  // 3 lines of 0.333 g x 0.01... each rounds to 0 or 1 cent; the sum must match what is shown.
  const rates = { perGram: 0.0033, perMachineHour: 0.0033, perLabourHour: 0.2, taxPercent: 0 }
  const q = embedQuote({ grams: 100, hours: 100, labourMinutes: 100 }, rates)
  assert.equal(q.subtotal, q.filament + q.machine + q.labour)
})

test('quote: empty or broken inputs give zero, never NaN', () => {
  const rates = embedRates('?embed&tax=13')
  for (const input of [{}, { grams: NaN, hours: -3, labourMinutes: Infinity }, { grams: null }]) {
    const q = embedQuote(input, rates)
    assert.deepEqual(Object.values(q), [0, 0, 0, 0, 0, 0])
  }
})
