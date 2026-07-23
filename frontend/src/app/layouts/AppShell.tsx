// AppShell: layout autenticado. lg+: sidebar fixa editorial. <lg: topbar + bottom nav.
// A navegação é escolhida pela SEÇÃO da URL (/app, /meus, /admin), não pela role:
// o mesmo `user` transita entre as áreas. Um cross-link conecta /app↔/meus quando
// o usuário tem vínculo de devedor. Logout na sidebar (lg+) e na topbar (<lg).
import { useEffect, useRef, useState } from 'react'
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router'
import { LogOut, Inbox, LayoutDashboard, MoreHorizontal, X } from 'lucide-react'
import { useAuth, useRole, useTemVinculoDevedor } from '@/shared/auth'
import { cn, BellLogo } from '@/shared/ui'
import { SinoNotificacoes } from '@/modules/notificacoes'
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

  // Navegação mobile: a barra de baixo só comporta ~5 alvos sem apertar o rótulo.
  // Acima disso (caso do owner, que soma área de usuário + admin), a barra mostra
  // no máximo 4 itens contextuais + um botão "Mais" que abre a folha com o menu
  // completo agrupado. Fecha ao navegar (fechamento em cada link) ou no backdrop/Esc.
  const [menuAberto, setMenuAberto] = useState(false)
  // Grupos do menu completo (folha). Owner vê os dois blocos; demais, um só.
  const grupos: { titulo?: string; itens: NavItem[] }[] = ehOwner
    ? [
        { titulo: 'Minha conta', itens: NAV_OWNER.usuario },
        { titulo: 'Administração', itens: NAV_OWNER.admin },
      ]
    : [{ itens }]
  const totalItens = grupos.reduce((n, g) => n + g.itens.length, 0)
  const mostrarMais = totalItens > 5
  // Os 4 itens em destaque na barra: para o owner, os da seção atual; para os
  // demais, os primeiros de `itens` (só cortamos quando não cabem todos).
  const itensBarra: NavItem[] = ehOwner
    ? (secao === 'admin' ? NAV_OWNER.admin : itens).slice(0, 4)
    : mostrarMais
      ? itens.slice(0, 4)
      : itens
  // "Mais" acende quando o item ativo não está entre os visíveis na barra.
  const ativoForaDaBarra = ativo !== null && !itensBarra.some((i) => i.to === ativo)

  async function sair() {
    await signOut()
    navigate('/entrar', { replace: true })
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      {/* Sidebar (lg+) */}
      <aside className="hidden border-r border-linha bg-papel-2 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="flex items-center justify-between px-6 py-6">
          <Link to="/" className="flex items-center gap-2 text-salvia">
            <BellLogo className="size-6 text-dourado" />
            <span className="font-display text-xl font-semibold">whaviso</span>
          </Link>
          <SinoNotificacoes />
        </div>
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
          <span className="flex items-center gap-1">
            <SinoNotificacoes />
            <button
              type="button"
              onClick={sair}
              aria-label="Sair"
              className="flex items-center gap-1.5 p-2 text-sm text-tinta-2 hover:text-salvia"
            >
              <LogOut strokeWidth={1.75} className="size-5" />
            </button>
          </span>
        </header>

        {/* Banner discreto de status da assinatura do cobrador (Fase 7). */}
        <AssinaturaBanner />

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-24 lg:pb-6">
          <Outlet />
        </main>

        {/* Bottom nav (<lg): até 4 itens + "Mais" (folha) quando não cabe tudo. */}
        <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-linha bg-cartao lg:hidden">
          {itensBarra.map((item) => (
            <BottomLink key={item.to} item={item} ativo={item.to === ativo} />
          ))}
          {mostrarMais && (
            <button
              type="button"
              onClick={() => setMenuAberto(true)}
              aria-haspopup="dialog"
              aria-expanded={menuAberto}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs',
                ativoForaDaBarra ? 'text-salvia' : 'text-tinta-2',
              )}
            >
              <MoreHorizontal strokeWidth={1.75} className="size-5" />
              Mais
            </button>
          )}
        </nav>
      </div>

      {/* Folha do menu completo (mobile), aberta pelo botão "Mais". */}
      <MenuSheet
        aberto={menuAberto}
        onFechar={() => setMenuAberto(false)}
        grupos={grupos}
        ativo={ativo}
        onSair={sair}
      />
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

// Folha (bottom sheet) com o menu completo, aberta pelo botão "Mais" no mobile.
// Espelha o <dialog> nativo do design system (Dialog.tsx): fecha em Esc/backdrop
// de graça; aqui fica ancorada ao rodapé, largura total, cantos arredondados no topo.
function MenuSheet({
  aberto,
  onFechar,
  grupos,
  ativo,
  onSair,
}: {
  aberto: boolean
  onFechar: () => void
  grupos: { titulo?: string; itens: NavItem[] }[]
  ativo: string | null
  onSair: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (aberto && !el.open) el.showModal()
    else if (!aberto && el.open) el.close()
  }, [aberto])

  return (
    <dialog
      ref={ref}
      aria-label="Menu"
      onClose={onFechar}
      onCancel={onFechar}
      onClick={(e) => {
        if (e.target === ref.current) onFechar()
      }}
      className={cn(
        'mx-auto mb-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-card',
        'border-t border-linha bg-cartao',
        'p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-tinta backdrop:bg-tinta/30',
        aberto && 'animate-sheet',
        'lg:hidden',
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="font-display text-lg font-semibold text-salvia">Menu</span>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar menu"
          className="rounded-input p-1 text-tinta-2 hover:bg-papel hover:text-tinta"
        >
          <X strokeWidth={1.75} className="size-5" />
        </button>
      </div>

      {grupos.map((grupo, i) => (
        <div key={grupo.titulo ?? i} className={cn(i > 0 && 'mt-4 border-t border-linha pt-4')}>
          {grupo.titulo && (
            <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-tinta-2">
              {grupo.titulo}
            </p>
          )}
          <div className="flex flex-col gap-0.5">
            {grupo.itens.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onFechar}
                  className={cn(
                    'flex items-center gap-3 rounded-input px-3 py-3 text-sm transition-colors',
                    item.to === ativo
                      ? 'bg-salvia-claro font-medium text-salvia'
                      : 'text-tinta-2 hover:bg-papel hover:text-tinta',
                  )}
                >
                  <Icon strokeWidth={1.75} className="size-5" />
                  {item.label}
                </NavLink>
              )
            })}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => {
          onFechar()
          onSair()
        }}
        className="mt-4 flex w-full items-center gap-3 rounded-input border-t border-linha px-3 py-3 pt-4 text-sm text-tinta-2 transition-colors hover:bg-papel hover:text-tinta"
      >
        <LogOut strokeWidth={1.75} className="size-5" />
        Sair
      </button>
    </dialog>
  )
}
