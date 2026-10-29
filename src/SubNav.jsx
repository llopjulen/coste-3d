/* ==================================================================
   SUBNAV — el segundo nivel de la barra lateral: "En esta pagina".

   La calculadora es larga: el formulario ocupa varias pantallas y el
   precio queda lejos. Esta lista, bajo la pestaña activa, salta a cada
   bloque y marca en cual estas (scrollspy).

   Como funciona el scrollspy: un IntersectionObserver avisa cuando un
   bloque entra o sale de una franja de la ventana (la del tercio
   superior). Es mas barato que escuchar `scroll` y calcular posiciones
   a mano en cada evento, y no bloquea el hilo principal.

   Solo se ve en escritorio ancho (el CSS lo esconde en movil y en la
   barra de solo iconos). Los lectores de pantalla la leen como una
   lista con nombre propio.
================================================================== */
import { useEffect, useState } from 'react'
import { useI18n } from './i18n/context.js'

export default function SubNav({ items }) {
  const { t } = useI18n()
  const [active, setActive] = useState(items[0]?.id ?? null)

  useEffect(() => {
    const seen = new Set()
    const observer = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) seen.add(e.target.id)
          else seen.delete(e.target.id)
        }
        // De los bloques dentro de la franja, el primero segun el orden de la lista
        const first = items.find(item => seen.has(item.id))
        if (first) setActive(first.id)
      },
      // La franja: del 10 % al 40 % de la altura de la ventana
      { rootMargin: '-10% 0px -60% 0px' },
    )
    for (const item of items) {
      const el = document.getElementById(item.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [items])

  function go(id) {
    const el = document.getElementById(id)
    if (!el) return
    // Quien pide menos movimiento en el sistema no ve el desplazamiento suave
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
    setActive(id)
  }

  return (
    <ul className="subnav" aria-label={t('nav.onThisPage')}>
      {items.map(item => (
        <li key={item.id}>
          <button
            type="button"
            className={`subnav-item ${active === item.id ? 'active' : ''}`}
            aria-current={active === item.id ? 'location' : undefined}
            onClick={() => go(item.id)}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  )
}
