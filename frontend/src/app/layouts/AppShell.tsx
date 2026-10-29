// AppShell: layout autenticado (ver docs/pivot/mocks/shell/shell.html).
// Desktop: sidebar + topo (seletor de loja, estado ao vivo, sair). Mobile: topo + barra inferior
// com 4 areas fixas e "Mais". O conteudo (Outlet) so aparece com loja ativa; antes disso o shell
// mostra carregando, erro ou o estado "sem loja".
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { ChevronRight, LayoutDashboard, MoreHorizontal, PanelLeft, PanelLeftClose, Plus, Store } from 'lucide-react'
import { BotaoSair } from './BotaoSair'
import { SeletorLoja, useTenant } from '@/shared/tenant'
import { useEstadoRealtime } from '@/shared/realtime'
import { BellLogo, EmptyState, ErrorState, Skeleton, cn } from '@/shared/ui'
import { GRUPOS_NAV, ROTAS, type GrupoNav, type RotaModulo } from '../rotas'
import { useEhOperador } from '../sonda_operador'

const FOCO = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia'

/** Grupo do item cuja rota casa com o caminho atual (para manter a seção aberta). */
function useGrupoAtivo(): GrupoNav | undefined {
  const { pathname } = useLocation()
  return ROTAS.find((r) => pathname === `/${r.caminho}` || pathname.startsWith(`/${r.caminho}/`))?.grupo
}

/** Estado aberto/fechado de cada seção do menu, por visitante (tolera storage bloqueado). */
function useGruposAbertos() {
  const [abertos, setAbertos] = useState<Record<string, boolean>>(() => {
    const padrao = Object.fromEntries(GRUPOS_NAV.map((g) => [g.id, g.abertoPadrao ?? false]))
    try {
      const salvo = localStorage.getItem('whaviso:nav-grupos')
      if (salvo) return { ...padrao, ...(JSON.parse(salvo) as Record<string, boolean>) }
    } catch {
      /* storage indisponivel: usa o padrao */
    }
    return padrao
  })
  function alternar(id: GrupoNav) {
    setAbertos((prev) => {
      const nova = { ...prev, [id]: !prev[id] }
      try {
        localStorage.setItem('whaviso:nav-grupos', JSON.stringify(nova))
      } catch {
        /* storage indisponivel: so nao persiste */
      }
      return nova
    })
  }
  return { abertos, alternar }
}

function ItemNav({ rota, onNavegar }: { rota: RotaModulo; onNavegar?: () => void }) {
  const Icone = rota.icone
  return (
    <NavLink
      to={`/${rota.caminho}`}
      onClick={onNavegar}
      className={({ isActive }) =>
        cn(
          'flex min-h-11 items-center gap-3 rounded-[10px] px-3 py-2.5 font-medium',
          FOCO,
          isActive
            ? 'bg-cartao font-bold text-salvia shadow-[inset_0_0_0_1px_var(--color-linha)]'
            : 'text-tinta hover:bg-black/5',
        )
      }
    >
      <Icone className="size-5 flex-none" strokeWidth={1.75} aria-hidden />
      {rota.rotulo}
    </NavLink>
  )
}

/** Uma seção recolhível do menu lateral: cabeçalho (chevron + rótulo) + lista de itens.
 *  A seção da rota atual fica sempre aberta, para o usuário nunca "perder" onde está. */
function GrupoSecao({ id, rotulo, aberto, ativo, onAlternar }: { id: GrupoNav; rotulo: string; aberto: boolean; ativo: boolean; onAlternar: (id: GrupoNav) => void }) {
  const itens = ROTAS.filter((r) => r.grupo === id && !r.ocultoNoMenu)
  if (itens.length === 0) return null
  const expandido = aberto || ativo
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => onAlternar(id)}
        aria-expanded={expandido}
        className={cn(
          'flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider text-tinta-2 hover:bg-black/5 hover:text-tinta',
          FOCO,
        )}
      >
        <ChevronRight className={cn('size-3.5 flex-none transition-transform', expandido && 'rotate-90')} strokeWidth={2.5} aria-hidden />
        {rotulo}
      </button>
      {expandido && (
        <nav aria-label={rotulo} className="flex flex-col gap-0.5 pb-1">
          {itens.map((r) => (
            <ItemNav key={r.caminho} rota={r} />
          ))}
        </nav>
      )}
    </div>
  )
}

/** Link para o console da plataforma. So aparece para quem tambem e operador (sonda cacheada). */
function LinkConsole({ onNavegar }: { onNavegar?: () => void }) {
  const { data } = useEhOperador()
  if (!data) return null
  return (
    <NavLink
      to="/plataforma"
      onClick={onNavegar}
      className={cn('flex min-h-11 items-center gap-3 rounded-[10px] px-3 py-2.5 font-medium text-tinta hover:bg-black/5', FOCO)}
    >
      <LayoutDashboard className="size-5 flex-none" strokeWidth={1.75} aria-hidden />
      Console da plataforma
    </NavLink>
  )
}

function Sidebar({ onRecolher }: { onRecolher: () => void }) {
  const { abertos, alternar } = useGruposAbertos()
  const grupoAtivo = useGrupoAtivo()
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r border-linha bg-papel-2 px-3 py-4 md:flex">
      <div className="flex items-center gap-2.5 px-2.5 pb-4 font-display text-xl font-bold">
        <span className="flex size-[30px] items-center justify-center rounded-[9px] bg-salvia text-sobre-marca">
          <BellLogo className="size-5" />
        </span>
        Whaviso
        <button
          type="button"
          onClick={onRecolher}
          aria-label="Ocultar menu lateral"
          className={cn('ml-auto flex size-8 items-center justify-center rounded-lg text-tinta-2 hover:bg-black/5 hover:text-tinta', FOCO)}
        >
          <PanelLeftClose className="size-5" strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <div className="flex flex-col gap-0.5">
        {GRUPOS_NAV.map((g) => (
          <GrupoSecao key={g.id} id={g.id} rotulo={g.rotulo} aberto={abertos[g.id] ?? false} ativo={grupoAtivo === g.id} onAlternar={alternar} />
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-0.5">
        <LinkConsole />
        <BotaoSair />
      </div>
    </aside>
  )
}

function EstadoAoVivo() {
  const estado = useEstadoRealtime()
  const rotulo = { ao_vivo: 'Ao vivo', conectando: 'Conectando', reconectando: 'Reconectando', desligado: 'Offline' }[estado]
  const ok = estado === 'ao_vivo'
  return (
    <span
      role="status"
      className="inline-flex min-h-9 items-center gap-2 rounded-pill border border-linha bg-cartao px-3 py-1.5 text-[13px] text-tinta-2"
    >
      <span className={cn('size-2 rounded-full', ok ? 'bg-folha shadow-[0_0_0_3px_rgba(62,124,91,.18)]' : 'bg-ambar shadow-[0_0_0_3px_rgba(185,126,34,.2)]')} aria-hidden />
      <span className="max-md:sr-only">{rotulo}</span>
    </span>
  )
}

function BarraInferior() {
  const [aberto, setAberto] = useState(false)
  const { pathname } = useLocation()
  const fixas = ROTAS.filter((r) => r.fixoNoMobile).slice(0, 4)
  const resto = ROTAS.filter((r) => !fixas.includes(r) && !r.ocultoNoMenu)
  const restoAtivo = resto.some((r) => pathname.startsWith(`/${r.caminho}`))
  const painel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('keydown', tecla)
    painel.current?.querySelector<HTMLElement>('a')?.focus()
    return () => document.removeEventListener('keydown', tecla)
  }, [aberto])

  const itemBase = cn('relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium', FOCO)

  return (
    <>
      {aberto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-tinta/30" onClick={() => setAberto(false)} />
          <div
            ref={painel}
            role="dialog"
            aria-label="Mais áreas"
            className="animate-sheet absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-[20px] border-t border-linha bg-papel p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
          >
            {GRUPOS_NAV.map((g) => {
              const itens = resto.filter((r) => r.grupo === g.id)
              if (itens.length === 0) return null
              return (
                <nav key={g.id} aria-label={g.rotulo} className="mb-2 flex flex-col gap-0.5">
                  <p className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wider text-tinta-2">{g.rotulo}</p>
                  {itens.map((r) => (
                    <ItemNav key={r.caminho} rota={r} onNavegar={() => setAberto(false)} />
                  ))}
                </nav>
              )
            })}
            <LinkConsole onNavegar={() => setAberto(false)} />
            <BotaoSair aoAbrir={() => setAberto(false)} className="mt-2 w-full border-t border-linha pt-3" />
          </div>
        </div>
      )}
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-linha bg-papel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {fixas.map((r) => {
          const Icone = r.icone
          return (
            <NavLink key={r.caminho} to={`/${r.caminho}`} className={({ isActive }) => cn(itemBase, isActive ? 'font-bold text-salvia' : 'text-tinta-2')}>
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute top-0 h-[3px] w-7 rounded-b-[3px] bg-salvia" aria-hidden />}
                  <Icone className="size-5" strokeWidth={1.75} aria-hidden />
                  {r.rotulo}
                </>
              )}
            </NavLink>
          )
        })}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={aberto}
          onClick={() => setAberto(true)}
          className={cn(itemBase, restoAtivo ? 'font-bold text-salvia' : 'text-tinta-2')}
        >
          <MoreHorizontal className="size-5" strokeWidth={1.75} aria-hidden />
          Mais
        </button>
      </nav>
    </>
  )
}

function ConteudoComLoja() {
  const { status, lojaAtiva, lojas, erro, recarregar } = useTenant()

  if (status === 'carregando') {
    return (
      <div aria-busy="true" aria-label="Carregando" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="grid gap-3.5 rounded-card border border-linha bg-cartao p-5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-14" />
          </div>
        ))}
      </div>
    )
  }
  if (status === 'erro') {
    return <ErrorState aoTentarDeNovo={recarregar} descricao={erro instanceof Error ? erro.message : undefined} />
  }
  if (!lojaAtiva || lojas.length === 0) {
    // Onboarding minimo: a tela de criar loja e do FR-nucleo (modulo lojas).
    return (
      <EmptyState
        icone={<Store className="size-8" strokeWidth={1.75} aria-hidden />}
        titulo="Vamos criar sua primeira loja"
        descricao="Para começar, cadastre a loja do seu restaurante. Depois é só conectar o WhatsApp e montar o cardápio."
        acao={
          <span className="inline-flex items-center gap-2 text-sm text-tinta-2">
            <Plus className="size-4" aria-hidden />O cadastro de loja chega com o módulo de lojas.
          </span>
        }
      />
    )
  }
  return <Outlet />
}

/** Preferencia por-visitante da barra lateral (so conveniencia visual; tolera storage bloqueado). */
function useLateralAberta() {
  const [aberta, setAberta] = useState(() => {
    try {
      return localStorage.getItem('whaviso:lateral') !== 'fechada'
    } catch {
      return true
    }
  })
  function alternar() {
    setAberta((v) => {
      const nova = !v
      try {
        localStorage.setItem('whaviso:lateral', nova ? 'aberta' : 'fechada')
      } catch {
        /* storage indisponivel: so nao persiste */
      }
      return nova
    })
  }
  return { aberta, alternar }
}

export function AppShell() {
  const lateral = useLateralAberta()
  return (
    <div className={cn('grid min-h-dvh', lateral.aberta ? 'md:grid-cols-[248px_1fr]' : 'md:grid-cols-1')}>
      {lateral.aberta && <Sidebar onRecolher={lateral.alternar} />}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-[60px] items-center gap-3 border-b border-linha bg-papel/90 px-4 backdrop-blur md:px-6">
          {/* Com a lateral oculta, o botao de mostrar vive no header (desktop); quando aberta,
              o botao de recolher fica dentro da propria lateral, junto da marca. */}
          {!lateral.aberta && (
            <button
              type="button"
              onClick={lateral.alternar}
              aria-label="Mostrar menu lateral"
              aria-expanded={false}
              className={cn('hidden size-11 flex-none items-center justify-center rounded-full border border-linha bg-cartao text-tinta-2 hover:text-tinta md:inline-flex', FOCO)}
            >
              <PanelLeft className="size-5" strokeWidth={1.75} aria-hidden />
            </button>
          )}
          <div className="min-w-0 max-md:flex-1">
            <SeletorLoja />
          </div>
          <span className="flex-1 max-md:hidden" />
          <EstadoAoVivo />
        </header>
        {/* Conteudo ocupa ~90% da largura util, com ~5% de respiro de cada lado no desktop
            (no mobile mantem a goteira de 16px). As margens iguais ja centralizam. */}
        <main className="w-full px-4 pb-[calc(64px+32px)] pt-5 md:px-[5%] md:pb-12 md:pt-7">
          <ConteudoComLoja />
        </main>
      </div>
      <BarraInferior />
    </div>
  )
}
