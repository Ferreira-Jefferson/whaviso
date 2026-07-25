import { lazy } from 'react'

// Diferente do resto do módulo (que exporta a página lazy, como os demais módulos), o
// sino é um componente do HEADER COMUM (AppShell), sempre montado, não uma rota;
// exportado direto (sem lazy).
export { SinoNotificacoes } from './components/SinoNotificacoes'

// /app/notificacoes (H10.10): "precisa de você" (H9.2) + histórico completo paginado.
export const NotificacoesPage = lazy(() => import('./pages/Notificacoes'))
