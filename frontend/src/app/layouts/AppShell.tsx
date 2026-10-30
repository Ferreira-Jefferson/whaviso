// AppShell: layout autenticado (ver docs/pivot/mocks/shell/shell.html).
// Desktop: sidebar + topo (seletor de loja, estado ao vivo, sair). Mobile: topo + barra inferior
// com 4 areas fixas e "Mais". O conteudo (Outlet) so aparece com loja ativa; antes disso o shell
// mostra carregando, erro ou o estado "sem loja".
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { ChevronRight, LayoutDashboard, MoreHorizontal, Plus, Store } from 'lucide-react'
import { BotaoSair } from './BotaoSair'
import { SeletorLoja, useTenant } from '@/shared/tenant'
import { useEstadoRealtime } from '@/shared/realtime'
import { BellLogo, Button, EmptyState, ErrorState, Skeleton, cn } from '@/shared/ui'
import { GRUPOS_NAV, ROTAS, podeVerRota, type GrupoNav, type RotaModulo } from '../rotas'
import { useEhOperador } from '../sonda_operador'
import { useMinhasPermissoes } from '@/modules/lojas/api'

const FOCO = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia'

/** Grupo do item cuja rota casa com o caminho atual (para manter a seção aberta). */
function useGrupoAtivo(): GrupoNav | undefined {
  const { pathname } = useLocation()
  return ROTAS.find((r) => pathname === `/${r.caminho}` || pathname.startsWith(`/${r.caminho}/`))?.grupo
}

/** Permissoes ':ver' do usuario na loja ativa. Devolve null enquanto a grade ainda nao chegou:
 *  nesse caso o menu mostra tudo, para nao esconder itens antes de saber. O servidor segue sendo a
 *  autoridade do acesso (nega com 403); isto so adapta o menu ao papel. */
function usePermissoesLojaAtiva(): Set<string> | null {
  const { lojaAtiva } = useTenant()
  const { data } = useMinhasPermissoes()
  if (!data || !lojaAtiva) return null
  return new Set(data[lojaAtiva.id] ?? [])
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
function GrupoSecao({ id, rotulo, aberto, ativo, onAlternar, granted }: { id: GrupoNav; rotulo: string; aberto: boolean; ativo: boolean; onAlternar: (id: GrupoNav) => void; granted: Set<string> | null }) {
  const itens = ROTAS.filter((r) => r.grupo === id && !r.ocultoNoMenu && podeVerRota(r, granted))
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
      Console
    </NavLink>
  )
}

function Sidebar({ onRecolher }: { onRecolher: () => void }) {
  const { abertos, alternar } = useGruposAbertos()
  const grupoAtivo = useGrupoAtivo()
  const granted = usePermissoesLojaAtiva()
  // O conteudo rola num div interno; o `aside` fica sem corte horizontal para o puxador da borda
  // (whv-edge) poder vazar 6px e pintar a linha verde no hover, igual ao trilho recolhido.
  return (
    <aside className="sticky top-0 hidden h-dvh border-r border-linha bg-papel-2 md:flex">
      <div className="flex flex-1 flex-col overflow-y-auto px-3 py-4">
        <div className="flex items-center gap-2.5 px-2.5 pb-4 font-display text-xl font-bold">
          <span className="flex size-[30px] flex-none items-center justify-center rounded-[9px] bg-salvia text-sobre-marca">
            <BellLogo className="size-5" />
          </span>
          Whaviso
        </div>
        <div className="flex flex-col gap-0.5">
          {GRUPOS_NAV.map((g) => (
            <GrupoSecao key={g.id} id={g.id} rotulo={g.rotulo} aberto={abertos[g.id] ?? false} ativo={grupoAtivo === g.id} onAlternar={alternar} granted={granted} />
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-0.5">
          <LinkConsole />
          <BotaoSair />
        </div>
      </div>
      {/* Puxador de recolher: a borda direita inteira. Hover-intent no CSS (whv-edge): a cor so troca
          para verde depois de ~0,3s pousado; clicar em qualquer ponto recolhe. */}
      <div
        className="whv-edge absolute right-[-6px] top-0 z-[16] h-full w-3.5 cursor-pointer"
        role="button"
        tabIndex={0}
        title="Recolher menu"
        aria-label="Ocultar menu lateral"
        onClick={onRecolher}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onRecolher()
          }
        }}
      />
    </aside>
  )
}

/** Lateral recolhida: um trilho fino (estilo Ubuntu) com o logo no topo e um icone por grupo.
 *  Passar o mouse num icone abre um balao com os subitens daquele grupo; ao sair do icone, o balao
 *  so fecha depois de uma carencia (CARENCIA_MS), cancelada se o mouse alcancar o balao ou a ponte
 *  invisivel ao lado, para o subitem seguir acessivel na diagonal, devagar ou rapido. A borda direita
 *  inteira e o puxador de expandir (hover-intent no CSS: a cor so troca depois de ~0,3s pousado). */
const CARENCIA_MS = 290
function RailColapsado({ onExpandir }: { onExpandir: () => void }) {
  const grupoAtivo = useGrupoAtivo()
  const granted = usePermissoesLojaAtiva()
  const navegar = useNavigate()
  const [aberto, setAberto] = useState<GrupoNav | null>(null)
  const timer = useRef<number | null>(null)

  const cancelar = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }
  const agendarFechar = () => {
    cancelar()
    timer.current = window.setTimeout(() => setAberto(null), CARENCIA_MS)
  }
  useEffect(() => cancelar, [])

  const grupos = GRUPOS_NAV.map((g) => ({
    ...g,
    itens: ROTAS.filter((r) => r.grupo === g.id && !r.ocultoNoMenu && podeVerRota(r, granted)),
  })).filter((g) => g.itens.length > 0)

  return (
    <aside className="sticky top-0 hidden h-dvh flex-col items-center gap-1 overflow-visible border-r border-linha bg-papel-2 py-3 md:flex">
      <span className="mb-2.5 flex size-[30px] flex-none items-center justify-center rounded-[9px] bg-salvia text-sobre-marca">
        <BellLogo className="size-5" />
      </span>
      {grupos.map((g) => {
        const Icone = g.icone
        const estaAberto = aberto === g.id
        const ehAtivo = grupoAtivo === g.id
        const primeiro = g.itens[0]
        return (
          <div
            key={g.id}
            className="relative"
            onMouseEnter={() => {
              cancelar()
              setAberto(g.id)
            }}
            onMouseLeave={agendarFechar}
            onFocus={() => {
              cancelar()
              setAberto(g.id)
            }}
            onBlur={agendarFechar}
          >
            <button
              type="button"
              onClick={() => primeiro && navegar(`/${primeiro.caminho}`)}
              aria-label={g.rotulo}
              aria-haspopup="menu"
              aria-expanded={estaAberto}
              className={cn(
                'flex size-10 items-center justify-center rounded-[11px]',
                FOCO,
                ehAtivo
                  ? 'bg-cartao text-salvia shadow-[inset_0_0_0_1px_var(--color-linha)]'
                  : 'text-tinta-2 hover:bg-black/5 hover:text-tinta',
              )}
            >
              <Icone className="size-5" strokeWidth={1.75} aria-hidden />
            </button>
            <div
              role="menu"
              aria-label={g.rotulo}
              data-aberto={estaAberto}
              className="whv-pop absolute left-[46px] top-[-8px] z-30 min-w-[184px] rounded-[14px] border border-linha bg-cartao p-[7px] shadow-[0_10px_30px_-8px_rgba(32,50,42,.28),0_2px_8px_rgba(32,50,42,.08)]"
            >
              <p className="px-[9px] pb-1.5 pt-[5px] text-[10.5px] font-bold uppercase tracking-wider text-tinta-2">{g.rotulo}</p>
              {g.itens.map((r) => {
                const IconeItem = r.icone
                return (
                  <NavLink
                    key={r.caminho}
                    to={`/${r.caminho}`}
                    role="menuitem"
                    onClick={() => setAberto(null)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 whitespace-nowrap rounded-[9px] px-[9px] py-[7px] text-[13px] font-medium',
                        FOCO,
                        isActive ? 'bg-salvia-claro font-bold text-salvia' : 'text-tinta hover:bg-black/5',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <IconeItem className={cn('size-4 flex-none', isActive ? 'text-salvia' : 'text-tinta-2')} strokeWidth={1.75} aria-hidden />
                        {r.rotulo}
                      </>
                    )}
                  </NavLink>
                )
              })}
            </div>
          </div>
        )
      })}
      <div
        className="whv-edge absolute right-[-6px] top-0 z-[16] h-full w-3.5 cursor-pointer"
        role="button"
        tabIndex={0}
        title="Expandir menu"
        aria-label="Mostrar menu lateral"
        onClick={onExpandir}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onExpandir()
          }
        }}
      />
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
  const granted = usePermissoesLojaAtiva()
  const visiveis = ROTAS.filter((r) => !r.ocultoNoMenu && podeVerRota(r, granted))
  const fixas = visiveis.filter((r) => r.fixoNoMobile).slice(0, 4)
  const resto = visiveis.filter((r) => !fixas.includes(r))
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
  const { status, lojaAtiva, lojas, erro, recarregar, lojaSemeada } = useTenant()
  const { pathname } = useLocation()
  const navegar = useNavigate()

  // Loja salva semeia o x-loja-id: monta a pagina ja, em paralelo com /lojas.
  if (status === 'carregando' && lojaSemeada) return <Outlet />
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
    // A tela de Lojas gere o proprio estado "sem loja" (cadastro da 1a loja, com o modal). As demais
    // telas exigem loja: mostram o vazio e levam o dono para /lojas com o cadastro ja aberto.
    if (pathname === '/lojas' || pathname.startsWith('/lojas/')) return <Outlet />
    return (
      <EmptyState
        icone={<Store className="size-8" strokeWidth={1.75} aria-hidden />}
        titulo="Nenhuma loja definida"
        acao={
          <Button type="button" onClick={() => navegar('/lojas?novo=1')}>
            <Plus className="size-4" aria-hidden />
            Criar loja
          </Button>
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
    <div className={cn('grid min-h-dvh', lateral.aberta ? 'md:grid-cols-[248px_1fr]' : 'md:grid-cols-[60px_1fr]')}>
      {lateral.aberta ? <Sidebar onRecolher={lateral.alternar} /> : <RailColapsado onExpandir={lateral.alternar} />}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-[60px] items-center gap-3 border-b border-linha bg-papel/90 px-4 backdrop-blur md:px-6">
          {/* Marca e os controles da lateral (recolher/expandir) vivem na propria lateral: aberta, no
              cabecalho da sidebar; recolhida, no logo do trilho e no puxador da borda direita. */}
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
