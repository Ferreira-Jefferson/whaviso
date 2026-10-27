// OperadorShell: layout do console interno da equipe Whaviso (operador da plataforma).
// Diferente do AppShell: NAO tem seletor de loja, nao exige loja ativa e nao envia x-loja-id
// (as telas usam apiClient semLoja). A guarda RequireOperador decide quem entra; a seguranca
// real e a autorizacao por rota na api. Nav fixa: Painel, Clientes, Cobranca, Funil.
import { NavLink, Outlet } from 'react-router'
import { BarChart3, Filter, LogOut, Users, Wallet, type LucideIcon } from 'lucide-react'
import { useSessao } from '@/shared/auth'
import { BellLogo, cn } from '@/shared/ui'

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
  { caminho: 'funil', rotulo: 'Funil', icone: Filter },
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

function Sidebar() {
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
    </aside>
  )
}

export function OperadorShell() {
  const { signOut } = useSessao()
  return (
    <div className="grid min-h-dvh md:grid-cols-[248px_1fr]">
      <Sidebar />
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-[60px] items-center gap-3 border-b border-linha bg-papel/90 px-4 backdrop-blur md:px-6">
          <span className="font-display text-sm font-bold text-tinta-2">Console da plataforma</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => void signOut()}
            aria-label="Sair"
            className={cn('flex size-11 items-center justify-center rounded-full border border-linha bg-cartao text-tinta-2 hover:text-tinta', FOCO)}
          >
            <LogOut className="size-5" strokeWidth={1.75} aria-hidden />
          </button>
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
        </nav>
        <main className="w-full px-4 pb-12 pt-5 md:px-[5%] md:pt-7">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
