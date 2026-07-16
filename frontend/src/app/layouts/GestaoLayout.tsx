// E18: área "Gestão" com abas (Resultados, Clientes, Produtos, Categorias). Camada de app
// (compõe páginas de módulos distintos; nenhum módulo importa outro). O <Outlet/> NÃO é
// envolto em `.animate-rise`: o `transform` viraria bloco de contenção do position:fixed e
// prenderia os modais (produto/cliente) ao container em vez da viewport (ver ModalPortal).
import { NavLink, Outlet } from 'react-router'
import { BarChart3, Users, Package, Tags } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/shared/ui'

interface Aba {
  to: string
  label: string
  icon: LucideIcon
  /** `end` prende o item ao match exato (a aba Resultados vive no index /app/gestao). */
  end?: boolean
}

const ABAS: Aba[] = [
  { to: '/app/gestao', label: 'Resultados', icon: BarChart3, end: true },
  { to: '/app/gestao/clientes', label: 'Clientes', icon: Users },
  { to: '/app/gestao/produtos', label: 'Produtos', icon: Package },
  { to: '/app/gestao/categorias', label: 'Categorias', icon: Tags },
]

export function GestaoLayout() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl text-salvia">Gestão</h1>
        <p className="mt-1 text-sm text-tinta-2">
          O seu negócio num só lugar: resultados, clientes, produtos e categorias.
        </p>
      </header>

      {/* Barra de abas: role tablist visual; cada aba é um link com deep-link próprio. */}
      <nav
        aria-label="Abas de Gestão"
        className="mb-6 flex gap-1 overflow-x-auto border-b border-linha"
      >
        {ABAS.map((a) => {
          const Icone = a.icon
          return (
            <NavLink
              key={a.to}
              to={a.to}
              end={a.end}
              className={({ isActive }) =>
                cn(
                  'inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-salvia text-salvia'
                    : 'border-transparent text-tinta-2 hover:text-tinta',
                )
              }
            >
              <Icone strokeWidth={1.75} className="size-4" />
              {a.label}
            </NavLink>
          )
        })}
      </nav>

      <Outlet />
    </div>
  )
}
