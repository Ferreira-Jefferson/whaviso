// Historico de versoes de um documento (somente leitura).
import { Badge, Dialog, ErrorState, Skeleton } from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import { useVersoes, type Documento } from '../api'
import { ROTULO_STATUS, TOM_STATUS } from '../estados'

export function DialogVersoes({ documento, onFechar }: { documento: Documento | null; onFechar: () => void }) {
  const versoes = useVersoes(documento?.id ?? null)
  return (
    <Dialog
      aberto={documento !== null}
      onFechar={onFechar}
      titulo={documento ? `Versões de "${documento.titulo}"` : 'Versões'}
      className="sm:max-w-xl"
    >
      {versoes.isPending && documento && <Skeleton className="h-24 w-full" />}
      {versoes.isError && <ErrorState aoTentarDeNovo={() => void versoes.refetch()} />}
      {versoes.isSuccess && (
        <ol className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
          {versoes.data.map((v) => (
            <li key={v.id} className="rounded-input border border-linha p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-tinta">Versão {v.versao}</span>
                <Badge tom={TOM_STATUS[v.status]}>{ROTULO_STATUS[v.status]}</Badge>
                <span className="text-xs text-tinta-2">{formatarDataHora(v.criado_em)}</span>
              </div>
              <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm text-tinta-2">{v.conteudo}</p>
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        onClick={onFechar}
        className="mt-4 min-h-11 w-full rounded-pill border border-linha bg-cartao text-sm font-medium text-tinta hover:bg-papel-2"
      >
        Fechar
      </button>
    </Dialog>
  )
}
