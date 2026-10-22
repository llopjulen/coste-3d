import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { consumeAgentOptIn } from './agent.js'

// Read and removed here, once per page load, before React starts. Inside a
// component it would run twice in development (StrictMode calls state
// initializers twice) and the second call would no longer see the ?agent.
const agentOptIn = consumeAgentOptIn()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App agentOptIn={agentOptIn} />
  </StrictMode>,
)
