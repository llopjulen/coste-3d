/* ==================================================================
   PRERENDER — one real HTML page per language (/, /es/, /fr/).

   Why: the app is a single-page React app, so Google receives the HTML
   of index.html (English) and only later, maybe, runs the JavaScript. To
   be found in Spanish or French, each language needs its OWN address with
   its own <title>, description and text already in the HTML, plus
   <link rel="alternate" hreflang> telling Google the three pages are the
   same page in different languages.

   How: after `vite build`, this script takes dist/index.html (English)
   as a template and writes dist/es/index.html and dist/fr/index.html with
   the texts of src/i18n/<lang>.js (keys `seo.*`). GitHub Pages serves
   /es/ from dist/es/index.html with no server code. No dependency: plain
   string replacement.

   Every replacement must match EXACTLY ONCE, otherwise the build fails:
   if someone edits index.html and a pattern stops matching, a silent
   "it didn't change" would ship a Spanish page with the English title.
   The app itself reads the language from the path (src/i18n/index.js).
================================================================== */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import en from '../src/i18n/en.js'
import es from '../src/i18n/es.js'
import fr from '../src/i18n/fr.js'
import { LANGS, pathForLang } from '../src/i18n/index.js'

export const ORIGIN = 'https://layercents.com'
const DICTS = { en, es, fr }

// Text -> safe inside HTML text and inside "double-quoted" attributes.
export const escapeHtml = s =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Absolute address of a language's page: https://layercents.com/es/
export const urlFor = lang => ORIGIN + pathForLang(lang)

/* Replaces the single match of `pattern` in `html`. A text replacement goes
   through a function, so a `$` in it is never read as a special pattern. */
function replaceOnce(html, pattern, replacement, label) {
  const found = html.match(new RegExp(pattern, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'))
  if (!found || found.length !== 1) {
    throw new Error(`prerender: "${label}" matched ${found ? found.length : 0} times in index.html (expected 1)`)
  }
  return html.replace(pattern, typeof replacement === 'function' ? replacement : () => replacement)
}

/* The <link rel="alternate" hreflang> block: every language points to every
   language, itself included (Google requires it), and x-default (the page for
   anyone whose language isn't here) is the English one. */
export function hreflangLinks() {
  const lines = LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${urlFor(l)}" />`)
  lines.push(`<link rel="alternate" hreflang="x-default" href="${urlFor('en')}" />`)
  return lines.join('\n    ')
}

/* The page of one language, made from the English template. */
export function pageFor(template, lang) {
  if (template.includes('<link rel="alternate" hreflang')) throw new Error('prerender: index.html already has hreflang; run it on a fresh `vite build`')
  const x = DICTS[lang]
  const url = urlFor(lang)
  let html = template
  html = replaceOnce(html, /<html lang="[a-z-]+">/, `<html lang="${lang}">`, 'html lang')
  html = replaceOnce(html, /<meta name="description" content="[^"]*"/, `<meta name="description" content="${escapeHtml(x['seo.description'])}"`, 'description')
  html = replaceOnce(html, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />\n    ${hreflangLinks()}`, 'canonical')
  html = replaceOnce(html, /<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${escapeHtml(x['seo.title'])}"`, 'og:title')
  html = replaceOnce(html, /<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${escapeHtml(x['seo.social'])}"`, 'og:description')
  html = replaceOnce(html, /<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${url}"`, 'og:url')
  html = replaceOnce(html, /<meta name="twitter:title" content="[^"]*"/, `<meta name="twitter:title" content="${escapeHtml(x['seo.title'])}"`, 'twitter:title')
  html = replaceOnce(html, /<meta name="twitter:description" content="[^"]*"/, `<meta name="twitter:description" content="${escapeHtml(x['seo.social'])}"`, 'twitter:description')
  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${escapeHtml(x['seo.title'])}</title>`, 'title')
  // Structured data is JSON inside <script>: JSON.stringify escapes the quotes.
  html = replaceOnce(html, /"url": "[^"]*"/, `"url": ${JSON.stringify(url)}`, 'json-ld url')
  html = replaceOnce(html, /"description": "[^"]*"/, `"description": ${JSON.stringify(x['seo.appDescription'])}`, 'json-ld description')
  html = replaceOnce(html, /"inLanguage": "[^"]*"/, `"inLanguage": "${lang}"`, 'json-ld inLanguage')
  // The text a crawler (and a visitor without JavaScript) sees inside #root.
  html = replaceOnce(
    html,
    /<h1>[^<]*<\/h1>(\s*)<p>[^<]*<\/p>/,
    (_whole, gap) => `<h1>${escapeHtml(x['seo.h1'])}</h1>${gap}<p>${escapeHtml(x['seo.intro'])}</p>`,
    'h1 and intro',
  )
  html = replaceOnce(html, /<noscript><p>[^<]*<\/p><\/noscript>/, `<noscript><p>${escapeHtml(x['seo.noscript'])}</p></noscript>`, 'noscript')
  return html
}

/* sitemap.xml with the three addresses and their alternates (the sitemap
   version of hreflang). `lastmod` is the date of the last commit that touched
   the site, or nothing: a made-up date is worse than none. */
export function sitemapXml(lastmod) {
  const alt = LANGS.map(l => `    <xhtml:link rel="alternate" hreflang="${l}" href="${urlFor(l)}" />`)
    .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${urlFor('en')}" />`)
    .join('\n')
  const entries = LANGS.map(l => `  <url>
    <loc>${urlFor(l)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
${alt}
  </url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries}
</urlset>
`
}

function lastCommitDate() {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs', '--', 'src', 'index.html'], { encoding: 'utf8' }).trim() || null
  } catch {
    return null // no git (a zip of the project): the sitemap goes without dates
  }
}

function main() {
  const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
  const template = readFileSync(join(dist, 'index.html'), 'utf8')
  for (const lang of LANGS) {
    const dir = lang === 'en' ? dist : join(dist, lang)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.html'), pageFor(template, lang))
  }
  writeFileSync(join(dist, 'sitemap.xml'), sitemapXml(lastCommitDate()))
  console.log(`prerender: ${LANGS.map(l => pathForLang(l)).join(' ')} + sitemap.xml`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
