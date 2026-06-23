import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './bootstrap'
import { App } from './App'

// Service-worker registration is auto-injected into the built HTML by
// vite-plugin-pwa (injectRegister: 'auto'). We intentionally do NOT import
// 'virtual:pwa-register' here: that virtual module only exists when the PWA
// plugin is active, and it's disabled in dev (devOptions.enabled: false), so a
// direct import breaks `vite dev`. Auto-inject keeps the SW in production only.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
