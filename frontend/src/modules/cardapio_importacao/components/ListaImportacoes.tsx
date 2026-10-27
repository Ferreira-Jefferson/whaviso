// Historico de importacoes da loja: status em tempo quase real (polling no hook) e atalho para abrir.
import { FileText, Image as ImagemIcone } from 'lucide-react'
import { Badge, EmptyState, ErrorState, Skeleton, cn } from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import { useImportacoes } from '../api'
import { ROTULO_STATUS, TOM_STATUS, formatarTamanho } from '../estados'

interface Props {
  selecionada: string | null
  aoAbrir: (id: string) => void
}

export function ListaImportacoes({ selecionada, aoAbrir }: Props) {
  const consulta = useImportacoes()
  const lista = consulta.data ?? []

  if (consulta.isPending) {
    return (
      <div aria-busy="true" aria-label="Carregando importações" className="grid gap-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }
  if (consulta.isError) return <ErrorState aoTentarDeNovo={() => void consulta.refetch()} />
  if (lista.length === 0) {
    return (
      <EmptyState
        titulo="Nenhuma importação ainda"
        descricao="Envie a foto ou o PDF do cardápio para começar."
      />
    )
  }

  return (
    <ul className="grid gap-2" aria-label="Importações anteriores">
      {lista.map((i) => {
        const Icone = i.tipo_arquivo === 'pdf' ? FileText : ImagemIcone
        return (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => aoAbrir(i.id)}
              aria-current={selecionada === i.id || undefined}
              className={cn(
                'flex w-full items-center gap-3 rounded-card border bg-cartao p-3 text-left transition-colors hover:bg-papel-2',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia',
                selecionada === i.id ? 'border-salvia' : 'border-linha',
              )}
            >
              <Icone strokeWidth={1.75} className="size-5 flex-none text-tinta-2" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-tinta">{formatarDataHora(i.criado_em)}</span>
                <span className="block text-xs text-tinta-2">
                  {i.tipo_arquivo === 'pdf' ? 'PDF' : 'Foto'} · {formatarTamanho(i.tamanho_bytes)}
                </span>
              </span>
              <Badge tom={TOM_STATUS[i.status]}>{ROTULO_STATUS[i.status]}</Badge>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
