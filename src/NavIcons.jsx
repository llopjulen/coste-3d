/* Iconos de la navegacion: SVG en linea, todos con el mismo trazo.

   Por que SVG propio y no una libreria de iconos: son tres figuras, y una
   dependencia nueva (lucide, heroicons...) añadiria peso al bundle y un
   paquete mas que vigilar por tres dibujos. Con `stroke="currentColor"`
   el icono toma el color del texto del boton, asi que el estado activo, el
   hover y el modo de contraste del sistema cambian el icono sin CSS extra.

   aria-hidden: el icono es decoracion; el nombre de la seccion ya esta en
   el texto del boton (visible o .sr-only), y leerlo dos veces estorba. */
const PATHS = {
  // Calculadora: cuerpo, pantalla y teclas
  calculator: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="3" />
      <path d="M8.5 7.5h7" />
      <path d="M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" />
    </>
  ),
  // Historial: reloj con flecha hacia atras
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4.5v4h4" />
      <path d="M12 8v4.2l2.6 1.6" />
    </>
  ),
  // Tema: el sol se muestra en oscuro (pulsa para pasar a claro) y la luna en claro
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  // Impresora 3D: portico, cabezal y cama
  printer: (
    <>
      <path d="M5 4h14" />
      <path d="M12 4v7" />
      <path d="M10 11h4l-2 3z" />
      <rect x="4" y="17" width="16" height="3" rx="1.2" />
    </>
  ),
}

export default function NavIcon({ name }) {
  return (
    <svg
      className="nav-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
