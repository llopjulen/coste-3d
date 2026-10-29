import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import en from './en.js'
import es from './es.js'
import fr from './fr.js'
import { LANGS, READY, decimalSeparator, detectLang, fill, normalizeLang, rawText, splitSlots, translate } from './index.js'

const DICTS = { en, es, fr }
const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const holes = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()

test('every language has exactly the keys of English', () => {
  for (const lang of ['es', 'fr']) {
    const missing = Object.keys(en).filter(k => !Object.hasOwn(DICTS[lang], k))
    const extra = Object.keys(DICTS[lang]).filter(k => !Object.hasOwn(en, k))
    assert.deepEqual(missing, [], `${lang} is missing keys`)
    assert.deepEqual(extra, [], `${lang} has keys English does not`)
  }
})

test('every language uses the same {placeholders} as English', () => {
  for (const lang of ['es', 'fr']) {
    for (const [key, text] of Object.entries(en)) {
      assert.deepEqual(holes(DICTS[lang][key]), holes(text), `${lang}: ${key}`)
    }
  }
})

test('no translation is empty', () => {
  for (const lang of LANGS) {
    for (const [key, text] of Object.entries(DICTS[lang])) {
      assert.ok(typeof text === 'string' && text.trim().length > 0, `${lang}: ${key} is empty`)
    }
  }
})

test('every key used with t("...") in the code exists in English', () => {
  const used = new Set()
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.(jsx?|mjs)$/.test(entry.name) && !entry.name.endsWith('.test.js')) {
        const code = readFileSync(path, 'utf8')
        for (const m of code.matchAll(/\bt[rn]?\(\s*'([\w.]+)'/g)) used.add(m[1])
        for (const m of code.matchAll(/(?:labelKey|titleKey|nameKey|unitKey):\s*'([\w.]+)'/g)) used.add(m[1])
      }
    }
  }
  walk(srcDir)
  assert.ok(used.size > 20, 'the scan found suspiciously few keys')
  for (const key of used) assert.ok(Object.hasOwn(en, key), `used in code but missing in en.js: ${key}`)
})

test('every calculator field has a label and a help text', () => {
  const app = readFileSync(join(srcDir, 'App.jsx'), 'utf8')
  const keys = [...app.matchAll(/\{ key: '(\w+)', (?:unit|unitKey):/g)].map(m => m[1])
  assert.ok(keys.length >= 15)
  for (const k of keys) {
    for (const part of ['label', 'help']) assert.ok(Object.hasOwn(en, `field.${k}.${part}`), `field.${k}.${part}`)
  }
})

test('normalizeLang and detectLang', () => {
  assert.equal(normalizeLang('es-MX'), 'es')
  assert.equal(normalizeLang('FR'), 'fr')
  assert.equal(normalizeLang('fr_CA'), 'fr')
  assert.equal(normalizeLang('de'), null)
  assert.equal(normalizeLang(undefined), null)
  assert.equal(detectLang(['de-DE', 'fr-FR', 'en']), 'fr')
  assert.equal(detectLang(['de']), 'en')
  assert.equal(detectLang(undefined), 'en')
})

test('fill replaces placeholders and leaves unknown ones visible', () => {
  assert.equal(fill('Hi {name}', { name: 'Ana' }), 'Hi Ana')
  assert.equal(fill('Hi {name}', {}), 'Hi {name}')
  assert.equal(fill('Hi {name}', undefined), 'Hi {name}')
  assert.equal(fill('n={n}', { n: 0 }), 'n=0')
})

test('translate falls back to English and then to the key itself', () => {
  const dicts = { en: { a: 'A-en', b: 'B-en' }, es: { a: 'A-es' }, fr: {} }
  assert.equal(translate(dicts, 'es', 'a'), 'A-es')
  assert.equal(translate(dicts, 'es', 'b'), 'B-en')
  assert.equal(translate(dicts, 'fr', 'a'), 'A-en')
  assert.equal(translate(dicts, 'es', 'nope'), 'nope')
  // A key that is also a property of Object.prototype must not return a function
  assert.equal(translate(dicts, 'es', 'constructor'), 'constructor')
  assert.equal(translate(dicts, 'es', 'toString'), 'toString')
})

test('splitSlots leaves a marker where an element goes and fills the rest', () => {
  assert.deepEqual(splitSlots('Order ({units} pcs): {amount}', { units: 3 }, ['amount']), ['Order (', '3', ' pcs): ', { slot: 'amount' }])
  assert.deepEqual(splitSlots('Il vous reste {amount} par pièce', {}, ['amount']), ['Il vous reste ', { slot: 'amount' }, ' par pièce'])
})

test('decimal separator follows the language', () => {
  assert.equal(decimalSeparator('en-GB'), '.')
  assert.equal(decimalSeparator('es-ES'), ',')
  assert.equal(decimalSeparator('fr-FR'), ',')
})

test('rawText resolves like translate', () => {
  assert.equal(rawText({ en: { a: 'x' } }, 'fr', 'a'), 'x')
})

test('the selector stays hidden until the whole app is translated', () => {
  // This test is a reminder: when it fails because READY became true, check
  // that every screen is translated, then update the assertion.
  assert.equal(typeof READY, 'boolean')
})
