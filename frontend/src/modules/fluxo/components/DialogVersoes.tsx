// Historico de versoes do fluxo. Restaurar cria um novo rascunho a partir da versao escolhida.
import { Badge, Button, Dialog, ErrorState, Skeleton } from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import { useVersoes, type ResumoVersao } from '../api'
import { ROTULO_VERSAO, TOM_VERSAO } from '../estados'

interface Props {
  fluxoId: string | null
  restaurando: boolean
  onRestaurar: (v: ResumoVersao) => void
  onFechar: () => void
}

export function DialogVersoes({ fluxoId, restaurando, onRestaurar, onFechar }: Props) {
  const versoes = useVersoes(fluxoId)
  return (
    <Dialog aberto={fluxoId !== null} onFechar={onFechar} titulo="Versões do fluxo" className="sm:max-w-xl">
      {versoes.isPending && fluxoId && <Skeleton className="h-24 w-full" />}
      {versoes.isError && <ErrorState aoTentarDeNovo={() => void versoes.refetch()} />}
      {versoes.isSuccess && (
        <ol className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {versoes.data.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-input border border-linha p-3">
              <span className="font-medium text-tinta">Versão {v.versao}</span>
              <Badge tom={TOM_VERSAO[v.status]}>{ROTULO_VERSAO[v.status]}</Badge>
              <span className="min-w-0 flex-1 text-xs text-tinta-2">
                {v.publicada_em ? `publicada em ${formatarDataHora(v.publicada_em)}` : `criada em ${formatarDataHora(v.criado_em)}`}
              </span>
              {v.status !== 'rascunho' && (
                <Button variante="secondary" disabled={restaurando} onClick={() => onRestaurar(v)}>
                  Restaurar
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
      <Button variante="secondary" className="mt-4 w-full" onClick={onFechar}>
        Fechar
      </Button>
    </Dialog>
  )
}
