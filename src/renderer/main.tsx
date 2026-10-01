import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

// The app talks to its main process through window.aw (the preload script). In an ordinary browser tab, which is
// what opening the dev server's address gives you, there is none: say so instead of crashing on the first call.
const root = createRoot(document.getElementById('root')!)
root.render(
  window.aw ? (
    <App />
  ) : (
    <main className="no-bridge">
      <h1>Agent World runs in its own window</h1>
      <p>This page was opened outside the app, so there is no connection to the agents. Use the Agent World window (pnpm dev opens it), or restart the app if you already did: a window that was open before an update can be missing it.</p>
    </main>
  )
)
