// AppShell: layout autenticado. lg+: sidebar fixa editorial. <lg: topbar + bottom nav.
// A navegação é escolhida pela SEÇÃO da URL (/app, /meus, /admin), não pela role:
// o mesmo `user` transita entre as áreas. Um cross-link conecta /app↔/meus quando
// o usuário tem vínculo de devedor. Logout na sidebar (lg+) e na topbar (<lg).
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router'
import { LogOut, Inbox, LayoutDashboard } from 'lucide-react'
import { useAuth, useRole, useTemVinculoDevedor } from '@/shared/auth'
import { cn, BellLogo } from '@/shared/ui'
import { NAV_POR_SECAO, NAV_OWNER, secaoDaRota, rotaAtiva, type NavItem } from './nav'
import { AssinaturaBanner } from '../AssinaturaBanner'

export function AppShell() {
  const { signOut } = useAuth()
  const role = useRole()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { temVinculo } = useTemVinculoDevedor()

  const secao = secaoDaRota(pathname)
  const base = NAV_POR_SECAO[secao]
  // Cross-link entre as duas áreas do usuário: de /app mostra "Recebidos" só se
  // houver vínculo de devedor; de /meus sempre oferece voltar ao "Painel".
  const itens: NavItem[] =
    secao === 'app' && temVinculo
      ? [...base, { to: '/meus', label: 'Recebidos', icon: Inbox }]
      : secao === 'meus'
        ? [...base, { to: '/app', label: 'Painel', icon: LayoutDashboard }]
        : base

  // O owner enxerga a sidebar inteira (área de usuário + área admin), separadas
  // por uma divisória, em qualquer seção. Demais usuários veem só `itens`.
  const ehOwner = role === 'owner'

  // Item marcado: resolvido sobre TODOS os itens visíveis (no owner, os dois
  // grupos juntos), para que o "mais específico vence" valha entre eles também.
  const itensVisiveis = ehOwner
    ? [...NAV_OWNER.usuario, ...NAV_OWNER.admin]
    : itens
  const ativo = rotaAtiva(pathname, itensVisiveis)

  async function sair() {
    await signOut()
    navigate('/entrar', { replace: true })
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      {/* Sidebar (lg+) */}
      <aside className="hidden border-r border-linha bg-papel-2 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <Link to="/" className="flex items-center gap-2 px-6 py-6 text-salvia">
          <BellLogo className="size-6 text-dourado" />
          <span className="font-display text-xl font-semibold">whaviso</span>
        </Link>
        <nav className="flex flex-col gap-1 px-3">
          {ehOwner ? (
            <>
              {NAV_OWNER.usuario.map((item) => (
                <SidebarLink key={item.to} item={item} ativo={item.to === ativo} />
              ))}
              <hr className="my-2 border-linha" />
              {NAV_OWNER.admin.map((item) => (
                <SidebarLink key={item.to} item={item} ativo={item.to === ativo} />
              ))}
            </>
          ) : (
            itens.map((item) => (
              <SidebarLink key={item.to} item={item} ativo={item.to === ativo} />
            ))
          )}
        </nav>
        <button
          type="button"
          onClick={sair}
          className="mt-auto m-3 flex items-center gap-3 rounded-input px-3 py-2 text-sm text-tinta-2 transition-colors hover:bg-papel hover:text-tinta"
        >
          <LogOut strokeWidth={1.75} className="size-5" />
          Sair
        </button>
      </aside>

      {/* Topbar (<lg) */}
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between border-b border-linha bg-papel-2 px-4 py-3 text-salvia lg:hidden">
          <span className="flex items-center gap-2">
            <BellLogo className="size-5 text-dourado" />
            <span className="font-display text-lg font-semibold">whaviso</span>
          </span>
          <button
            type="button"
            onClick={sair}
            aria-label="Sair"
            className="flex items-center gap-1.5 text-sm text-tinta-2 hover:text-salvia"
          >
            <LogOut strokeWidth={1.75} className="size-5" />
          </button>
        </header>

        {/* Banner discreto de status da assinatura do cobrador (Fase 7). */}
        <AssinaturaBanner />

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-24 lg:pb-6">
          <Outlet />
        </main>

        {/* Bottom nav (<lg). Owner vê os dois grupos com um separador vertical. */}
        <nav className="fixed inset-x-0 bottom-0 z-10 flex overflow-x-auto border-t border-linha bg-cartao lg:hidden">
          {ehOwner ? (
            <>
              {NAV_OWNER.usuario.map((item) => (
                <BottomLink key={item.to} item={item} ativo={item.to === ativo} />
              ))}
              <span aria-hidden className="my-2 w-px shrink-0 bg-linha" />
              {NAV_OWNER.admin.map((item) => (
                <BottomLink key={item.to} item={item} ativo={item.to === ativo} />
              ))}
            </>
          ) : (
            itens.map((item) => (
              <BottomLink key={item.to} item={item} ativo={item.to === ativo} />
            ))
          )}
        </nav>
      </div>
    </div>
  )
}

// `ativo` é resolvido no AppShell (mais específico vence), não pelo isActive do
// NavLink, que marca por prefixo e acenderia "Avisos" junto com "Novo".
function SidebarLink({ item, ativo }: { item: NavItem; ativo: boolean }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={cn(
        'flex items-center gap-3 rounded-input px-3 py-2 text-sm transition-colors',
        ativo
          ? 'bg-salvia-claro font-medium text-salvia'
          : 'text-tinta-2 hover:bg-papel hover:text-tinta',
      )}
    >
      <Icon strokeWidth={1.75} className="size-5" />
      {item.label}
    </NavLink>
  )
}

function BottomLink({ item, ativo }: { item: NavItem; ativo: boolean }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={cn(
        'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs',
        ativo ? 'text-salvia' : 'text-tinta-2',
      )}
    >
      <Icon strokeWidth={1.75} className="size-5" />
      {item.label}
    </NavLink>
  )
}
