import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts served from this site itself (see DEV_LOG 2026-10-29). Imported before
// index.css so the @font-face rules exist when the stylesheet uses them.
// Inter: one variable file for weights 400-600. Bricolage: variable with its
// optical-size axis, which the old Google link also requested (opsz 12..96).
import '@fontsource-variable/inter'
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import './index.css'
import Root from './Root.jsx'
import I18nProvider from './i18n/Provider.jsx'
import { consumeAgentOptIn } from './agent.js'
import { isEmbed } from './embed.js'

const embedded = isEmbed(window.location.search)
// Read and removed here, once per page load, before React starts. Inside a
// component it would run twice in development (StrictMode calls state
// initializers twice) and the second call would no longer see the ?agent.
// The widget must not even read it: it could remove it from a shop's address.
const agentOptIn = embedded ? false : consumeAgentOptIn()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <Root embedded={embedded} agentOptIn={agentOptIn} />
    </I18nProvider>
  </StrictMode>,
)
