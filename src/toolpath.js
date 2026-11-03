/* ==================================================================
   TOOLPATH — what the printer will actually draw, read from the G-code.

   Pure functions, no React and no three.js, so `node --test` runs them
   (toolpath.test.js). The 3D viewer (PrintPreview.jsx) turns the result
   into lines on screen.

   Why the G-code and not the 3D model: the person drops the SLICED file,
   which is what will be printed (supports, brim, purge line included). It
   is also the one format every slicer exports. An STL is supported too
   (parseStl, below), for someone who just wants to look at a model.

   What a G-code line means, the minimum needed here:
   - G0/G1 X Y Z E: move in a straight line; if E (the filament) grows,
     the nozzle is printing along the way, otherwise it is just travelling.
   - G2/G3 X Y I J E: an arc (clockwise / counter-clockwise) around the
     centre (start + I, start + J). PrusaSlicer and Bambu Studio use them
     ("arc fitting"); drawn as a straight chord, a round part would look
     like a polygon, so arcs are split into short straight pieces.
   - G90/G91: X Y Z absolute / relative. M82/M83: E absolute / relative.
     Marlin's G90 also switches E to absolute, Klipper's and RepRapFirmware's
     don't. Here only M82/M83 change E: start G-codes often say "M83" and
     then "G90", and reading that as "E absolute" draws nothing at all,
     while the opposite mistake only draws retractions as tiny lines. G92: "the current position is now…"
     (slicers reset E to 0 with it every layer).
   Units are millimetres; inches (G20) are so rare in 3D printing that
   they are not handled.
================================================================== */

// Above this many printed segments the preview stops reading: 1.5 M
// segments are 36 MB of Float32 coordinates, already a lot for a phone.
// The result says `truncated` and the screen tells the person.
export const MAX_SEGMENTS = 1_500_000

// An arc is split into pieces of at most this angle (radians, ~11°)…
const ARC_STEP = Math.PI / 16
// …and at most this many pieces, so a huge arc can't explode the count.
const ARC_MAX_PIECES = 64

/* Reads the number after a letter in the arguments of a G-code line:
   word(" X10.5 Y3", "X") -> 10.5. Null if the letter isn't there. The
   arguments always start with a space, so " X" only matches the start of
   a word. Hand-written instead of a regular expression per letter: a
   30 MB file has around a million lines and this runs up to six times per line. */
function word(args, letter) {
  const i = args.indexOf(' ' + letter)
  if (i < 0) return null
  const n = parseFloat(args.slice(i + 2))
  return Number.isFinite(n) ? n : null
}

/* G-code text -> {
     positions:  Float32Array, 6 numbers (x1 y1 z1 x2 y2 z2) per printed segment,
     layerEnds:  Uint32Array, how many segments exist when each layer ends,
     layerZ:     Float32Array, the height of each layer,
     bounds:     { min:[x,y,z], max:[x,y,z] } of what is printed,
     segments, truncated
   }
   Segments are grouped by layer in print order, so "show up to layer n"
   is just drawing the first layerEnds[n] segments (no copy). */
export function parseToolpath(text, { maxSegments = MAX_SEGMENTS } = {}) {
  // Grown by doubling, like a dynamic array: the final size isn't known
  // until the end, and a JS array of a million numbers is much heavier.
  let buf = new Float32Array(6 * 4096)
  let count = 0
  const layerEnds = []
  const layerZ = []
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]

  let x = 0, y = 0, z = 0, e = 0
  let absPos = true, absE = true
  let currentLayerZ = null
  let truncated = false

  const push = (x1, y1, z1, x2, y2, z2) => {
    if (count >= maxSegments) { truncated = true; return }
    if ((count + 1) * 6 > buf.length) {
      const bigger = new Float32Array(buf.length * 2)
      bigger.set(buf)
      buf = bigger
    }
    // A new layer starts with the first printed segment at a new height.
    if (currentLayerZ === null || Math.abs(z2 - currentLayerZ) > 1e-4) {
      if (currentLayerZ !== null) layerEnds.push(count)
      layerZ.push(z2)
      currentLayerZ = z2
    }
    const o = count * 6
    buf[o] = x1; buf[o + 1] = y1; buf[o + 2] = z1
    buf[o + 3] = x2; buf[o + 4] = y2; buf[o + 5] = z2
    count++
    // Bounds: both ends of the segment, axis by axis (no arrays per call:
    // this runs a million times).
    if (x1 < min[0]) min[0] = x1; if (x1 > max[0]) max[0] = x1
    if (x2 < min[0]) min[0] = x2; if (x2 > max[0]) max[0] = x2
    if (y1 < min[1]) min[1] = y1; if (y1 > max[1]) max[1] = y1
    if (y2 < min[1]) min[1] = y2; if (y2 > max[1]) max[1] = y2
    if (z1 < min[2]) min[2] = z1; if (z1 > max[2]) max[2] = z1
    if (z2 < min[2]) min[2] = z2; if (z2 > max[2]) max[2] = z2
  }

  let start = 0
  const length = text.length
  while (start < length && !truncated) {
    let end = text.indexOf('\n', start)
    if (end < 0) end = length
    let line = text.slice(start, end)
    start = end + 1

    const semi = line.indexOf(';')
    if (semi >= 0) line = line.slice(0, semi)
    line = line.trim().toUpperCase()
    if (line.length < 2) continue

    // The command is the first word: "G1", "G01", "M83"…
    const space = line.indexOf(' ')
    const cmd = (space < 0 ? line : line.slice(0, space)).replace(/^([GM])0+(\d)/, '$1$2')
    const args = space < 0 ? ' ' : ' ' + line.slice(space + 1).replace(/\s+/g, ' ')

    switch (cmd) {
      case 'G90': absPos = true; continue
      case 'G91': absPos = false; continue
      case 'M82': absE = true; continue
      case 'M83': absE = false; continue
      case 'G92': {
        const nx = word(args, 'X'), ny = word(args, 'Y'), nz = word(args, 'Z'), ne = word(args, 'E')
        if (nx !== null) x = nx
        if (ny !== null) y = ny
        if (nz !== null) z = nz
        if (ne !== null) e = ne
        continue
      }
      case 'G0': case 'G1': case 'G2': case 'G3': break
      default: continue
    }

    const ax = word(args, 'X'), ay = word(args, 'Y'), az = word(args, 'Z'), ae = word(args, 'E')
    const nx = ax === null ? x : absPos ? ax : x + ax
    const ny = ay === null ? y : absPos ? ay : y + ay
    const nz = az === null ? z : absPos ? az : z + az
    let extruding = false
    if (ae !== null) {
      const ne = absE ? ae : e + ae
      extruding = ne > e + 1e-6
      e = ne
    }

    const isArc = cmd === 'G2' || cmd === 'G3'
    // An arc that ends where it starts is a full circle, not "no move".
    if (extruding && (nx !== x || ny !== y || isArc)) {
      if (isArc) {
        const i = word(args, 'I') ?? 0, j = word(args, 'J') ?? 0
        arc(x, y, z, nx, ny, nz, x + i, y + j, cmd === 'G2', push)
      } else {
        push(x, y, z, nx, ny, nz)
      }
    }
    x = nx; y = ny; z = nz
  }

  if (currentLayerZ !== null) layerEnds.push(count)
  return {
    positions: buf.subarray(0, count * 6),
    layerEnds: Uint32Array.from(layerEnds),
    layerZ: Float32Array.from(layerZ),
    bounds: count ? { min, max } : null,
    segments: count,
    truncated,
  }
}

/* An arc from (x1,y1) to (x2,y2) around (cx,cy), split into straight pieces.
   `clockwise` is G2. The angle is taken the short or long way round
   depending on the direction, and a full circle (start = end) is 2π. */
function arc(x1, y1, z1, x2, y2, z2, cx, cy, clockwise, push) {
  const r = Math.hypot(x1 - cx, y1 - cy)
  if (!(r > 1e-6)) { push(x1, y1, z1, x2, y2, z2); return }
  const a1 = Math.atan2(y1 - cy, x1 - cx)
  let sweep = Math.atan2(y2 - cy, x2 - cx) - a1
  if (clockwise && sweep >= 0) sweep -= 2 * Math.PI
  if (!clockwise && sweep <= 0) sweep += 2 * Math.PI
  // Same start and end: a full turn (the two lines above already made it ±2π).
  const pieces = Math.min(ARC_MAX_PIECES, Math.max(1, Math.ceil(Math.abs(sweep) / ARC_STEP)))
  let px = x1, py = y1, pz = z1
  for (let k = 1; k <= pieces; k++) {
    const t = k / pieces
    // The last piece lands exactly on the end point the G-code gave.
    const qx = k === pieces ? x2 : cx + r * Math.cos(a1 + sweep * t)
    const qy = k === pieces ? y2 : cy + r * Math.sin(a1 + sweep * t)
    const qz = z1 + (z2 - z1) * t
    push(px, py, pz, qx, qy, qz)
    px = qx; py = qy; pz = qz
  }
}

/* STL (binary or text) -> { positions: Float32Array, 9 numbers per triangle,
   triangles, bounds }. Binary STL: an 80-byte header, a 32-bit triangle
   count, then 50 bytes per triangle (normal, 3 vertices, 2 spare bytes).
   It is told apart from text STL by its size, not by the header: some
   programs write "solid" at the start of binary files too. */
export function parseStl(buffer) {
  const bytes = new Uint8Array(buffer)
  if (bytes.length >= 84) {
    const view = new DataView(buffer.buffer ?? buffer, bytes.byteOffset ?? 0)
    const n = view.getUint32(80, true)
    if (84 + n * 50 === bytes.length) {
      const positions = new Float32Array(n * 9)
      for (let t = 0; t < n; t++) {
        const at = 84 + t * 50 + 12 // skip the normal: it's recomputed for lighting
        for (let k = 0; k < 9; k++) positions[t * 9 + k] = view.getFloat32(at + k * 4, true)
      }
      return withBounds(positions)
    }
  }
  // Text STL: every "vertex x y z" line, three per triangle.
  const text = new TextDecoder().decode(bytes)
  const out = []
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g
  let m
  while ((m = re.exec(text))) out.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]))
  if (out.length < 9 || out.some(v => !Number.isFinite(v))) return null
  return withBounds(Float32Array.from(out.slice(0, out.length - (out.length % 9))))
}

function withBounds(positions) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i++) {
    const k = i % 3
    if (positions[i] < min[k]) min[k] = positions[i]
    if (positions[i] > max[k]) max[k] = positions[i]
  }
  return { positions, triangles: positions.length / 9, bounds: positions.length ? { min, max } : null }
}
