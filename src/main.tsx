import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startDevReload } from './lib/dev-reload'
import './styles.css'

startDevReload()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
