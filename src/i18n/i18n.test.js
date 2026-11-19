import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import en from './en.js'
import es from './es.js'
import fr from './fr.js'
import { LANGS, READY, decimalSeparator, detectLang, fill, normalizeLang, rawText, splitSlots, translate, translatePlural } from './index.js'
import { fmtDay, fmtGrams, fmtLongDay, fmtMoney, fmtMonthShort, fmtMonthYear, fmtNumber, moneyParts, numberToText, parseNumber } from './format.js'
import { translatorFor } from './dicts.js'

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
        for (const m of code.matchAll(/\bt[rnp]?\(\s*'([\w.]+)'/g)) used.add(m[1])
        // Keys kept in lookup tables (RESULT_KEYS, STATE_KEYS…) are not written as t('…'):
        // any 'printers.…' literal is a key and must exist.
        for (const m of code.matchAll(/'(printers\.[\w.-]+)'/g)) used.add(m[1])
        for (const m of code.matchAll(/(?:labelKey|titleKey|nameKey|unitKey):\s*'([\w.]+)'/g)) used.add(m[1])
      }
    }
  }
  walk(srcDir)
  assert.ok(used.size > 20, 'the scan found suspiciously few keys')
  // A plural key (tp) is stored as key.one / key.other, so the bare key is not in the file.
  for (const key of used) assert.ok(Object.hasOwn(en, key) || Object.hasOwn(en, `${key}.other`), `used in code but missing in en.js: ${key}`)
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

test('the language selector is on, and with no saved choice the browser language decides', () => {
  assert.equal(READY, true)
  assert.equal(detectLang(['fr-CA', 'en']), 'fr')
  assert.equal(detectLang(['de', 'es-MX']), 'es')
  assert.equal(detectLang(['de']), 'en')
})

test('every plural has its "other" form (the one every language falls back to)', () => {
  for (const lang of LANGS) {
    for (const key of Object.keys(DICTS[lang]).filter(k => k.endsWith('.one'))) {
      assert.ok(Object.hasOwn(DICTS[lang], key.replace(/\.one$/, '.other')), `${lang}: ${key} has no .other`)
    }
  }
})

test('plurals follow each language\'s rules', () => {
  assert.equal(translatePlural(DICTS, 'en', 'count.quotes', 1), '1 quote')
  assert.equal(translatePlural(DICTS, 'en', 'count.quotes', 0), '0 quotes')
  assert.equal(translatePlural(DICTS, 'es', 'count.quotes', 1), '1 presupuesto')
  assert.equal(translatePlural(DICTS, 'es', 'count.quotes', 5), '5 presupuestos')
  // French: zero counts as singular
  assert.equal(translatePlural(DICTS, 'fr', 'backup.reminder.none', 1).startsWith('Aucune sauvegarde'), true)
  assert.equal(translatePlural(DICTS, 'en', 'backup.reminder.none', 3), 'No backup: 3 quotes, only in this browser.')
  // A category the language has but the file doesn't write (es "many", for millions) falls back to other
  assert.equal(translatePlural(DICTS, 'es', 'count.quotes', 1_000_000), '1000000 presupuestos')
})

test('dates and numbers use the language\'s conventions', () => {
  const d = new Date(2026, 9, 22, 7, 15)
  assert.equal(fmtDay('en-GB', d), '22 Oct 2026')
  assert.match(fmtDay('es-ES', d), /^22 oct\.? 2026$/)
  assert.match(fmtDay('fr-FR', d), /^22 oct\.? 2026$/)
  assert.equal(fmtMonthYear('en-GB', d), 'October 2026')
  assert.match(fmtMonthYear('es-ES', d), /^Octubre/)
  assert.equal(fmtNumber('en-GB', 3.5), '3.5')
  assert.equal(fmtNumber('es-ES', 3.5), '3,5')
  assert.equal(fmtGrams('fr-FR', 45), '45,0 g')
  assert.equal(fmtGrams('en-GB', 45), '45.0 g')
})

// Intl puts a no-break space (U+00A0, or the narrow U+202F in French) between
// the number and the symbol: normalise them to compare with a plain string.
const plain = text => text.replace(/[\u00a0\u202f]/g, ' ')
test('fmtMoney: the symbol where each language puts it', () => {
  assert.equal(fmtMoney('en-GB', 12.5, 'EUR'), '€12.50')
  assert.equal(plain(fmtMoney('es-ES', 12.5, 'EUR')), '12,50 €')
  assert.equal(plain(fmtMoney('fr-FR', 1234.567, 'USD')), '1 234,57 $')
  assert.equal(fmtMoney('en-GB', 0, 'EUR'), '€0.00')
  assert.equal(fmtMoney('en-GB', NaN, 'EUR'), '€0.00')
})

test('moneyParts: the price in pieces, symbol before or after', () => {
  assert.deepEqual(moneyParts('en-GB', 7.94, 'EUR'), { prefix: '€', whole: '7', decimal: '.', cents: '94', suffix: '' })
  assert.deepEqual(moneyParts('es-ES', 7.94, 'EUR'), { prefix: '', whole: '7', decimal: ',', cents: '94', suffix: '€' })
  // The yen has no cents.
  assert.equal(moneyParts('en-GB', 1200, 'JPY').cents, '')
})

test('parseNumber takes a comma or a point; numberToText writes the language\'s', () => {
  assert.equal(parseNumber('0,8'), 0.8)
  assert.equal(parseNumber('0.8'), 0.8)
  assert.equal(parseNumber(''), 0)
  assert.equal(parseNumber('3,'), 3)
  assert.equal(parseNumber('abc'), null)
  assert.equal(parseNumber('1,2,3'), null)
  assert.equal(numberToText(0.8, ','), '0,8')
  assert.equal(numberToText(45, ','), '45')
})

test('document dates: long day and short month follow the language', () => {
  const d = new Date(2026, 9, 5)
  assert.equal(fmtLongDay('en-GB', d), '5 October 2026')
  assert.equal(fmtLongDay('es-ES', d), '5 de octubre de 2026')
  assert.equal(fmtLongDay('fr-FR', d), '5 octobre 2026')
  assert.match(fmtMonthShort('es-ES', d), /^oct/)
})

test('translatorFor: a fixed-language translator, English when the code is unknown', () => {
  const es = translatorFor('es-MX')
  assert.equal(es.lang, 'es')
  assert.equal(es.locale, 'es-ES')
  assert.equal(es.t('quote.doc.title'), 'Presupuesto')
  assert.equal(es.tp('count.quotes', 2), '2 presupuestos')
  assert.equal(translatorFor('xx').t('quote.doc.title'), 'Quote')
  assert.equal(translatorFor(undefined).lang, 'en')
})
