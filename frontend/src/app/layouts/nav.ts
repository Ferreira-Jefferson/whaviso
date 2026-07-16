import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  PlusCircle,
  UserCircle,
  History,
  BarChart3,
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

// A navegação é escolhida pela SEÇÃO da URL, não pela role: o mesmo `user`
// transita entre /app (avisos que gerencia) e /meus (avisos em que foi convidado
// a pagar). owner usa /admin. O cross-link entre /app e /meus é montado no
// AppShell conforme o vínculo de devedor (useTemVinculoDevedor).
export type Secao = 'app' | 'meus' | 'admin'

export function secaoDaRota(pathname: string): Secao {
  if (pathname.startsWith('/admin')) return 'admin'
  if (pathname.startsWith('/meus')) return 'meus'
  return 'app'
}

// Qual item do menu fica marcado para a rota atual. O `isActive` do NavLink marca
// por prefixo, então sem cuidado um pai acenderia junto com o filho. Regra: entre os
// itens que casam (exato, ou prefixo com borda de segmento), só o MAIS específico
// (maior `to`) fica ativo. `end` prende o item ao match exato (ex.: Painel em /app, que
// não acende em /app/avisos/novo). O detalhe /app/avisos/:id não casa nenhum item.
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
    // O Painel (/app) agora reúne totais + a lista de combinados (a antiga aba
    // "Avisos" saiu; /app/avisos redireciona para cá).
    { to: '/app', label: 'Painel', icon: LayoutDashboard, end: true },
    { to: '/app/avisos/novo', label: 'Novo', icon: PlusCircle },
    // E18: "Resultado" virou a área "Gestão" (abas Resultados/Clientes/Produtos/Categorias).
    // Sem `end`: acende também nas sub-rotas (/app/gestao/clientes etc.).
    { to: '/app/gestao', label: 'Gestão', icon: BarChart3 },
    { to: '/app/creditos', label: 'Créditos', icon: CreditCard },
    { to: '/app/conta', label: 'Conta', icon: UserCircle },
  ],
  meus: [
    { to: '/meus', label: 'Combinados', icon: LayoutDashboard, end: true },
    { to: '/meus/historico', label: 'Histórico', icon: History },
    { to: '/meus/conta', label: 'Conta', icon: UserCircle },
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
