import { useEffect, useRef, useState } from 'react'
import {
  BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DirectionalLight, DoubleSide,
  Group, HemisphereLight, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh,
  MeshStandardMaterial, PerspectiveCamera, Quaternion, Scene, Vector3, WebGLRenderer,
} from 'three'
import { bandStops, layerBands } from './costPrint.js'

/* ==================================================================
   COST PRINT — the cost breakdown as a small object printed in 3D.

   The brand is "layer cents": a print is layers, and each layer costs
   cents. This draws exactly that. A vase is printed layer by layer when
   the calculator opens; each band of colour is one part of the cost
   (same colours and order as the bar and the list under it), as thick as
   its share. Typing a number re-colours the layers in place; pointing at
   a row of the list lights up its band.

   With a file dropped in "Import" (the sliced file or an STL), the vase
   gives way to THAT part: the same bands of colour, painted by height on
   the real geometry, printed bottom to top (see setModel).

   It is decoration with meaning, not the source of truth: the bar and
   the list below carry the numbers and the accessible label, so the
   canvas is aria-hidden and the page works the same if WebGL is missing.

   Loaded with lazy() from App: three.js (~150 kB compressed, the chunk
   PrintPreview already uses) never delays the calculator itself.

   Performance: ONE InstancedMesh for all the layers (one draw call
   instead of 56), and the animation loop stops while the canvas is off
   screen or the tab is hidden.
================================================================== */

const N = 56            // layers of the vase
const HEIGHT = 2.4      // scene units
const PRINT_SECONDS = 1.8
const IDLE = new Color('#8b8a86') // no cost yet: an unpainted print
const MAX_PARTS = 8     // size of the colour arrays in the shader (LAYERS has 8)

/* Paints a standard three.js material by height. Instead of writing a
   whole shader (and losing the built-in lighting), onBeforeCompile edits
   the one three.js generates: the vertex shader passes down how high the
   point is (0 bottom, 1 top), and the fragment shader picks the band's
   colour, draws faint layer lines, and throws away what is not printed yet.
   `uniforms` is shared with the scene, which animates its values. */
function paintByHeight(material, uniforms, lines) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uMinZ; uniform float uSpanZ; varying float vT;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvT = (position.z - uMinZ) / uSpanZ;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uColors[${MAX_PARTS}]; uniform float uStops[${MAX_PARTS}]; uniform float uPrinted; varying float vT;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vT > uPrinted) discard;
        vec3 band = uColors[0];
        // uStops[i] is where band i ends: each step() switches to the next colour above it.
        for (int i = 1; i < ${MAX_PARTS}; i++) band = mix(band, uColors[i], step(uStops[i - 1], vT));
        ${lines ? `band *= 0.9 + 0.1 * step(0.25, fract(vT * ${N}.0));` : ''}
        diffuseColor.rgb = band;`)
  }
}

/* Outline of the vase: radius at height t (0 bottom, 1 top). A sine
   gives the belly and the neck; printers love this shape because it
   needs no supports. */
const radiusAt = t => 0.74 + 0.2 * Math.sin(t * Math.PI * 1.25 + 0.35)

function createScene(canvas, reduced) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  const scene = new Scene()
  const camera = new PerspectiveCamera(30, 1, 0.1, 50)
  camera.position.set(0, 2.5, 6.6)
  camera.lookAt(0, 1.12, 0)

  // Soft light from the sky plus one lamp: matte plastic, no shine (DESIGN.md).
  scene.add(new HemisphereLight(0xffffff, 0x55524c, 1.5))
  const lamp = new DirectionalLight(0xffffff, 1.6)
  lamp.position.set(3, 5, 4)
  scene.add(lamp)

  const turntable = new Group()
  scene.add(turntable)

  // A hexagonal "cylinder": the six flat faces catch the light differently,
  // so the slow turn and the twist are visible without any texture.
  const layerH = HEIGHT / N
  const geometry = new CylinderGeometry(1, 1, 1, 6)
  const material = new MeshStandardMaterial({ roughness: 0.85, metalness: 0 })
  const layers = new InstancedMesh(geometry, material, N)
  turntable.add(layers)

  const plate = new Mesh(
    new CylinderGeometry(1.55, 1.55, 0.05, 48),
    new MeshStandardMaterial({ color: 0x6f6e6a, roughness: 1, transparent: true, opacity: 0.35 }),
  )
  plate.position.y = -0.03
  turntable.add(plate)

  const nozzle = new Mesh(new ConeGeometry(0.07, 0.22, 12), new MeshStandardMaterial({ color: 0xb9b7b0, roughness: 0.6 }))
  nozzle.rotation.x = Math.PI // tip down
  turntable.add(nozzle)

  /* The dropped part, when there is one. Its colours live in shader
     uniforms: uColors/uStops are the bands, uPrinted how far it is printed. */
  const uniforms = {
    uColors: { value: Array.from({ length: MAX_PARTS }, () => IDLE.clone()) },
    uStops: { value: Array(MAX_PARTS).fill(1) },
    uPrinted: { value: 0 }, uMinZ: { value: 0 }, uSpanZ: { value: 1 },
  }
  const partTarget = Array.from({ length: MAX_PARTS }, () => IDLE.clone())
  const stopTarget = Array(MAX_PARTS).fill(1)
  let model = null // { object, geometry, material }

  // Per-layer colours: `shown` moves towards `target` a little every frame.
  const shown = Array.from({ length: N }, () => IDLE.clone())
  const target = Array.from({ length: N }, () => IDLE.clone())
  let printed = reduced ? N : 0 // how many layers exist so far (a float while printing)
  let settled = false           // colours have reached their targets

  const m = new Matrix4(), q = new Quaternion(), up = new Vector3(0, 1, 0), pos = new Vector3(), scale = new Vector3()
  function place() {
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1)
      const r = i < printed ? radiusAt(t) : 0 // not printed yet: scaled to nothing
      q.setFromAxisAngle(up, t * 0.9)         // each layer turned a little: the vase twists
      pos.set(0, (i + 0.5) * layerH, 0)
      scale.set(r, layerH * 0.86, r)          // 14 % gap: the layer lines of a real print
      layers.setMatrixAt(i, m.compose(pos, q, scale))
      layers.setColorAt(i, shown[i])
    }
    layers.instanceMatrix.needsUpdate = true
    layers.instanceColor.needsUpdate = true
    const top = Math.min(printed, N)
    nozzle.visible = printed < N && !model
    // The nozzle circles the edge of the layer being printed.
    const a = printed * 2.4, r = radiusAt(Math.min(top / N, 1))
    nozzle.position.set(Math.cos(a) * r, top * layerH + 0.13, Math.sin(a) * r)
  }

  let frame = 0, last = 0, visible = true
  function tick(now) {
    frame = 0
    const dt = Math.min((now - last) / 1000 || 0, 0.05) // a long pause is not one giant step
    last = now
    if (printed < N) printed = Math.min(printed + (N / PRINT_SECONDS) * dt, N)
    turntable.rotation.y += dt * 0.28
    // Exponential approach: fast at first, soft landing, same feel at any frame rate.
    const k = 1 - Math.exp(-dt * 9)
    settled = true
    for (let i = 0; i < N; i++) {
      shown[i].lerp(target[i], k)
      if (Math.abs(shown[i].r - target[i].r) + Math.abs(shown[i].g - target[i].g) + Math.abs(shown[i].b - target[i].b) > 0.004) settled = false
    }
    // The same soft approach for the part's bands: colours and where each one ends.
    for (let i = 0; i < MAX_PARTS; i++) {
      uniforms.uColors.value[i].lerp(partTarget[i], k)
      uniforms.uStops.value[i] += (stopTarget[i] - uniforms.uStops.value[i]) * k
    }
    if (model && uniforms.uPrinted.value < 1) uniforms.uPrinted.value = Math.min(uniforms.uPrinted.value + dt / PRINT_SECONDS, 1)
    place()
    renderer.render(scene, camera)
    schedule()
  }
  function schedule() {
    // With reduced motion nothing turns: draw only while colours are changing.
    const moving = reduced ? !settled : true
    if (!frame && visible && !document.hidden && moving) frame = requestAnimationFrame(tick)
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false) // false: CSS decides the size on the page
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    place()
    renderer.render(scene, camera)
  }
  const sizes = new ResizeObserver(resize)
  sizes.observe(canvas)
  const seen = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; last = performance.now(); schedule() })
  seen.observe(canvas)
  const onHidden = () => { last = performance.now(); schedule() }
  document.addEventListener('visibilitychange', onHidden)

  function dropModel() {
    if (!model) return
    turntable.remove(model.object)
    model.geometry.dispose(); model.material.dispose()
    model = null
  }

  return {
    /* data: what preview.worker.js returns ({ kind: 'mesh' | 'toolpath',
       positions, bounds }), or null to go back to the vase. */
    setModel(data) {
      dropModel()
      layers.visible = !data
      if (data) {
        const { min, max } = data.bounds
        const geometry = new BufferGeometry()
        geometry.setAttribute('position', new BufferAttribute(data.positions, 3))
        let object, material
        if (data.kind === 'mesh') {
          geometry.computeVertexNormals()
          // DoubleSide: while it "prints", the open top shows the inside faces.
          material = new MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: DoubleSide })
          paintByHeight(material, uniforms, true)
          object = new Mesh(geometry, material)
        } else {
          // A sliced file is the real path of the nozzle: drawn as lines,
          // its own layers are already visible, so no painted layer lines.
          material = new LineBasicMaterial()
          paintByHeight(material, uniforms, false)
          object = new LineSegments(geometry, material)
        }
        uniforms.uMinZ.value = min[2]
        uniforms.uSpanZ.value = Math.max(max[2] - min[2], 1e-6)
        uniforms.uPrinted.value = reduced ? 1 : 0
        // Fit it on the plate: as tall as the vase at most, and not wider than the plate.
        const halfDiagonal = Math.hypot(max[0] - min[0], max[1] - min[1]) / 2
        const fit = Math.min(HEIGHT / uniforms.uSpanZ.value, 1.35 / Math.max(halfDiagonal, 1e-6))
        object.position.set(-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2, -min[2])
        const holder = new Group()
        holder.add(object)
        holder.scale.setScalar(fit)
        holder.rotation.x = -Math.PI / 2 // printers are Z-up, three.js is Y-up
        turntable.add(holder)
        model = { object: holder, geometry, material }
      }
      settled = false
      place()
      renderer.render(scene, camera)
      schedule()
    },
    /* bands: layer -> index into colours (or [] for "no cost");
       lit: index of the part to keep lit, or -1 for all;
       stops: where each part's band ends, 0..1 (for the dropped part). */
    update(bands, colours, lit, background, stops) {
      for (let i = 0; i < MAX_PARTS; i++) {
        partTarget[i].copy(stops.length && colours[i] ? colours[i] : IDLE)
        if (lit !== -1 && i !== lit) partTarget[i].lerp(background, 0.72)
        stopTarget[i] = stops[i] ?? 1
        if (reduced) { uniforms.uColors.value[i].copy(partTarget[i]); uniforms.uStops.value[i] = stopTarget[i] }
      }
      for (let i = 0; i < N; i++) {
        const part = bands[i]
        target[i].copy(part === undefined ? IDLE : colours[part])
        if (lit !== -1 && part !== lit) target[i].lerp(background, 0.72)
        if (reduced) shown[i].copy(target[i])
      }
      settled = false
      if (reduced) { place(); renderer.render(scene, camera) }
      schedule()
    },
    dispose() {
      cancelAnimationFrame(frame)
      dropModel()
      sizes.disconnect(); seen.disconnect()
      document.removeEventListener('visibilitychange', onHidden)
      geometry.dispose(); material.dispose()
      plate.geometry.dispose(); plate.material.dispose()
      nozzle.geometry.dispose(); nozzle.material.dispose()
      renderer.dispose()
    },
  }
}

/* layers: [{ key, color }] (App's LAYERS); parts: { key: amount };
   active: key of the part to light up, or null;
   file / plate: the file dropped in Import (or null) and its chosen plate. */
export default function CostPrint({ layers, parts, active, file = null, plate = null }) {
  const canvasRef = useRef(null)
  const sceneRef = useRef(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    try {
      sceneRef.current = createScene(canvasRef.current, reduced)
    } catch {
      // No WebGL (old device, blocked GPU): the bar and the list are still there.
      setFailed(true)
      return
    }
    return () => { sceneRef.current?.dispose(); sceneRef.current = null }
  }, [])

  /* The dropped file -> its geometry, parsed off the main thread by the
     same worker the 3D preview uses (a big G-code takes a moment and must
     not freeze typing). Anything that can't be drawn (.bgcode, a broken
     file) simply leaves the vase. */
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    if (!file || !/\.(gcode|gco|g|3mf|stl)$/i.test(file.name)) { scene.setModel(null); return }
    const worker = new Worker(new URL('./preview.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }) => { sceneRef.current?.setModel(data.ok && data.bounds ? data : null); worker.terminate() }
    worker.onerror = () => { sceneRef.current?.setModel(null); worker.terminate() }
    worker.postMessage({ file, plate })
    return () => worker.terminate()
  }, [file, plate, failed])

  // A string of the amounts: the effect below runs when a number changes,
  // not on every render (the `parts` object is new each time).
  const signature = layers.map(l => parts[l.key] ?? 0).join('|')
  useEffect(() => {
    if (!sceneRef.current) return
    // The panel's own colour, read from CSS so dimming works in both themes.
    const background = new Color(getComputedStyle(canvasRef.current).getPropertyValue('--panel').trim() || '#1c1c1e')
    sceneRef.current.update(
      layerBands(layers, parts, N),
      layers.map(l => new Color(l.color)),
      active ? layers.findIndex(l => l.key === active) : -1,
      background,
      bandStops(layers, parts),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` stands for `parts`
  }, [signature, active, layers, failed])

  if (failed) return null
  return <canvas ref={canvasRef} className="cost-print-canvas" aria-hidden="true" />
}
