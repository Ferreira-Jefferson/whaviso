// QA harness (dev-only): entry de bootstrap. So e servido quando o Vite roda em mode 'qa'
// (qa.html). NAO e input do `npm run build` de producao.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource-variable/lora'
import '@fontsource/karla/400.css'
import '@fontsource/karla/500.css'
import '@fontsource/karla/700.css'

import '../index.css'
import { Harness } from './Harness'

const root = document.getElementById('root')
if (!root) throw new Error('Elemento #root nao encontrado.')

createRoot(root).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)
