import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  UserCircle,
  BarChart3,
  Bell,
  Send,
  FileText,
  Palette,
  CreditCard,
  Users,
  Smartphone,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

// A navegação é escolhida pela SEÇÃO da URL: /app (usuário) ou /admin (owner).
export type Secao = 'app' | 'admin'

export function secaoDaRota(pathname: string): Secao {
  if (pathname.startsWith('/admin')) return 'admin'
  return 'app'
}

// Qual item do menu fica marcado para a rota atual. O `isActive` do NavLink marca
// por prefixo, então sem cuidado um pai acenderia junto com o filho. Regra: entre os
// itens que casam (exato, ou prefixo com borda de segmento), só o MAIS específico
// (maior `to`) fica ativo. `end` prende o item ao match exato 
export function rotaAtiva(pathname: string, itens: NavItem[]): string | null {
  let melhor: string | null = null
  for (const { to, end } of itens) {
    const casa = end
      ? pathname === to
      : pathname === to || pathname.startsWith(to + '/')
    if (casa && (melhor === null || to.length > melhor.length)) melhor = to
  }
  return melhor
}

export const NAV_POR_SECAO: Record<Secao, NavItem[]> = {
  app: [
    // TODO(pivo): itens do app do restaurante (pedidos, cardápio...) ainda não existem.
    { to: '/app/categorias', label: 'Categorias', icon: LayoutDashboard },
    { to: '/app/notificacoes', label: 'Notificações', icon: Bell },
    { to: '/app/conta', label: 'Conta', icon: UserCircle },
  ],
  admin: [
    { to: '/admin', label: 'Métricas', icon: BarChart3, end: true },
    { to: '/admin/usuarios', label: 'Usuários', icon: Users },
    { to: '/admin/envios', label: 'Envios', icon: Send },
    { to: '/admin/templates', label: 'Templates', icon: FileText },
    { to: '/admin/creditos', label: 'Créditos', icon: CreditCard },
    { to: '/admin/whatsapp', label: 'WhatsApp', icon: Smartphone },
    // UI (design system) é referência interna: fica sempre por último.
    { to: '/admin/design', label: 'UI', icon: Palette },
  ],
}

// Nav do owner: ele usa a própria conta (não impersona ninguém), então enxerga
// a área de usuário comum E a área admin numa só sidebar, com uma divisória
// entre os dois grupos. Os mesmos botões que o user vê (a seção `app`) ficam em
// cima; a seção admin (os "a mais") fica embaixo da linha. O AppShell renderiza
// `usuario` e `admin` como dois blocos separados por <hr>.
export const NAV_OWNER: { usuario: NavItem[]; admin: NavItem[] } = {
  usuario: NAV_POR_SECAO.app,
  admin: NAV_POR_SECAO.admin,
}
