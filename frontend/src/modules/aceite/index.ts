// E5: a página /aceite/:token saiu (aceite 100% pelo WhatsApp). Restam as ações do
// devedor por link público (E7): /aviso/:token e /sair-lembretes/:token.
import { lazy } from 'react'

export const AcaoAvisoPage = lazy(() => import('./pages/AcaoAviso'))
export const SairLembretesPage = lazy(() => import('./pages/SairLembretes'))
