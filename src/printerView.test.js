/* Tests for printerView.js. Run them with:  npm test */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONNECTION_KEYS, STATE_KEYS, badgeText, detailLine, fmtMinutes, percent, tone } from './printerView.js'
import { translate } from './i18n/index.js'
import en from './i18n/en.js'
import es from './i18n/es.js'
import fr from './i18n/fr.js'

// A real translator, like the one the screen gets from useI18n (English here).
const DICTS = { en, es, fr }
const t = (key, vars) => translate(DICTS, 'en', key, vars)
const tIn = lang => (key, vars) => translate(DICTS, lang, key, vars)

test('fmtMinutes: hours and minutes the way people say them', () => {
  assert.equal(fmtMinutes(45, t), '45 min')
  assert.equal(fmtMinutes(75, t), '1 h 15 min')
  assert.equal(fmtMinutes(120, t), '2 h')
  assert.equal(fmtMinutes(0, t), 'less than a minute')
  assert.equal(fmtMinutes(null, t), null)
  assert.equal(fmtMinutes(-5, t), null)
})

test('percent: rounded, clamped, and null when unknown', () => {
  assert.equal(percent(0.423), 42)
  assert.equal(percent(1.4), 100)
  assert.equal(percent(null), null)
  assert.equal(percent(Number.NaN), null)
})

test('tone: gold while working, red on failure, grey when we cannot tell', () => {
  assert.equal(tone({ connection: 'online', state: 'printing' }), 'busy')
  assert.equal(tone({ connection: 'online', state: 'idle' }), 'ok')
  assert.equal(tone({ connection: 'online', state: 'failed' }), 'bad')
  assert.equal(tone({ connection: 'online', state: 'cancelled' }), 'ok') // the person's choice, not an alarm
  assert.equal(tone({ connection: 'auth-error', state: 'unknown' }), 'bad')
  assert.equal(tone({ connection: 'offline', state: 'printing' }), 'muted')
})

test('detailLine: only the facts that are known', () => {
  assert.equal(detailLine({ job: { layer: 120, totalLayers: 300 }, temps: { nozzle: 219.6, bed: 60 } }, t), 'Layer 120 of 300 · Nozzle 220 °C · Bed 60 °C')
  assert.equal(detailLine({ job: null, temps: { nozzle: 25, bed: null } }, t), 'Nozzle 25 °C')
  assert.equal(detailLine({ job: { layer: 0, totalLayers: 0 }, temps: {} }, t), '')
})

test('badgeText: the state when online, the connection otherwise, never something from the prototype', () => {
  assert.equal(badgeText({ connection: 'online', state: 'printing' }, t), 'Printing')
  assert.equal(badgeText({ connection: 'online', state: 'from-the-future' }, t), '—')
  assert.equal(badgeText({ connection: 'online', state: 'constructor' }, t), '—')
  assert.equal(badgeText({ connection: 'auth-error', state: 'unknown' }, t), 'Access code refused')
  assert.equal(badgeText({ connection: 'something-new', state: 'unknown' }, t), 'something-new')
})

test('every state and connection has a text in every language', () => {
  for (const lang of ['en', 'es', 'fr']) {
    for (const key of [...Object.values(STATE_KEYS), ...Object.values(CONNECTION_KEYS)]) {
      assert.ok(Object.hasOwn(DICTS[lang], key), `${lang}: ${key}`)
    }
  }
})

test('the same functions speak Spanish and French', () => {
  assert.equal(fmtMinutes(0, tIn('es')), 'menos de un minuto')
  assert.equal(fmtMinutes(75, tIn('fr')), '1 h 15 min')
  assert.equal(detailLine({ job: { layer: 1, totalLayers: 2 }, temps: { bed: 60 } }, tIn('es')), 'Capa 1 de 2 · Cama 60 °C')
  assert.equal(badgeText({ connection: 'online', state: 'printing' }, tIn('fr')), 'Impression')
})
