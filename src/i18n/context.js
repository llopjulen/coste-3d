import { createContext, useContext } from 'react'

/* El contexto vive en su propio archivo: Provider.jsx exporta un componente, y
   mezclar componentes con otras exportaciones rompe el recargado en caliente
   de Vite (react-refresh). Valor por defecto null para que usar useI18n fuera
   del Provider falle a gritos en vez de mostrar claves por toda la pantalla. */
export const I18nContext = createContext(null)

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}
