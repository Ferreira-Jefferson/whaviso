// TableResponsive: tabela em desktop (>=md) e cards empilhados em mobile,
// SEM scroll horizontal (plano seção 7). Genérico na linha.
//
// Cada coluna define como renderizar a célula; no mobile o rótulo da coluna
// aparece ao lado do valor (exceto colunas marcadas como `principal`, que
// viram o título do card). Uma linha inteira pode ser clicável (onRowClick).
import { Fragment, type ReactNode } from 'react'
import { cn } from './cn'

export interface ColunaTabela<L> {
  /** Chave estável da coluna. */
  chave: string
  /** Cabeçalho da coluna (desktop) e rótulo no card (mobile). */
  titulo: string
  /** Renderiza a célula para uma linha. */
  render: (linha: L) => ReactNode
  /** Coluna-título do card no mobile (sem rótulo). */
  principal?: boolean
  /** Esconde o rótulo no mobile (ex.: badge/ação que se explica). */
  ocultarRotuloMobile?: boolean
  /** Alinhamento do conteúdo na coluna (desktop). */
  alinhar?: 'esquerda' | 'direita'
}

interface TableResponsiveProps<L> {
  colunas: ReadonlyArray<ColunaTabela<L>>
  linhas: ReadonlyArray<L>
  chaveLinha: (linha: L) => string
  /** Torna a linha/card clicável. */
  onRowClick?: (linha: L) => void
  /** Rótulo acessível da tabela. */
  legenda: string
}

export function TableResponsive<L>({
  colunas,
  linhas,
  chaveLinha,
  onRowClick,
  legenda,
}: TableResponsiveProps<L>) {
  const clicavel = Boolean(onRowClick)

  return (
    <>
      {/* Desktop: tabela */}
      <table className="hidden w-full border-collapse text-sm md:table">
        <caption className="sr-only">{legenda}</caption>
        <thead>
          <tr className="border-b border-linha text-left text-xs uppercase tracking-wide text-tinta-2">
            {colunas.map((c) => (
              <th
                key={c.chave}
                scope="col"
                className={cn(
                  'px-3 py-2 font-medium',
                  c.alinhar === 'direita' && 'text-right',
                )}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr
              key={chaveLinha(linha)}
              onClick={onRowClick ? () => onRowClick(linha) : undefined}
              className={cn(
                'border-b border-linha last:border-0',
                clicavel && 'cursor-pointer transition-colors hover:bg-papel-2',
              )}
            >
              {colunas.map((c) => (
                <td
                  key={c.chave}
                  className={cn(
                    'px-3 py-3 text-tinta',
                    c.alinhar === 'direita' && 'text-right',
                  )}
                >
                  {c.render(linha)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile: cards */}
      <ul className="flex flex-col gap-3 md:hidden">
        {linhas.map((linha) => {
          const conteudo = (
            <Fragment>
              {colunas.map((c) =>
                c.principal ? (
                  <div key={c.chave} className="text-base text-tinta">
                    {c.render(linha)}
                  </div>
                ) : (
                  <div
                    key={c.chave}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    {!c.ocultarRotuloMobile && (
                      <span className="text-tinta-2">{c.titulo}</span>
                    )}
                    <span
                      className={cn(
                        'text-tinta',
                        c.ocultarRotuloMobile && 'ml-auto',
                      )}
                    >
                      {c.render(linha)}
                    </span>
                  </div>
                ),
              )}
            </Fragment>
          )
          return (
            <li key={chaveLinha(linha)}>
              {onRowClick ? (
                <button
                  type="button"
                  onClick={() => onRowClick(linha)}
                  className="flex w-full flex-col gap-2 rounded-card border border-linha bg-cartao p-4 text-left transition-colors hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
                >
                  {conteudo}
                </button>
              ) : (
                <div className="flex flex-col gap-2 rounded-card border border-linha bg-cartao p-4">
                  {conteudo}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
