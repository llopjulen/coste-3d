/* Tests for the part of slicerFile.js that turns plates into form values. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formValuesFromPlates, mergeFilaments, parseSliceInfo } from './slicerFile.js'

const plate = (over = {}) => ({ index: 1, seconds: 7200, totalGrams: 60, purgeGrams: null, filaments: [], estimated: false, ...over })

test('one filament: the whole weight goes to the first one and there are no extras', () => {
  const v = formValuesFromPlates([plate({ filaments: [{ type: 'PLA', color: '#fff', grams: 60 }] })], 1, 1)
  assert.deepEqual(v, { hours: 2, partGrams: 60, purgeGrams: 0, extraFilaments: [] })
})

test('two filaments: the others come back as extras and nothing is counted twice', () => {
  const v = formValuesFromPlates([plate({ filaments: [{ type: 'PLA', color: '#fff', grams: 40 }, { type: 'PETG', color: '#000', grams: 20 }] })], 1, 1)
  assert.equal(v.partGrams, 40)
  assert.deepEqual(v.extraFilaments, [{ label: 'PETG', grams: 20 }])
  assert.equal(v.partGrams + v.purgeGrams + v.extraFilaments[0].grams, 60)
})

test('with a purge listed, the first filament gets what is left', () => {
  const v = formValuesFromPlates([plate({ totalGrams: 70, purgeGrams: 10, filaments: [{ type: 'PLA', color: 'a', grams: 40 }, { type: 'PLA', color: 'b', grams: 20 }] })], 1, 1)
  assert.deepEqual([v.partGrams, v.purgeGrams, v.extraFilaments[0].grams], [40, 10, 20])
})

test('parts on the plate divide every share', () => {
  const v = formValuesFromPlates([plate({ filaments: [{ type: 'PLA', color: 'a', grams: 40 }, { type: 'PETG', color: 'b', grams: 20 }] })], 1, 2)
  assert.deepEqual([v.hours, v.partGrams, v.extraFilaments[0].grams], [1, 20, 10])
})

test('the same filament on two plates counts once; "all plates" adds them up', () => {
  const plates = [
    plate({ index: 1, totalGrams: 30, filaments: [{ type: 'PLA', color: 'a', grams: 20 }, { type: 'PETG', color: 'b', grams: 10 }] }),
    plate({ index: 2, totalGrams: 30, filaments: [{ type: 'PLA', color: 'a', grams: 20 }, { type: 'PETG', color: 'b', grams: 10 }] }),
  ]
  const v = formValuesFromPlates(plates, 'all', 1)
  assert.deepEqual([v.partGrams, v.extraFilaments], [40, [{ label: 'PETG', grams: 20 }]])
  assert.deepEqual(mergeFilaments(plates.flatMap(p => p.filaments)).map(f => f.grams), [40, 20])
})

test('a file with no weight leaves the weights alone', () => {
  const v = formValuesFromPlates([plate({ totalGrams: null })], 1, 1)
  assert.equal('partGrams' in v, false)
  assert.equal('extraFilaments' in v, false)
})

test('extras too small to show are dropped, and the label is capped', () => {
  const v = formValuesFromPlates([plate({ totalGrams: 40, filaments: [{ type: 'PLA', color: 'a', grams: 39.99 }, { type: 'X'.repeat(80), color: 'b', grams: 0.01 }, { type: 'PETG', color: 'c', grams: 0.04 }] })], 1, 1)
  assert.deepEqual(v.extraFilaments, [])
  const w = formValuesFromPlates([plate({ totalGrams: 50, filaments: [{ type: 'PLA', color: 'a', grams: 30 }, { type: 'Y'.repeat(80), color: 'b', grams: 20 }] })], 1, 1)
  assert.equal(w.extraFilaments[0].label.length, 40)
})

test('a Bambu slice_info with two filaments reaches the form as one extra', () => {
  const xml = '<config><plate><metadata key="index" value="1"/><metadata key="prediction" value="3600"/><metadata key="weight" value="25.5"/>'
    + '<filament id="1" type="PLA" color="#FFFFFF" used_m="5" used_g="15.5"/><filament id="2" type="PETG" color="#000000" used_m="3" used_g="10"/></plate></config>'
  const v = formValuesFromPlates(parseSliceInfo(xml), 1, 1)
  assert.deepEqual([v.hours, v.partGrams, v.extraFilaments], [1, 15.5, [{ label: 'PETG', grams: 10 }]])
})
