/* ==================================================================
   TEMA — claro u oscuro, guardado en este dispositivo.

   Regla: si la persona nunca ha elegido, manda el sistema
   (prefers-color-scheme). En cuanto pulsa el boton, su eleccion se guarda
   en localStorage (clave `theme`) y manda ella.

   Por que NO va dentro de la copia de seguridad (backup.js): es una
   preferencia de este aparato (el portatil puede ir claro y el movil
   oscuro), como `lastBackupAt`. Restaurar una copia en otro dispositivo
   no debe cambiarle el tema.

   El mismo calculo se repite en un <script> de index.html: tiene que
   correr ANTES de pintar, o la pagina parpadearia en oscuro antes de
   pasar a claro. Si cambias la logica aqui, cambiala alli.
================================================================== */
const KEY = 'theme'

// Colores de la barra del navegador en el movil (<meta name="theme-color">)
const BAR = { dark: '#161619', light: '#F4F4F6' }

function stored() {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null // modo privado o almacenamiento bloqueado: se usa el sistema
  }
}

function system() {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export const readTheme = () => stored() ?? system()

/* Pone el tema en <html data-theme="..."> y en la barra del navegador. */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[theme])
}

export function saveTheme(theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // sin almacenamiento: el cambio vale solo hasta recargar
  }
}
