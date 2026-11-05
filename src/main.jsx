import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// A tab opened before a deploy still runs the old build, whose lazily
// imported chunks (e.g. jsPDF for Build CV) have hashed filenames the new
// deploy no longer has. The host's SPA fallback answers those requests with
// index.html, so the dynamic import fails ("Failed to fetch dynamically
// imported module"). Vite fires vite:preloadError for exactly this case:
// reload once to pick up the current build. The timestamp guard stops a
// reload loop if the chunk is genuinely broken rather than just stale.
const PRELOAD_RELOAD_KEY = 'vite-preload-reload-at'
window.addEventListener('vite:preloadError', (event) => {
  let last = 0
  try {
    last = Number(sessionStorage.getItem(PRELOAD_RELOAD_KEY)) || 0
  } catch {
    // sessionStorage unavailable: still reload, just without the loop guard.
  }
  if (Date.now() - last < 10_000) return // already tried; let the error surface
  event.preventDefault()
  try {
    sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(Date.now()))
  } catch {
    // ignore
  }
  window.location.reload()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
