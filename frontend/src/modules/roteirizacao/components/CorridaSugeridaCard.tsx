// Card de uma corrida SUGERIDA: saida prevista, tempo e distancia totais, paradas em ordem.
// O operador pode ajustar a ordem (subir/descer), pedir para recalcular a melhor ordem
// ("Otimizar ordem") e aceitar com um motoboy opcional. Nada e gravado ate o aceite.
// Depois de ajuste manual os tempos por parada deixam de valer: a tela avisa e esconde.
import { useState } from 'react'
import { ArrowDown, ArrowUp, Clock, Info, Route, Store } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { formatarHora } from '@/shared/format'
import { Badge, Banner, Button, Card, Select, cn, useToast } from '@/shared/ui'
import { useAceitarSugestao, useOtimizarOrdem, type CorridaSugerida, type MotoboyOpcao } from '../api'
import { formatarDistancia, formatarMinutos } from '../estados'

interface Props {
  sugestao: CorridaSugerida
  motoboys: ReadonlyArray<MotoboyOpcao>
  /** Chamado depois que a corrida e criada, para a lista remover este card. */
  aoAceitar: () => void
}

export function CorridaSugeridaCard({ sugestao, motoboys, aoAceitar }: Props) {
  const inicial = [...sugestao.paradas].sort((a, b) => a.ordem_parada - b.ordem_parada)
  const porId = new Map(inicial.map((p) => [p.pedido_id, p]))

  const [ordem, setOrdem] = useState<string[]>(inicial.map((p) => p.pedido_id))
  const [alterada, setAlterada] = useState(false)
  const [totais, setTotais] = useState({
    minutos: sugestao.tempo_total_min,
    metros: sugestao.distancia_total_m,
    estimado: sugestao.estimado,
  })
  const [motoboyId, setMotoboyId] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const otimizar = useOtimizarOrdem()
  const aceitar = useAceitarSugestao()
  const { mostrarToast } = useToast()
  const ocupado = otimizar.isPending || aceitar.isPending

  function mover(i: number, delta: -1 | 1) {
    const alvo = i + delta
    if (alvo < 0 || alvo >= ordem.length) return
    const nova = [...ordem]
    ;[nova[i], nova[alvo]] = [nova[alvo]!, nova[i]!]
    setOrdem(nova)
    setAlterada(true)
  }

  function otimizarOrdem() {
    setErro(null)
    otimizar.mutate(ordem, {
      onSuccess: (r) => {
        setOrdem(r.pedido_ids)
        setTotais({ minutos: r.tempo_total_min, metros: r.distancia_total_m, estimado: r.estimado })
        setAlterada(true)
        mostrarToast('Ordem recalculada.', { tom: 'sucesso' })
      },
      onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível recalcular a ordem.'),
    })
  }

  function aceitarCorrida() {
    setErro(null)
    aceitar.mutate(
      { pedidoIds: ordem, motoboyId: motoboyId || undefined },
      {
        onSuccess: () => {
          mostrarToast('Corrida criada. Ela já está no despacho.', { tom: 'sucesso' })
          aoAceitar()
        },
        onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível aceitar a sugestão.'),
      },
    )
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-display text-lg text-tinta">Corrida {sugestao.ordem_saida}</span>
          {sugestao.sem_motoboy && <Badge tom="atencao">Sem motoboy livre</Badge>}
          {totais.estimado && <Badge tom="neutro">Tempo estimado</Badge>}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <MetricaChip icone={<Clock className="size-4" aria-hidden />} rotulo="Tempo" valor={formatarMinutos(totais.minutos)} />
          <MetricaChip icone={<Route className="size-4" aria-hidden />} rotulo="Distância" valor={formatarDistancia(totais.metros)} />
        </div>
      </div>

      <ol className="flex flex-col">
        <li className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="flex size-7 flex-none items-center justify-center rounded-pill bg-salvia text-papel">
              <Store className="size-3.5" aria-hidden />
            </span>
            <span className="w-px flex-1 bg-linha" />
          </div>
          <div className="flex-1 pb-5">
            <span className="block text-sm font-medium text-tinta">Saída da loja</span>
            <span className="tabular block text-xs text-tinta-2">às {formatarHora(sugestao.saida_prevista_em)}</span>
          </div>
        </li>
        {ordem.map((id, i) => {
          const p = porId.get(id)
          if (!p) return null
          const ultimo = i === ordem.length - 1
          return (
            <li key={id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="tabular flex size-7 flex-none items-center justify-center rounded-pill bg-salvia-claro text-xs font-bold text-salvia">
                  {i + 1}
                </span>
                {!ultimo && <span className="w-px flex-1 bg-linha" />}
              </div>
              <div className={cn('flex min-w-0 flex-1 items-start gap-3', ultimo ? 'pb-0' : 'pb-5')}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium text-tinta">Pedido {p.codigo}</span>
                  <span className="truncate text-xs text-tinta-2">
                    {[p.endereco_resumo, p.bairro].filter(Boolean).join(' · ') || 'Endereço não informado'}
                  </span>
                  <span className="tabular text-xs text-tinta-2">
                    Pronto às {formatarHora(p.pronto_previsto_em)}
                    {!alterada && ` · chega em ${formatarMinutos(p.chegada_min)}`}
                  </span>
                </span>
                <span className="flex flex-none items-center">
                  <BotaoIcone rotulo={`Subir pedido ${p.codigo}`} desabilitado={ocupado || i === 0} aoClicar={() => mover(i, -1)}>
                    <ArrowUp className="size-4" aria-hidden />
                  </BotaoIcone>
                  <BotaoIcone
                    rotulo={`Descer pedido ${p.codigo}`}
                    desabilitado={ocupado || i === ordem.length - 1}
                    aoClicar={() => mover(i, 1)}
                  >
                    <ArrowDown className="size-4" aria-hidden />
                  </BotaoIcone>
                </span>
              </div>
            </li>
          )
        })}
      </ol>

      {alterada && (
        <div className="flex items-start gap-2 rounded-input bg-ambar-claro px-3 py-2 text-xs text-ambar">
          <Info className="mt-0.5 size-4 flex-none" aria-hidden />
          <span>
            A ordem foi ajustada, os horários de chegada por parada deixam de valer. Use Otimizar ordem para
            recalcular o tempo e a distância totais.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-tinta-2">Motoboy da corrida</span>
        <Select
          ariaLabel={`Motoboy da corrida ${sugestao.ordem_saida}`}
          value={motoboyId}
          onChange={setMotoboyId}
          disabled={ocupado}
          options={[
            { value: '', label: 'Escolher o motoboy depois' },
            ...motoboys.map((m) => ({ value: m.id, label: m.nome })),
          ]}
        />
      </div>

      {erro && <Banner tom="erro">{erro}</Banner>}

      <div className="flex flex-wrap gap-2">
        <Button loading={aceitar.isPending} disabled={otimizar.isPending} onClick={aceitarCorrida}>
          Aceitar corrida
        </Button>
        {ordem.length >= 2 && (
          <Button variante="secondary" loading={otimizar.isPending} disabled={aceitar.isPending} onClick={otimizarOrdem}>
            Otimizar ordem
          </Button>
        )}
      </div>
    </Card>
  )
}

function MetricaChip({ icone, rotulo, valor }: { icone: React.ReactNode; rotulo: string; valor: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-input bg-papel-2 px-3 py-1.5">
      <span className="text-salvia">{icone}</span>
      <span className="flex flex-col leading-tight">
        <span className="text-[11px] uppercase tracking-wide text-tinta-2">{rotulo}</span>
        <span className="tabular text-sm font-semibold text-tinta">{valor}</span>
      </span>
    </span>
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
