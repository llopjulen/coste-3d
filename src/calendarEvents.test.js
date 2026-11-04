/* Tests for calendarEvents.js and its place in the backup. Run: npm test
   They protect: bad input never reaches the screen, the person's entries
   survive a backup round-trip, and restoring an older file (which has no
   calendar) never wipes the entries in this browser. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EVENTS_KEY, MAX_TITLE, sanitizeEvent, sanitizeEvents, mergeEvents, upsertEvent, removeEvent,
  readEvents, writeEvents,
} from './calendarEvents.js'
import { KEYS, buildBackup, parseBackup, planRestore, applyRestore } from './backup.js'

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    map,
  }
}

const A = { id: 'a', date: '2026-11-10', title: 'Comprar PETG' }
const B = { id: 'b', date: '2026-11-08', title: 'Feria', time: '10:00', note: 'Llevar muestras' }

test('a valid event is kept, trimmed, with only known fields', () => {
  assert.deepEqual(sanitizeEvent({ ...B, title: '  Feria  ', extra: 1 }), B)
})

test('an event without id, title or a real day is dropped', () => {
  assert.equal(sanitizeEvent({ ...A, id: '' }), null)
  assert.equal(sanitizeEvent({ ...A, title: '   ' }), null)
  assert.equal(sanitizeEvent({ ...A, date: '10/11/2026' }), null)
  assert.equal(sanitizeEvent({ ...A, date: '2026-13-40' }), null)
  assert.equal(sanitizeEvent('nope'), null)
})

test('a bad time or note is dropped, not the whole event', () => {
  assert.deepEqual(sanitizeEvent({ ...A, time: '25:00', note: 42 }), A)
})

test('long text is cut to its limit instead of rejected', () => {
  assert.equal(sanitizeEvent({ ...A, title: 'x'.repeat(500) }).title.length, MAX_TITLE)
})

test('a list is cleaned, de-duplicated by id and sorted by day and time', () => {
  const list = sanitizeEvents([A, B, { ...A, title: 'duplicate' }, null, { ...B, id: 'c', time: undefined }])
  assert.deepEqual(list.map(e => e.id), ['c', 'b', 'a'])
  assert.deepEqual(sanitizeEvents({ not: 'a list' }), [])
})

test('upsert adds, replaces by id and ignores invalid entries; remove deletes', () => {
  let list = upsertEvent([], A)
  list = upsertEvent(list, { ...A, title: 'Comprar PLA' })
  assert.deepEqual(list.map(e => e.title), ['Comprar PLA'])
  assert.equal(upsertEvent(list, { id: 'z' }), list)
  assert.deepEqual(removeEvent(list, 'a'), [])
})

test('merge keeps the version in this browser when both sides edited the same entry', () => {
  const merged = mergeEvents([{ ...A, title: 'here' }], [{ ...A, title: 'file' }, B])
  assert.deepEqual(merged.map(e => [e.id, e.title]), [['b', 'Feria'], ['a', 'here']])
})

test('storage round-trip; an empty list removes the key; damaged JSON reads as none', () => {
  const s = fakeStorage()
  assert.equal(writeEvents([A], s), true)
  assert.deepEqual(readEvents(s), [A])
  writeEvents([], s)
  assert.equal(s.map.has(EVENTS_KEY), false)
  assert.deepEqual(readEvents(fakeStorage({ [EVENTS_KEY]: '{oops' })), [])
})

test('blocked storage: write says false instead of throwing', () => {
  const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('full') }, removeItem() {} }
  assert.equal(writeEvents([A], blocked), false)
  assert.deepEqual(readEvents(blocked), [])
})

test('entries go into the backup file and come back', () => {
  const parsed = parseBackup(JSON.stringify(buildBackup({ quotes: [], events: [A, B] })))
  assert.deepEqual(parsed.events, [B, A])
})

test('an older backup without calendar never wipes the entries here', () => {
  const parsed = parseBackup(JSON.stringify(buildBackup({ quotes: [] })))
  assert.equal(parsed.events, null)
  const current = { quotes: [], business: null, counter: null, setup: null, events: [A] }
  assert.deepEqual(planRestore(current, parsed, 'replace').events, [A])
  assert.deepEqual(planRestore(current, parsed, 'merge').events, [A])
})

test('replace with a file that has entries takes exactly the file’s', () => {
  const current = { quotes: [], business: null, counter: null, setup: null, events: [A] }
  const backup = { quotes: [], business: null, counter: null, setup: null, events: [B] }
  assert.deepEqual(planRestore(current, backup, 'replace').events, [B])
})

test('applyRestore writes the merged entries to storage', () => {
  const s = fakeStorage({ [KEYS.events]: JSON.stringify([A]) })
  const backup = parseBackup(JSON.stringify(buildBackup({ quotes: [], events: [B] })))
  applyRestore(backup, 'merge', [], s)
  assert.deepEqual(readEvents(s).map(e => e.id), ['b', 'a'])
})
