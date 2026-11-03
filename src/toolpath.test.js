/* Tests for toolpath.js. Run them with:  npm test */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseStl, parseToolpath } from './toolpath.js'

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-4, `${msg ?? ''} ${a} vs ${b}`)

test('travel moves are not drawn, extrusions are', () => {
  const r = parseToolpath(['G90', 'M82', 'G1 Z0.2', 'G0 X10 Y10', 'G1 X20 Y10 E1', 'G1 X20 Y20 E2', 'G0 X0 Y0'].join('\n'))
  assert.equal(r.segments, 2)
  assert.deepEqual([...r.positions.slice(0, 6)], [10, 10, 0.2, 20, 10, 0.2].map(Math.fround))
})

test('relative extrusion (M83), as Bambu Studio and Orca write it', () => {
  const r = parseToolpath(['G90', 'M83', 'G1 Z0.2', 'G1 X5 Y0 E0.4', 'G1 X5 Y5 E0', 'G1 X0 Y5 E-0.5', 'G1 X0 Y0 E0.3'].join('\n'))
  // E0 is not printing and E-0.5 is a retraction: two printed segments.
  assert.equal(r.segments, 2)
})

test('G92 E0 resets the filament counter without drawing anything', () => {
  const r = parseToolpath(['M82', 'G1 Z0.2', 'G1 X10 E5', 'G92 E0', 'G1 X20 E1'].join('\n'))
  assert.equal(r.segments, 2)
})

test('layers: one per new printed height, with where each one ends', () => {
  const r = parseToolpath(['M83', 'G1 Z0.2', 'G1 X10 E1', 'G1 Y10 E1', 'G1 Z0.4', 'G1 X0 E1', 'G1 Z0.6', 'G0 X50', 'G1 Z0.8', 'G1 Y0 E1'].join('\n'))
  assert.deepEqual([...r.layerEnds], [2, 3, 4])
  assert.deepEqual([...r.layerZ].map(v => Math.round(v * 10) / 10), [0.2, 0.4, 0.8])
})

test('comments, leading zeros and lower case are understood', () => {
  const r = parseToolpath(['m83 ; relative', 'G01 Z0.2', 'g1 x10 e1 ; first line', '; G1 X99 E9'].join('\n'))
  assert.equal(r.segments, 1)
  near(r.bounds.max[0], 10)
})

test('an arc is split into pieces that stay on the circle', () => {
  // Half circle of radius 10 around (10,0), counter-clockwise from (0,0) to (20,0) through (10,-10)? G3 goes CCW: through (10,-10).
  const r = parseToolpath(['M83', 'G1 Z0.2', 'G3 X20 Y0 I10 J0 E2'].join('\n'))
  assert.ok(r.segments >= 8, `${r.segments} pieces`)
  for (let s = 0; s < r.segments; s++) {
    const px = r.positions[s * 6 + 3], py = r.positions[s * 6 + 4]
    near(Math.hypot(px - 10, py), 10, 'radius')
  }
  near(r.positions[(r.segments - 1) * 6 + 3], 20, 'ends where the G-code says')
  assert.ok(r.bounds.min[1] < -9.9, 'CCW from the left goes below the centre')
})

test('G2 (clockwise) goes the other way round', () => {
  const r = parseToolpath(['M83', 'G1 Z0.2', 'G2 X20 Y0 I10 J0 E2'].join('\n'))
  assert.ok(r.bounds.max[1] > 9.9)
})

test('too many segments stops reading and says so', () => {
  const lines = ['M83', 'G1 Z0.2']
  for (let i = 0; i < 50; i++) lines.push(`G1 X${i % 2 ? 10 : 0} Y${i} E0.1`)
  const r = parseToolpath(lines.join('\n'), { maxSegments: 10 })
  assert.equal(r.segments, 10)
  assert.equal(r.truncated, true)
})

test('a file with no printing gives no bounds instead of Infinity', () => {
  const r = parseToolpath('G28\nG0 X10\n')
  assert.equal(r.segments, 0)
  assert.equal(r.bounds, null)
})

test('relative positioning (G91) adds to the current point', () => {
  const r = parseToolpath(['G91', 'M83', 'G1 Z0.2', 'G1 X10 E1', 'G1 X10 E1'].join('\n'))
  near(r.bounds.max[0], 20)
})

test('"M83" then "G90" keeps E relative (start G-codes do this)', () => {
  const r = parseToolpath(['M83', 'G90', 'G1 Z0.2', 'G1 X10 E0.4', 'G1 Y10 E0.4', 'G1 X0 E0.4'].join('\n'))
  assert.equal(r.segments, 3)
})

test('a full circle (G3 that ends where it starts) is drawn all the way round', () => {
  const r = parseToolpath(['M83', 'G1 Z0.2', 'G0 X20 Y10', 'G3 X20 Y10 I-10 J0 E3'].join('\n'))
  assert.ok(r.segments >= 30, `${r.segments} pieces`)
  near(r.bounds.min[0], 0); near(r.bounds.max[1], 20); near(r.bounds.min[1], 0)
})

/* ---- STL ---- */
function binaryStl(triangles) {
  const buf = new ArrayBuffer(84 + triangles.length * 50)
  const v = new DataView(buf)
  v.setUint32(80, triangles.length, true)
  triangles.forEach((tri, t) => tri.forEach((n, k) => v.setFloat32(84 + t * 50 + 12 + k * 4, n, true)))
  return buf
}

test('binary STL: triangles and bounds', () => {
  const r = parseStl(binaryStl([[0, 0, 0, 10, 0, 0, 0, 20, 5]]))
  assert.equal(r.triangles, 1)
  assert.deepEqual(r.bounds.max, [10, 20, 5])
})

test('a binary STL whose header starts with "solid" is still read as binary', () => {
  const buf = binaryStl([[0, 0, 0, 1, 0, 0, 0, 1, 0]])
  new Uint8Array(buf).set(new TextEncoder().encode('solid fake header'), 0)
  assert.equal(parseStl(buf).triangles, 1)
})

test('text STL', () => {
  const text = `solid cube
facet normal 0 0 1
 outer loop
  vertex 0 0 0
  vertex 1 0 0
  vertex 0 1 2.5
 endloop
endfacet
endsolid`
  const r = parseStl(new TextEncoder().encode(text).buffer)
  assert.equal(r.triangles, 1)
  assert.equal(r.bounds.max[2], 2.5)
})

test('garbage is not an STL', () => {
  assert.equal(parseStl(new TextEncoder().encode('hello').buffer), null)
})
