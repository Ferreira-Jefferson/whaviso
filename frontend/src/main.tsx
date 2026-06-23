import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Fontes self-hosted (@fontsource): Fraunces (display) + Karla (corpo).
import '@fontsource-variable/fraunces'
import '@fontsource/karla/400.css'
import '@fontsource/karla/500.css'
import '@fontsource/karla/700.css'

import './index.css'
import { App } from './app/providers'

const root = document.getElementById('root')
if (!root) throw new Error('Elemento #root não encontrado.')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
