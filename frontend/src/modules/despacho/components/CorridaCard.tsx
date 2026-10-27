// Card de uma corrida (1 motoboy, N pedidos, ordem de parada). Em `montando` da para trocar o
// motoboy, reordenar (subir/descer), remover paradas, despachar ou cancelar; em `despachada`
// da para concluir. As regras (409/422) sao da api: a mensagem volta num Banner no card.
import { useState } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { formatarCentavos, formatarHora } from '@/shared/format'
import { Badge, Banner, Button, Card, ConfirmDialog, Select, useToast } from '@/shared/ui'
import {
  useAcaoCorrida,
  useReordenarParadas,
  useRemoverPedidoDaCorrida,
  useTrocarMotoboyDaCorrida,
  type AcaoCorrida,
  type Corrida,
  type MotoboyCarga,
} from '../api'
import { ROTULO_ESTADO_CORRIDA, estadoDaCorrida } from '../estados'

interface Props {
  corrida: Corrida
  motoboys: ReadonlyArray<MotoboyCarga>
}

const TOM = { montando: 'atencao', despachada: 'marca', concluida: 'sucesso', cancelada: 'neutro' } as const

const TEXTO_SUCESSO: Record<AcaoCorrida, string> = {
  despachar: 'Corrida despachada.',
  concluir: 'Corrida concluída.',
  cancelar: 'Corrida cancelada.',
}

function mensagem(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}

export function CorridaCard({ corrida, motoboys }: Props) {
  const estado = estadoDaCorrida(corrida)
  const editavel = estado === 'montando'
  const paradas = [...corrida.paradas].sort((a, b) => (a.ordem_parada ?? 0) - (b.ordem_parada ?? 0))

  const [erro, setErro] = useState<string | null>(null)
  const [confirmarCancelar, setConfirmarCancelar] = useState(false)
  const acao = useAcaoCorrida()
  const reordenar = useReordenarParadas()
  const remover = useRemoverPedidoDaCorrida()
  const trocarMotoboy = useTrocarMotoboyDaCorrida()
  const { mostrarToast } = useToast()
  const ocupado = acao.isPending || reordenar.isPending || remover.isPending || trocarMotoboy.isPending

  function executar(a: AcaoCorrida) {
    setErro(null)
    acao.mutate(
      { corridaId: corrida.id, acao: a },
      {
        onSuccess: () => {
          setConfirmarCancelar(false)
          mostrarToast(TEXTO_SUCESSO[a], { tom: 'sucesso' })
        },
        onError: (e) => {
          setConfirmarCancelar(false)
          setErro(mensagem(e, 'Não foi possível concluir a ação.'))
        },
      },
    )
  }

  function mover(indice: number, delta: -1 | 1) {
    const ids = paradas.map((p) => p.pedido_id)
    const alvo = indice + delta
    if (alvo < 0 || alvo >= ids.length) return
    ;[ids[indice], ids[alvo]] = [ids[alvo]!, ids[indice]!]
    setErro(null)
    reordenar.mutate(
      { corridaId: corrida.id, pedidoIds: ids },
      { onError: (e) => setErro(mensagem(e, 'Não foi possível reordenar as paradas.')) },
    )
  }

  function tirar(pedidoId: string) {
    setErro(null)
    remover.mutate(
      { corridaId: corrida.id, pedidoId },
      { onError: (e) => setErro(mensagem(e, 'Não foi possível tirar o pedido da corrida.')) },
    )
  }

  function trocar(motoboyId: string) {
    if (motoboyId === '') return
    setErro(null)
    trocarMotoboy.mutate(
      { corridaId: corrida.id, motoboyId },
      { onError: (e) => setErro(mensagem(e, 'Não foi possível definir o motoboy.')) },
    )
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2 text-base font-medium text-tinta">
            {corrida.motoboy_nome ?? 'Sem motoboy'}
            <Badge tom={TOM[estado]}>{ROTULO_ESTADO_CORRIDA[estado]}</Badge>
            {corrida.sugerida && <Badge tom="marca">Sugerida</Badge>}
          </span>
          <span className="text-xs text-tinta-2">
            {paradas.length} {paradas.length === 1 ? 'parada' : 'paradas'}
            {corrida.despachada_em ? ` · saiu às ${formatarHora(corrida.despachada_em)}` : ''}
          </span>
        </div>
        <span className="tabular text-sm text-tinta-2">
          Motoboy recebe <strong className="text-tinta">{formatarCentavos(corrida.valor_motoboy_total_centavos)}</strong>
        </span>
      </div>

      {editavel && (
        <Select
          ariaLabel="Motoboy da corrida"
          value={corrida.motoboy_id ?? ''}
          onChange={trocar}
          disabled={ocupado}
          options={[
            { value: '', label: 'Escolher motoboy' },
            ...motoboys.map((m) => ({ value: m.id, label: m.nome })),
          ]}
        />
      )}

      {paradas.length === 0 ? (
        <p className="rounded-input border border-dashed border-linha px-3 py-4 text-center text-sm text-tinta-2">
          Corrida vazia. Selecione pedidos prontos e adicione aqui.
        </p>
      ) : (
        <ol className="flex flex-col divide-y divide-linha rounded-input border border-linha">
          {paradas.map((p, i) => (
            <li key={p.pedido_id} className="flex items-center gap-3 px-3 py-2">
              <span className="tabular flex size-7 flex-none items-center justify-center rounded-pill bg-salvia-claro text-xs font-bold text-salvia">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium text-tinta">Pedido {p.codigo}</span>
                <span className="truncate text-xs text-tinta-2">
                  {[p.endereco.resumo, p.endereco.bairro].filter(Boolean).join(' · ') || 'Endereço não informado'}
                </span>
              </span>
              <span className="tabular hidden flex-none text-xs text-tinta-2 sm:block">
                {formatarCentavos(p.valor_motoboy_centavos)}
              </span>
              {editavel && (
                <span className="flex flex-none items-center">
                  <BotaoIcone rotulo={`Subir pedido ${p.codigo}`} desabilitado={ocupado || i === 0} aoClicar={() => mover(i, -1)}>
                    <ArrowUp className="size-4" aria-hidden />
                  </BotaoIcone>
                  <BotaoIcone
                    rotulo={`Descer pedido ${p.codigo}`}
                    desabilitado={ocupado || i === paradas.length - 1}
                    aoClicar={() => mover(i, 1)}
                  >
                    <ArrowDown className="size-4" aria-hidden />
                  </BotaoIcone>
                  <BotaoIcone rotulo={`Tirar pedido ${p.codigo} da corrida`} desabilitado={ocupado} aoClicar={() => tirar(p.pedido_id)}>
                    <X className="size-4" aria-hidden />
                  </BotaoIcone>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {erro && <Banner tom="erro">{erro}</Banner>}

      {editavel && (
        <div className="flex flex-wrap gap-2">
          <Button
            loading={acao.isPending && acao.variables?.acao === 'despachar'}
            disabled={ocupado || paradas.length === 0 || corrida.motoboy_id == null}
            onClick={() => executar('despachar')}
          >
            Despachar
          </Button>
          <Button variante="ghost" disabled={ocupado} onClick={() => setConfirmarCancelar(true)}>
            Cancelar corrida
          </Button>
        </div>
      )}
      {estado === 'despachada' && (
        <div className="flex flex-wrap gap-2">
          <Button loading={acao.isPending} disabled={ocupado} onClick={() => executar('concluir')}>
            Concluir corrida
          </Button>
        </div>
      )}

      <ConfirmDialog
        aberto={confirmarCancelar}
        titulo="Cancelar corrida?"
        textoConfirmar="Cancelar corrida"
        textoCancelar="Manter"
        variante="destructive"
        carregando={acao.isPending}
        onConfirmar={() => executar('cancelar')}
        onCancelar={() => setConfirmarCancelar(false)}
      >
        Os pedidos voltam para a lista de prontos e podem entrar em outra corrida.
      </ConfirmDialog>
    </Card>
  )
}

function BotaoIcone({
  rotulo,
  desabilitado,
  aoClicar,
  children,
}: {
  rotulo: string
  desabilitado: boolean
  aoClicar: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      disabled={desabilitado}
      onClick={aoClicar}
      className="inline-flex size-11 items-center justify-center rounded-pill text-tinta-2 hover:bg-papel-2 hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia disabled:cursor-not-allowed disabled:opacity-30 sm:size-9"
    >
      {children}
    </button>
  )
}
