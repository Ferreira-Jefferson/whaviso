import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod'

// Zod 4 tem um modo JIT que compila validadores com o construtor `Function`. Antes de usar, ele
// sonda `new Function("")` num try/catch; sob a nossa CSP estrita (sem 'unsafe-eval', de proposito)
// a sonda e bloqueada e CAPTURADA, mas o Chrome ainda reporta a violacao no console. `jitless` faz o
// Zod pular a sonda e ir direto ao caminho interpretado (que ja era o usado sob CSP): mesmo
// comportamento, sem o ruido de 'eval' no console. Precisa rodar antes de qualquer `.parse()`.
z.config({ jitless: true })

// Fontes self-hosted (@fontsource): Lora (display) + Karla (corpo).
import '@fontsource-variable/lora'
import '@fontsource/karla/400.css'
import '@fontsource/karla/500.css'
import '@fontsource/karla/700.css'

import './index.css'
import { App } from './app/providers'

async function bootstrap() {
  // So em dev, e so quando a URL pede (scripts/qa_login.mjs): injeta a sessao do usuario de
  // teste antes de montar o app, sem precisar colar token no console.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('qa_session_port')) {
    const { injetarSessaoQa } = await import('./dev/qaSessionBootstrap')
    if (await injetarSessaoQa()) return // location.replace ja disparou a navegacao seguinte
  }

  const root = document.getElementById('root')
  if (!root) throw new Error('Elemento #root não encontrado.')

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
