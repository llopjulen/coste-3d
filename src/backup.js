/* ==================================================================
   BACKUP & RESTORE
   One JSON file with everything layercents keeps in this browser:
   saved quotes, business details (logo included), the quote counter
   and "Your setup" (printer, electricity, hourly rate...). The Excel export is a report for people to read; this file
   is the format that round-trips, so it can be restored on another
   computer, in another browser or after clearing site data.

   Two layers, on purpose:
   - Pure functions (build, parse, merge, plan, status): no DOM and no
     localStorage, so they can be tested in Node without a browser.
   - Storage functions at the bottom: the only code here that touches
     localStorage. They take `storage` as a parameter so tests can pass
     a fake one.
================================================================== */

// Bump ONLY for breaking changes (a key renamed or removed, a value that
// changes meaning). Adding a new optional key to `data` needs no bump:
// parseBackup ignores keys it doesn't know, so older versions still read
// newer files that only added things.
export const BACKUP_SCHEMA_VERSION = 1

// Tags that identify our file. Any other JSON (an export from another
// app, a random config file) is rejected before its contents are trusted.
const APP_ID = 'layercents'
const KIND = 'backup'

// The localStorage keys the app owns. They must match App.jsx
// ('savedQuotes') and CustomerQuote.jsx ('business', 'quoteCounter'):
// a key renamed there and not here would quietly drop out of backups.
export const KEYS = {
  quotes: 'savedQuotes',
  business: 'business',
  counter: 'quoteCounter',
  // "Your setup" in the calculator: the numbers a person types once
  // (printer price, power, electricity, hourly rate, fee, margin).
  // A map of field name -> number. It came after the first backup format
  // and is optional in the file, so it needed no schemaVersion bump.
  setup: 'setup',
  // Per-device bookkeeping, deliberately NOT inside the backup: it says
  // when THIS browser was last backed up, which is meaningless elsewhere.
  lastBackup: 'lastBackupAt',
  // Per-device too, also left out of backups: whether this browser shows
  // the Printers tab (agent.js). Another computer may not run the agent.
  agentEnabled: 'agentEnabled',
}

// A real backup weighs a few hundred KB (the logo is the biggest thing in
// it), and localStorage only holds about 5 MB per site. Anything above
// 10 MB is the wrong file, so it's refused before being read into memory.
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024

// Remind at most once a week: often enough that a wiped browser costs
// days of quotes, not months; rare enough that it doesn't become noise.
export const REMIND_AFTER_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

// Shown when the file is JSON but not ours, or not JSON at all. It says
// what to pick instead, because "invalid file" alone doesn't help.
const NOT_A_BACKUP = 'This file isn’t a layercents backup. Choose the .json file you got from “Download backup”.'

/* Errors whose message is written for the person and shown as-is.
   Anything else thrown from here is a bug: the caller logs it. */
export class BackupError extends Error {
  constructor(message) {
    super(message)
    // Keeps the class name in console output and stack traces.
    this.name = 'BackupError'
  }
}

/* A failed write to localStorage, plus whether the rollback worked, so
   the screen can say "nothing changed" only when that's true. */
export class StorageWriteError extends Error {
  constructor(cause, rolledBack) {
    // `cause` is the original DOMException (QuotaExceededError, SecurityError).
    super(cause?.message ?? 'Storage write failed', { cause })
    this.name = 'StorageWriteError'
    // The DOMException name decides which message the person sees.
    this.reason = cause?.name ?? 'Error'
    this.rolledBack = rolledBack
  }
}

/* ------------------------------------------------------------------
   Type guards
------------------------------------------------------------------ */

// JSON.parse only produces plain objects, arrays and primitives;
// typeof says 'object' for arrays and null too, so both are excluded.
const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)

// typeof NaN is 'number', and JSON.stringify(NaN) writes null, so every
// number read from a file is checked to be a real, finite one.
const isFiniteNumber = v => typeof v === 'number' && Number.isFinite(v)

// An ISO date string the Date parser understands (createdAt, exportedAt).
const isDateString = v => typeof v === 'string' && Number.isFinite(Date.parse(v))

/* ------------------------------------------------------------------
   Validation: one function per stored value.
   Rule for all of them: required fields missing -> the value is
   unusable (null). Optional fields of the wrong type are dropped,
   so one bad field doesn't throw away the whole quote. Unknown
   fields are kept: a backup's first job is to round-trip without
   loss, and a field this version doesn't know may belong to a newer one.
------------------------------------------------------------------ */

// Keeps only the entries holding a finite number. The calculator does
// arithmetic with these, and a string "20" would turn a + b into "2045".
function numericRecord(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => isFiniteNumber(value)))
}

/* One saved quote -> a clean copy, or null if History couldn't use it.
   The shape mirrors saveQuote in App.jsx: a new field added there must
   be checked here too, or its type will never be validated on restore. */
export function sanitizeQuote(raw) {
  // Anything that isn't an object can't be a quote.
  if (!isPlainObject(raw)) return null
  // The id is the React key, the handle for delete and, for old quotes,
  // their date (it's a Date.now() timestamp): a positive integer or nothing.
  if (!Number.isSafeInteger(raw.id) || raw.id <= 0) return null
  // History draws every row from these two; without them there's no quote.
  if (!isFiniteNumber(raw.cost) || !isFiniteNumber(raw.price)) return null

  // Shallow copy: the checks below delete keys, never touch the input.
  const q = { ...raw }
  // createdAt must be a parseable date, or History would print "Invalid Date".
  if (q.createdAt !== undefined && !isDateString(q.createdAt)) delete q.createdAt
  // Text fields are rendered as text: anything else is dropped.
  for (const key of ['date', 'name', 'client']) {
    if (q[key] !== undefined && typeof q[key] !== 'string') delete q[key]
  }
  // inputs feed the calculator on "Load" and parts feed the Excel columns:
  // both must be maps of numbers.
  for (const key of ['inputs', 'parts']) {
    if (q[key] === undefined) continue
    if (isPlainObject(q[key])) q[key] = numericRecord(q[key])
    else delete q[key]
  }
  // units is a part count: a whole number, at least 1 (calculate() floors it the same way).
  if (q.units !== undefined && !(Number.isSafeInteger(q.units) && q.units >= 1)) delete q.units
  // orderTotal is optional: History falls back to price when it's missing.
  if (q.orderTotal !== undefined && !isFiniteNumber(q.orderTotal)) delete q.orderTotal
  return q
}

// Only raster data: URLs, the same kind CustomerQuote creates with
// canvas.toDataURL. A file can't point the logo at a remote URL, which
// would make every opened quote call a third-party server.
const LOGO_RE = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/

/* Business details (CustomerQuote's EMPTY_BUSINESS shape) -> clean copy or null. */
export function sanitizeBusiness(raw) {
  // CustomerQuote spreads this over its defaults, so it must be an object.
  if (!isPlainObject(raw)) return null
  // Same rule as quotes: copy, then drop what has the wrong type.
  const b = { ...raw }
  // Free text typed by the person, printed on the quote as text.
  for (const key of ['name', 'contact', 'notes']) {
    if (b[key] !== undefined && typeof b[key] !== 'string') delete b[key]
  }
  // '' is how CustomerQuote stores "no logo", so it's valid too.
  if (b.logo !== undefined && b.logo !== '' && !(typeof b.logo === 'string' && LOGO_RE.test(b.logo))) delete b.logo
  // Tax percentage and validity in days: numbers, never negative (the form clamps them the same way).
  for (const key of ['tax', 'validDays']) {
    if (b[key] !== undefined && !(isFiniteNumber(b[key]) && b[key] >= 0)) delete b[key]
  }
  return b
}

// Next quote number: CustomerQuote pads it to "2026-007", so it has to
// be a positive whole number.
export const sanitizeCounter = v => (Number.isSafeInteger(v) && v >= 1 ? v : null)

/* "Your setup" -> a clean map of numbers, or null if nothing usable is left.
   Only the TYPE is checked here (a finite number, never negative: no cost,
   percentage or duration in the form makes sense below 0). WHICH fields
   count as setup is App.jsx's decision, so this file keeps no second list
   that could drift from the form: App ignores names it doesn't know. */
export function sanitizeSetup(raw) {
  if (!isPlainObject(raw)) return null
  const clean = Object.fromEntries(Object.entries(numericRecord(raw)).filter(([, v]) => v >= 0))
  return Object.keys(clean).length > 0 ? clean : null
}

/* ------------------------------------------------------------------
   Build and parse
------------------------------------------------------------------ */

/* The backup object. `exportedAt` lets the restore screen (and the
   person, opening the file) tell two backups apart. */
export function buildBackup({ quotes, business, counter, setup, now = new Date() }) {
  return {
    app: APP_ID,
    kind: KIND,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    // `data` keeps the localStorage key names, so a person reading the
    // file can map each part to what the app stores.
    data: {
      savedQuotes: quotes,
      business: business ?? null,
      quoteCounter: counter ?? null,
      setup: setup ?? null,
    },
  }
}

/* MIGRATIONS[n] turns a version-n backup into version n+1. Empty while
   v1 is the only format. For a breaking change: bump
   BACKUP_SCHEMA_VERSION and add the step here, so every file anyone has
   ever downloaded still restores. Released steps are never edited. */
const MIGRATIONS = {}

function migrate(backup) {
  // Walk the chain one version at a time: v1 -> v2 -> v3 ...
  let current = backup
  while (current.schemaVersion < BACKUP_SCHEMA_VERSION) {
    const step = MIGRATIONS[current.schemaVersion]
    // A gap in the chain is a bug in this file, not in the person's backup,
    // so it's a plain Error (logged), not a BackupError.
    if (!step) throw new Error(`No migration from backup version ${current.schemaVersion}`)
    current = step(current)
  }
  return current
}

/* Text of a backup file -> what it would restore. Throws BackupError
   when the file can't be used. Pure: it never touches storage, because
   the person sees a summary first and only then decides. */
export function parseBackup(text) {
  // Truncated downloads and non-JSON files both fail right here.
  let raw
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError(NOT_A_BACKUP)
  }
  // Our tags, or it isn't our file: nothing else in it is looked at.
  if (!isPlainObject(raw) || raw.app !== APP_ID || raw.kind !== KIND) throw new BackupError(NOT_A_BACKUP)
  // Versions start at 1; anything else means a hand-made or damaged file.
  if (!Number.isSafeInteger(raw.schemaVersion) || raw.schemaVersion < 1) throw new BackupError(NOT_A_BACKUP)
  // A newer format may give a field a meaning this code doesn't know.
  // Guessing could restore wrong numbers, so ask for the newer app instead.
  if (raw.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new BackupError('This backup was made with a newer version of layercents. Reload this page to get the latest version, then try again.')
  }

  // Older files are upgraded to the current shape before being read.
  const backup = migrate(raw)
  // The quote list is the one part every backup must have.
  const data = isPlainObject(backup.data) ? backup.data : null
  if (!data || !Array.isArray(data.savedQuotes)) throw new BackupError(NOT_A_BACKUP)

  // Damaged quotes are skipped and counted, so the summary can say how
  // many, instead of one bad entry blocking the rest of the restore.
  const checked = data.savedQuotes.map(sanitizeQuote)
  const valid = checked.filter(Boolean)
  // Merging into an empty list applies the same duplicate rules to ids
  // repeated inside the file as to ids already in this browser.
  const { quotes } = mergeQuotes([], valid)

  return {
    // null when missing or unreadable: the summary then just leaves the date out.
    exportedAt: isDateString(backup.exportedAt) ? backup.exportedAt : null,
    quotes,
    skipped: checked.length - valid.length,
    // == null covers both a missing key and an explicit null.
    business: data.business == null ? null : sanitizeBusiness(data.business),
    counter: data.quoteCounter == null ? null : sanitizeCounter(data.quoteCounter),
    // Files made before "Your setup" existed simply don't have the key: null.
    setup: data.setup == null ? null : sanitizeSetup(data.setup),
  }
}

/* ------------------------------------------------------------------
   Merge and plan
------------------------------------------------------------------ */

// Key order doesn't change what a quote is, and JSON.stringify keeps
// insertion order, so equality is checked on a form with sorted keys.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
  }
  // Primitives: JSON.stringify gives a stable, quoted form.
  return JSON.stringify(value)
}

/* Union of two quote lists by id.
   - Same id, same content: the same quote (backed up from here), kept once.
   - Same id, different content: two different quotes saved in the same
     millisecond on two devices. Both are kept; the incoming one moves to
     the next free id. Quotes are never edited after saving, so this is
     the only way the same id can hold different content. */
export function mergeQuotes(existing, incoming) {
  // id -> quote, for O(1) lookups; also catches repeats inside `incoming`.
  const byId = new Map(existing.map(q => [q.id, q]))
  // Existing order is kept and new quotes go at the end, like saveQuote does.
  const quotes = [...existing]
  let added = 0
  let duplicates = 0
  let renumbered = 0

  for (const q of incoming) {
    const here = byId.get(q.id)
    // New id: a quote this list doesn't have yet.
    if (!here) {
      byId.set(q.id, q)
      quotes.push(q)
      added++
      continue
    }
    // Same id and same content: already here, nothing to do.
    if (canonical(here) === canonical(q)) {
      duplicates++
      continue
    }
    // Collision: the next free millisecond keeps the ids in date order.
    let id = q.id + 1
    while (byId.has(id)) id++
    // History falls back to the id for the date, so it's pinned in
    // createdAt first: a new id must not change when the quote was made.
    const moved = { ...q, id, createdAt: q.createdAt ?? new Date(q.id).toISOString() }
    byId.set(id, moved)
    quotes.push(moved)
    added++
    renumbered++
  }
  return { quotes, added, duplicates, renumbered }
}

/* Fill in, never overwrite: what this browser already has is what the
   person last typed here. Empty text fields ('' = not set) are filled
   from the backup; tax and validity always keep this browser's value. */
function mergeBusiness(current, incoming) {
  if (!incoming) return current
  if (!current) return incoming
  // incoming first, current on top: current wins every key it has, and
  // keys only the backup knows (from a newer version) survive.
  const next = { ...incoming, ...current }
  for (const key of ['name', 'contact', 'logo', 'notes']) {
    if (!current[key] && incoming[key]) next[key] = incoming[key]
  }
  return next
}

/* Same rule as mergeBusiness: fill in, never overwrite. A field this
   browser already has is what the person last typed here. */
function mergeSetup(current, incoming) {
  if (!incoming) return current
  if (!current) return incoming
  // incoming first, current on top: current wins every key it has.
  return { ...incoming, ...current }
}

/* What a restore would do, without doing it: the next value of every
   stored key, plus the numbers for the summary.
   - merge:   union of quotes; business details and setup filled in, not
              overwritten.
   - replace: this browser ends up with exactly the file's quotes and
              business details. Setup too, unless the file has none: a
              backup made before "Your setup" existed says nothing about
              it, and wiping numbers the person typed would be a loss
              they didn't ask for.
   In BOTH modes the quote counter takes the higher of the two: quote
   numbers go out to customers, and going back would hand out the same
   number twice. */
export function planRestore(current, backup, mode) {
  // Highest counter wins; null when neither side has one.
  const counter = Math.max(current.counter ?? 0, backup.counter ?? 0) || null
  // Ids in the file, to know which of this browser's quotes aren't in it.
  const inFile = new Set(backup.quotes.map(q => q.id))
  // Quotes that exist only here: deleted by replace, kept by merge.
  const onlyHere = current.quotes.filter(q => !inFile.has(q.id)).length

  if (mode === 'replace') {
    return {
      quotes: backup.quotes,
      business: backup.business,
      setup: backup.setup ?? current.setup ?? null,
      counter,
      // After a replace, this browser holds exactly what's in the file.
      coveredByFile: true,
      stats: { mode, total: backup.quotes.length, removed: onlyHere, added: 0, duplicates: 0, renumbered: 0 },
    }
  }

  const merged = mergeQuotes(current.quotes, backup.quotes)
  return {
    quotes: merged.quotes,
    business: mergeBusiness(current.business, backup.business),
    setup: mergeSetup(current.setup ?? null, backup.setup),
    counter,
    // Only if nothing here is missing from the file does that file count
    // as a backup of this browser (e.g. restoring the same file twice).
    coveredByFile: onlyHere === 0 && merged.renumbered === 0,
    stats: { mode, total: merged.quotes.length, removed: 0, added: merged.added, duplicates: merged.duplicates, renumbered: merged.renumbered },
  }
}

/* ------------------------------------------------------------------
   Reminder
------------------------------------------------------------------ */

// When a quote was saved: createdAt, or the id (a Date.now() timestamp)
// for quotes saved before createdAt existed.
function quoteTime(q) {
  const t = Date.parse(q.createdAt)
  return Number.isFinite(t) ? t : q.id
}

/* What the reminder needs. A quote is "pending" if it was saved after
   the last backup. Due = something to lose AND (never backed up, or the
   last backup is at least REMIND_AFTER_DAYS old). */
export function backupStatus(quotes, lastBackupAt, now = Date.now()) {
  // NaN when there's no backup yet or the stored value is unreadable.
  const last = lastBackupAt ? Date.parse(lastBackupAt) : NaN
  const hasBackup = Number.isFinite(last)
  // With no backup at all, every quote is at risk.
  const pending = quotes.filter(q => !hasBackup || quoteTime(q) > last).length
  const due = pending > 0 && (!hasBackup || now - last >= REMIND_AFTER_DAYS * DAY_MS)
  return { hasBackup, last: hasBackup ? new Date(last) : null, pending, due }
}

/* ------------------------------------------------------------------
   Storage layer — the only code in this file that touches
   localStorage. `storage` defaults to the browser's; tests pass a fake.
------------------------------------------------------------------ */

// A function, not a constant: reading window.localStorage throws in
// some privacy modes, and at import time that would break the whole app.
const browserStorage = () => globalThis.localStorage

// getItem can throw when storage is blocked and JSON.parse when the value
// is damaged; either way there's nothing usable, so null.
function readJson(storage, key) {
  try {
    return JSON.parse(storage.getItem(key))
  } catch {
    return null
  }
}

/* Business details and quote counter, as CustomerQuote stored them, plus
   the calculator's saved setup. */
export function readSettings(storage = browserStorage()) {
  let counter = null
  try {
    // Number(null) is 0, which sanitizeCounter turns into null: "no counter yet".
    counter = sanitizeCounter(Number(storage.getItem(KEYS.counter)))
  } catch {
    // Blocked storage: same as having no counter.
  }
  return {
    business: sanitizeBusiness(readJson(storage, KEYS.business)),
    counter,
    setup: sanitizeSetup(readJson(storage, KEYS.setup)),
  }
}

/* True if anything besides quotes is stored, without parsing it (cheap
   enough to call while rendering). */
export function hasStoredSettings(storage = browserStorage()) {
  try {
    return [KEYS.business, KEYS.counter, KEYS.setup].some(key => storage.getItem(key) !== null)
  } catch {
    return false
  }
}

/* The saved setup as { field: number }, or null if there is none.
   `storage` is looked up INSIDE the try: merely reading
   window.localStorage throws in some privacy modes, and a default
   parameter would evaluate it outside any try/catch. */
export function readSetup(storage) {
  try {
    return sanitizeSetup(readJson(storage ?? browserStorage(), KEYS.setup))
  } catch {
    return null
  }
}

/* Remembers ONE edited setup field. Only fields the person actually edited
   are stored, merged into what's already there: a field never touched keeps
   following the app's default, and an edit never rewrites the others.
   Returns false when the value isn't storable or storage is blocked or
   full: the screen keeps working, the number just won't be remembered. */
export function saveSetupField(key, value, storage) {
  if (!isFiniteNumber(value) || value < 0) return false
  try {
    const store = storage ?? browserStorage()
    const next = { ...readSetup(store), [key]: value }
    store.setItem(KEYS.setup, JSON.stringify(next))
    return true
  } catch {
    return false
  }
}

/* "Reset to defaults": forgets the saved setup. */
export function clearSetup(storage) {
  try {
    (storage ?? browserStorage()).removeItem(KEYS.setup)
    return true
  } catch {
    return false
  }
}

/* When this browser was last backed up (ISO string), or null. */
export function readLastBackup(storage = browserStorage()) {
  try {
    const value = storage.getItem(KEYS.lastBackup)
    // A damaged value is treated as "never", which errs on the side of reminding.
    return isDateString(value) ? value : null
  } catch {
    return null
  }
}

/* Writes several keys as one unit: if any write fails (quota exceeded,
   storage blocked), every key goes back to what it was, so a restore
   never leaves quotes from one source and business details from
   another. localStorage has no transactions; this is a manual rollback.
   `entries`: key -> string to store, or null to remove the key. */
export function writeAtomically(entries, storage = browserStorage()) {
  const keys = Object.keys(entries)
  // Snapshot first. If even reading fails (blocked storage), nothing has
  // been written yet, so there's nothing to roll back.
  let before
  try {
    before = Object.fromEntries(keys.map(key => [key, storage.getItem(key)]))
  } catch (err) {
    throw new StorageWriteError(err, true)
  }
  // Removals first: they can only free space for the writes after them.
  const ordered = [...keys].sort((a, b) => Number(entries[b] === null) - Number(entries[a] === null))
  try {
    for (const key of ordered) {
      if (entries[key] === null) storage.removeItem(key)
      else storage.setItem(key, entries[key])
    }
  } catch (err) {
    // Put every key back as it was. Each one is tried on its own, so one
    // failure doesn't stop the others from being restored.
    let rolledBack = true
    for (const key of keys) {
      try {
        if (before[key] === null) storage.removeItem(key)
        else storage.setItem(key, before[key])
      } catch {
        rolledBack = false
      }
    }
    throw new StorageWriteError(err, rolledBack)
  }
}

/* Restores a parsed backup into storage. Returns the new quote list
   (for React state), the stats for the summary and, when the file now
   covers everything in this browser, the new "last backup" time.
   Business details and the counter live only in storage: CustomerQuote
   reads them every time it opens. */
export function applyRestore(backup, mode, currentQuotes, storage = browserStorage()) {
  // Quotes come from React state (what's on screen), the rest from storage.
  const plan = planRestore({ quotes: currentQuotes, ...readSettings(storage) }, backup, mode)

  // If this browser now holds nothing that isn't in the file, the file IS
  // its backup: the reminder starts counting from when it was made. The
  // newer of the two times is kept, so restoring an old file never makes
  // a recent backup look older.
  let lastBackupAt = null
  if (plan.coveredByFile && backup.exportedAt) {
    const current = readLastBackup(storage)
    lastBackupAt = current && Date.parse(current) > Date.parse(backup.exportedAt) ? current : backup.exportedAt
  }

  writeAtomically({
    [KEYS.quotes]: JSON.stringify(plan.quotes),
    // null removes the key, which is how "no business details" looks to CustomerQuote.
    [KEYS.business]: plan.business ? JSON.stringify(plan.business) : null,
    [KEYS.counter]: plan.counter ? String(plan.counter) : null,
    [KEYS.setup]: plan.setup ? JSON.stringify(plan.setup) : null,
    // Only written when it changes; otherwise the key isn't touched at all.
    ...(lastBackupAt ? { [KEYS.lastBackup]: lastBackupAt } : {}),
  }, storage)

  // `setup` goes back too: the calculator holds its numbers in React state,
  // so after a restore it has to be told what is now stored.
  return { quotes: plan.quotes, setup: plan.setup, stats: plan.stats, lastBackupAt }
}

// Two digits, for dates and times in file names.
const pad = n => String(n).padStart(2, '0')

/* layercents-backup-2026-10-22-0715.json: local date and time, so
   several backups a day don't overwrite each other and the Downloads
   folder lists them in order. */
export function backupFileName(now) {
  return `layercents-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`
}

/* Builds the file from what's on screen (quotes) and in storage
   (business, counter, setup), hands it to the browser as a download and
   records when. Returns that time as an ISO string. */
export function downloadBackup(quotes, { storage = browserStorage(), now = new Date() } = {}) {
  const { business, counter, setup } = readSettings(storage)
  const backup = buildBackup({ quotes, business, counter, setup, now })
  // Indented so anyone can open it in a text editor and see their data;
  // the extra size is irrelevant at a few hundred KB.
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = backupFileName(now)
  // Some browsers (older Firefox) ignore clicks on links that aren't in the page.
  document.body.append(link)
  link.click()
  link.remove()
  // Revoking in the same tick can cancel the download in some browsers;
  // after a minute it's safe, and the Blob's memory is freed.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)

  const at = now.toISOString()
  try {
    storage.setItem(KEYS.lastBackup, at)
  } catch {
    // The file was still downloaded; only the reminder won't know about it.
  }
  return at
}

/* A File picked by the person -> parsed backup. Throws BackupError. */
export async function readBackupFile(file) {
  // The Excel report is the file people will most likely pick by mistake,
  // so it gets its own message instead of the generic one.
  if (/\.xlsx?$/i.test(file.name)) {
    throw new BackupError('That’s an Excel report: it can’t be restored. Choose the .json backup file instead.')
  }
  // Checked before reading, so a wrong multi-GB file doesn't freeze the tab.
  if (file.size > MAX_BACKUP_BYTES) throw new BackupError('This file is too big to be a layercents backup.')
  return parseBackup(await file.text())
}
