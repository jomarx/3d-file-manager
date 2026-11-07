import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Saved view and sort come first, so the first query already uses them.
void window.api.settings.get().then((settings) =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App initialSettings={settings} />
    </StrictMode>
  )
)
