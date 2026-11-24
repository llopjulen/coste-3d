import { lazy, Suspense } from 'react'
import App from './App.jsx'

/* ==================================================================
   ROOT — which of the two programs this address runs.

   `?embed` is the small widget a shop puts in an iframe (Embed.jsx, see
   src/embed.js); anything else is the app. They are chosen HERE, before
   <App> exists, so the widget never runs App's state: no localStorage, no
   agent on 127.0.0.1, no exchange-rate request, nothing of the visitor's.
   Its own file (and not main.jsx) because a component defined in a file
   that exports nothing breaks Vite's hot reload.

   lazy(): the ordinary visitor doesn't download the widget.
================================================================== */
const Embed = lazy(() => import('./Embed.jsx'))

export default function Root({ embedded, agentOptIn }) {
  if (!embedded) return <App agentOptIn={agentOptIn} />
  return (
    <Suspense fallback={null}>
      <Embed />
    </Suspense>
  )
}
