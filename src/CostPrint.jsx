import { useEffect, useRef, useState } from 'react'
import {
  Color, ConeGeometry, CylinderGeometry, DirectionalLight, Group, HemisphereLight,
  InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, Quaternion,
  Scene, Vector3, WebGLRenderer,
} from 'three'
import { layerBands } from './costPrint.js'

/* ==================================================================
   COST PRINT — the cost breakdown as a small object printed in 3D.

   The brand is "layer cents": a print is layers, and each layer costs
   cents. This draws exactly that. A vase is printed layer by layer when
   the calculator opens; each band of colour is one part of the cost
   (same colours and order as the bar and the list under it), as thick as
   its share. Typing a number re-colours the layers in place; pointing at
   a row of the list lights up its band.

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
    nozzle.visible = printed < N
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

  return {
    /* bands: layer -> index into colours (or [] for "no cost");
       dim: index of the part to keep lit, or -1 for all. */
    update(bands, colours, lit, background) {
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
   active: key of the part to light up, or null. */
export default function CostPrint({ layers, parts, active }) {
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
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` stands for `parts`
  }, [signature, active, layers, failed])

  if (failed) return null
  return <canvas ref={canvasRef} className="cost-print-canvas" aria-hidden="true" />
}
