/* Tests for scripts/prerender.js and the path <-> language helpers.
   They read the real index.html (the template), so editing it in a way that
   breaks a pattern fails here and not in production. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { escapeHtml, hreflangLinks, pageFor, sitemapXml, urlFor } from './prerender.js'
import { LANGS, langFromPath, pathForLang } from '../src/i18n/index.js'

const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8')

test('langFromPath: only the exact language prefixes', () => {
  assert.equal(langFromPath('/es/'), 'es')
  assert.equal(langFromPath('/es'), 'es')
  assert.equal(langFromPath('/fr/index.html'), 'fr')
  assert.equal(langFromPath('/'), null)
  assert.equal(langFromPath('/en/'), null)
  assert.equal(langFromPath('/espanol/'), null)
  assert.equal(langFromPath('/es/algo'), null)
  assert.equal(langFromPath(undefined), null)
})

test('pathForLang and langFromPath are inverse', () => {
  for (const lang of LANGS) {
    const back = langFromPath(pathForLang(lang))
    assert.equal(back ?? 'en', lang)
  }
  assert.equal(pathForLang('xx'), '/')
})

test('every language page has its own title, canonical, lang and h1', () => {
  const seen = new Set()
  for (const lang of LANGS) {
    const html = pageFor(template, lang)
    assert.match(html, new RegExp(`<html lang="${lang}">`))
    assert.ok(html.includes(`<link rel="canonical" href="${urlFor(lang)}" />`), lang)
    assert.ok(html.includes(`<meta property="og:url" content="${urlFor(lang)}"`), lang)
    assert.match(html, new RegExp(`"inLanguage": "${lang}"`))
    const title = html.match(/<title>([^<]*)<\/title>/)[1]
    assert.ok(!seen.has(title), `${lang} repeats a title`)
    seen.add(title)
  }
})

test('every page lists all the languages plus x-default, itself included', () => {
  for (const lang of LANGS) {
    const html = pageFor(template, lang)
    for (const l of LANGS) assert.ok(html.includes(`hreflang="${l}" href="${urlFor(l)}"`), `${lang} page lacks ${l}`)
    assert.ok(html.includes(`hreflang="x-default" href="${urlFor('en')}"`))
  }
})

test('the English page keeps the original texts', () => {
  const html = pageFor(template, 'en')
  assert.ok(html.includes('<title>3D Print Cost Calculator &amp; Quote Maker · layercents</title>'))
  assert.ok(html.includes('<h1>What a printed part actually costs you</h1>'))
})

test('the structured data stays valid JSON in every language', () => {
  for (const lang of LANGS) {
    const html = pageFor(template, lang)
    const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]
    const data = JSON.parse(json)
    assert.equal(data.url, urlFor(lang))
    assert.equal(data.inLanguage, lang)
  }
})

test('a text with quotes or & cannot break out of an attribute', () => {
  assert.equal(escapeHtml('a "b" & <c>'), 'a &quot;b&quot; &amp; &lt;c&gt;')
})

test('running it twice on the same page is refused instead of duplicating links', () => {
  assert.throws(() => pageFor(pageFor(template, 'es'), 'fr'), /already has hreflang/)
})

test('a pattern that stops matching fails the build', () => {
  assert.throws(() => pageFor(template.replace('<title>', '<title data-x="1">'), 'es'), /title/)
})

test('sitemap: one url per language, each with the alternates', () => {
  const xml = sitemapXml('2026-11-02')
  assert.equal((xml.match(/<url>/g) ?? []).length, LANGS.length)
  for (const lang of LANGS) assert.ok(xml.includes(`<loc>${urlFor(lang)}</loc>`))
  assert.equal((xml.match(/hreflang="x-default"/g) ?? []).length, LANGS.length)
  assert.ok(!sitemapXml(null).includes('lastmod'))
})

test('hreflangLinks has one line per language and x-default', () => {
  assert.equal(hreflangLinks().split('\n').length, LANGS.length + 1)
})
