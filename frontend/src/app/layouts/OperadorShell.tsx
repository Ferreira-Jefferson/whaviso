// OperadorShell: layout do console interno da equipe Whaviso (operador da plataforma).
// Diferente do AppShell: NAO tem seletor de loja, nao exige loja ativa e nao envia x-loja-id
// (as telas usam apiClient semLoja). A guarda RequireOperador decide quem entra; a seguranca
// real e a autorizacao por rota na api. Nav fixa: Painel, Clientes, Cobranca, Planos, Funil, Acessos.
import { NavLink, Outlet } from 'react-router'
import { BarChart3, Filter, Package, ShieldCheck, Store, Users, Wallet, type LucideIcon } from 'lucide-react'
import { BotaoSair } from './BotaoSair'
import { useTenant } from '@/shared/tenant'
import { BellLogo, cn } from '@/shared/ui'
import { ROTA_INICIAL } from '../rotas'

const FOCO = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia'

interface ItemOperador {
  caminho: string
  rotulo: string
  icone: LucideIcon
}

const NAV_OPERADOR: readonly ItemOperador[] = [
  { caminho: 'painel', rotulo: 'Painel', icone: BarChart3 },
  { caminho: 'clientes', rotulo: 'Clientes', icone: Users },
  { caminho: 'cobranca', rotulo: 'Cobrança', icone: Wallet },
  { caminho: 'planos', rotulo: 'Planos', icone: Package },
  { caminho: 'funil', rotulo: 'Funil', icone: Filter },
  // So admin acessa (a api responde 403 aos demais; a tela mostra acesso restrito).
  { caminho: 'acessos', rotulo: 'Acessos', icone: ShieldCheck },
]

function ItemNav({ item }: { item: ItemOperador }) {
  const Icone = item.icone
  return (
    <NavLink
      to={`/plataforma/${item.caminho}`}
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
      {item.rotulo}
    </NavLink>
  )
}

/** "Ver loja": so para quem e membro de alguma loja (operador puro nao ve). */
function useTemLoja(): boolean {
  const { status, lojas } = useTenant()
  return status === 'ok' && lojas.length > 0
}

function LinkVerLoja({ className }: { className?: string }) {
  return (
    <NavLink to={ROTA_INICIAL} className={cn('flex min-h-11 items-center gap-3 rounded-[10px] px-3 py-2.5 font-medium text-tinta hover:bg-black/5', FOCO, className)}>
      <Store className="size-5 flex-none" strokeWidth={1.75} aria-hidden />
      Ver loja
    </NavLink>
  )
}

function Sidebar() {
  const temLoja = useTemLoja()
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r border-linha bg-papel-2 px-3 py-4 md:flex">
      <div className="flex items-center gap-2.5 px-2.5 pb-4 font-display text-xl font-bold">
        <span className="flex size-[30px] items-center justify-center rounded-[9px] bg-salvia text-sobre-marca">
          <BellLogo className="size-5" />
        </span>
        Whaviso
      </div>
      <p className="px-3 pb-1.5 text-xs font-bold uppercase tracking-wider text-tinta-2">Plataforma</p>
      <nav aria-label="Console do operador" className="flex flex-col gap-0.5">
        {NAV_OPERADOR.map((item) => (
          <ItemNav key={item.caminho} item={item} />
        ))}
      </nav>
      {temLoja && <LinkVerLoja className="mt-auto" />}
      <BotaoSair className={temLoja ? undefined : 'mt-auto'} />
    </aside>
  )
}

export function OperadorShell() {
  const temLoja = useTemLoja()
  return (
    <div className="grid min-h-dvh md:grid-cols-[248px_1fr]">
      <Sidebar />
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-[60px] items-center gap-3 border-b border-linha bg-papel/90 px-4 backdrop-blur md:px-6">
          <span className="font-display text-sm font-bold text-tinta-2">Console da plataforma</span>
          <span className="flex-1" />
        </header>
        {/* Mobile: nav horizontal rolavel (sem barra inferior; console e desktop-first). */}
        <nav
          aria-label="Console do operador"
          className="sticky top-[60px] z-10 flex gap-1 overflow-x-auto border-b border-linha bg-papel/95 px-4 py-2 backdrop-blur md:hidden"
        >
          {NAV_OPERADOR.map((item) => (
            <NavLink
              key={item.caminho}
              to={`/plataforma/${item.caminho}`}
              className={({ isActive }) =>
                cn('whitespace-nowrap rounded-pill border px-3 py-1.5 text-sm font-medium', FOCO, isActive ? 'border-salvia bg-cartao text-salvia' : 'border-linha text-tinta-2')
              }
            >
              {item.rotulo}
            </NavLink>
          ))}
          {temLoja && (
            <NavLink to={ROTA_INICIAL} className={cn('whitespace-nowrap rounded-pill border border-linha px-3 py-1.5 text-sm font-medium text-tinta-2', FOCO)}>
              Ver loja
            </NavLink>
          )}
          <BotaoSair aoAbrir={undefined} className="shrink-0" />
        </nav>
        <main className="w-full px-4 pb-12 pt-5 md:px-[5%] md:pt-7">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
