/* Tests for quoteStyle.js. Run them with:  npm test */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ACCENTS, DEFAULT_ACCENT, inkOf, luminance, quoteStyleOf, textOn } from './quoteStyle.js'

const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }

test('a business saved before this has the classic look', () => {
  assert.deepEqual(quoteStyleOf({ name: 'Old' }), { accent: DEFAULT_ACCENT, style: 'line', font: 'sans' })
  assert.deepEqual(quoteStyleOf(null), { accent: DEFAULT_ACCENT, style: 'line', font: 'sans' })
})

test('bad values fall back instead of breaking the sheet', () => {
  assert.deepEqual(quoteStyleOf({ accent: 'red; background:url(x)', docStyle: 'neon', docFont: 'comic' }), { accent: DEFAULT_ACCENT, style: 'line', font: 'sans' })
  assert.equal(quoteStyleOf({ accent: '#1f3a5f' }).accent, '#1F3A5F')
})

test('text on the accent band is white or black, whichever reads better', () => {
  assert.equal(textOn('#1D1D1F'), '#FFFFFF')
  assert.equal(textOn('#FFE680'), '#1D1D1F')
  for (const c of ACCENTS) assert.ok(ratio(c, textOn(c)) >= 4.5, `${c} on its band text`)
})

test('every preset reads as text on white paper', () => {
  for (const c of ACCENTS) assert.ok(ratio(c, '#FFFFFF') >= 3, c)
})

test('a very light custom accent is darkened for text, until 3:1', () => {
  const ink = inkOf('#FFE680')
  assert.notEqual(ink, '#FFE680')
  assert.ok(ratio(ink, '#FFFFFF') >= 3)
  assert.equal(inkOf('#1F3A5F'), '#1F3A5F')
})
