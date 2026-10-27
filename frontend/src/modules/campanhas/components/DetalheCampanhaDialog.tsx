// Detalhe da campanha: previa do publico (sem opt-out), disparo com confirmacao, cancelamento e
// acompanhamento da entrega. Nunca mostra telefone: o backend nem devolve (o cliente e so contagem).
import { useState } from 'react'
import { Send, UsersRound } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { formatarDataHora } from '@/shared/format'
import { Badge, Banner, Button, cn, ConfirmDialog, Dialog, ErrorState, Skeleton, useToast } from '@/shared/ui'
import { useCampanha, useCancelarCampanha, useDestinatarios, useDispararCampanha, type CampanhaDetalhe } from '../api'
import { ROTULO_STATUS, rotuloPublico, TOM_STATUS } from '../estados'

interface Props {
  id: string | null
  aoFechar: () => void
}

const ERROS_DISPARO: Record<string, string> = {
  campanha_nao_disparavel: 'Esta campanha já foi disparada ou cancelada.',
}

// As seis contagens de entrega são estados mutuamente exclusivos de cada envio (somam o total de
// destinatários): dá para ler como um funil, da fila à leitura, com as falhas e cancelamentos à parte.
// A ordem segue o ciclo de vida da mensagem; a cor de cada etapa é reusada na barra e no marcador.
type ChaveEntrega = keyof CampanhaDetalhe['entrega']
const METRICAS: ReadonlyArray<{ chave: ChaveEntrega; rotulo: string; cor: string; texto: string }> = [
  { chave: 'enfileirados', rotulo: 'Na fila', cor: 'bg-ambar', texto: 'text-ambar' },
  { chave: 'enviados', rotulo: 'Enviadas', cor: 'bg-revisao', texto: 'text-revisao' },
  { chave: 'entregues', rotulo: 'Entregues', cor: 'bg-folha', texto: 'text-folha' },
  { chave: 'lidos', rotulo: 'Lidas', cor: 'bg-salvia', texto: 'text-salvia' },
  { chave: 'falhas', rotulo: 'Falhas', cor: 'bg-barro', texto: 'text-barro' },
  { chave: 'cancelados', rotulo: 'Canceladas', cor: 'bg-cinza-expirado', texto: 'text-cinza-expirado' },
]

export function DetalheCampanhaDialog({ id, aoFechar }: Props) {
  const consulta = useCampanha(id)
  return (
    <Dialog aberto={id != null} onFechar={aoFechar} titulo="Campanha" className="max-w-xl">
      {consulta.isPending && id != null && (
        <div aria-busy="true" className="flex flex-col gap-3">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-20" />
          <Skeleton className="h-16" />
        </div>
      )}
      {consulta.isError && <ErrorState aoTentarDeNovo={() => void consulta.refetch()} />}
      {consulta.data && <Corpo campanha={consulta.data} />}
    </Dialog>
  )
}

function Corpo({ campanha }: { campanha: CampanhaDetalhe }) {
  const rascunho = campanha.status === 'rascunho'
  const previa = useDestinatarios(campanha.id, rascunho)
  const disparar = useDispararCampanha()
  const cancelar = useCancelarCampanha()
  const { mostrarToast } = useToast()
  const [confirmaDisparo, setConfirmaDisparo] = useState(false)
  const [confirmaCancelar, setConfirmaCancelar] = useState(false)

  const erro = (e: Error, padrao: string) => {
    const msg = e instanceof ApiError ? (ERROS_DISPARO[e.code] ?? e.message) : padrao
    mostrarToast(msg, { tom: 'erro' })
  }

  const total = previa.data?.total
  const variaveis = Object.entries(campanha.variaveis)

  return (
    <div className="flex flex-col gap-5 text-left">
      <div>
        <p className="font-display text-xl font-semibold text-tinta">{campanha.nome}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Badge tom={TOM_STATUS[campanha.status]}>{ROTULO_STATUS[campanha.status]}</Badge>
          <span className="text-xs text-tinta-2">Criada em {formatarDataHora(campanha.criado_em)}</span>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-tinta-2">Template</dt>
            <dd className="break-all text-tinta">{campanha.template_chave}</dd>
          </div>
          <div>
            <dt className="text-xs text-tinta-2">Público</dt>
            <dd className="text-tinta">{rotuloPublico(campanha.filtro.segmento)}</dd>
          </div>
        </dl>
      </div>

      {variaveis.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-sm font-medium text-tinta">Variáveis</h3>
          <ul className="flex flex-col gap-1">
            {variaveis.map(([k, v]) => (
              <li key={k} className="flex gap-2 rounded-input border border-linha bg-papel-2 px-3 py-1.5 text-sm">
                <span className="font-medium text-tinta">{k}</span>
                <span className="min-w-0 break-words text-tinta-2">{v}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rascunho && (
        <section className="rounded-card border border-linha bg-papel-2 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-tinta">
            <UsersRound className="size-4 text-salvia" aria-hidden />
            Quem vai receber
          </h3>
          {previa.isPending && <Skeleton className="mt-2 h-8 w-40" />}
          {previa.isError && <ErrorState className="mt-2" aoTentarDeNovo={() => void previa.refetch()} />}
          {previa.isSuccess && (
            <>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-tinta">
                {total} {total === 1 ? 'cliente' : 'clientes'}
              </p>
              <p className="text-xs text-tinta-2">
                Já descontados os clientes que pediram para não receber marketing.
              </p>
            </>
          )}
          {total === 0 && (
            <Banner tom="erro" className="mt-3">
              Ninguém neste público pode receber a campanha. Ajuste o segmento antes de disparar.
            </Banner>
          )}
          <div className="mt-3">
            <Button disabled={!previa.isSuccess || total === 0} onClick={() => setConfirmaDisparo(true)}>
              <Send className="size-4" aria-hidden />
              Disparar campanha
            </Button>
          </div>
        </section>
      )}

      {!rascunho && <PainelEntrega campanha={campanha} aoCancelar={() => setConfirmaCancelar(true)} />}

      <ConfirmDialog
        aberto={confirmaDisparo}
        titulo="Disparar campanha?"
        textoConfirmar="Disparar agora"
        carregando={disparar.isPending}
        onCancelar={() => setConfirmaDisparo(false)}
        onConfirmar={() =>
          disparar.mutate(
            { id: campanha.id },
            {
              onSuccess: (r) => {
                setConfirmaDisparo(false)
                mostrarToast(`Campanha disparada para ${r.enfileirados} ${r.enfileirados === 1 ? 'cliente' : 'clientes'}.`, { tom: 'sucesso' })
              },
              onError: (err) => {
                setConfirmaDisparo(false)
                erro(err, 'Não foi possível disparar a campanha.')
              },
            },
          )
        }
      >
        A mensagem será enviada para {total ?? 0} {total === 1 ? 'cliente' : 'clientes'}. Depois de disparar, não dá para editar nem disparar de novo.
      </ConfirmDialog>

      <ConfirmDialog
        aberto={confirmaCancelar}
        titulo="Cancelar envios pendentes?"
        textoConfirmar="Cancelar envios"
        textoCancelar="Voltar"
        variante="destructive"
        carregando={cancelar.isPending}
        onCancelar={() => setConfirmaCancelar(false)}
        onConfirmar={() =>
          cancelar.mutate(
            { id: campanha.id },
            {
              onSuccess: (r) => {
                setConfirmaCancelar(false)
                mostrarToast(`${r.cancelados} ${r.cancelados === 1 ? 'envio cancelado' : 'envios cancelados'}.`, { tom: 'sucesso' })
              },
              onError: (err) => {
                setConfirmaCancelar(false)
                erro(err, 'Não foi possível cancelar.')
              },
            },
          )
        }
      >
        Mensagens que ainda não saíram serão canceladas. As que já foram enviadas não podem ser desfeitas.
      </ConfirmDialog>
    </div>
  )
}

function PainelEntrega({
  campanha,
  aoCancelar,
}: {
  campanha: CampanhaDetalhe
  aoCancelar: () => void
}) {
  const e = campanha.entrega
  const total = campanha.total_destinatarios
  const ativa = campanha.status === 'enfileirada'
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
  const plural = total === 1 ? 'destinatário' : 'destinatários'
  const resumo =
    `Entrega para ${total} ${plural}: ${e.enfileirados} na fila, ${e.enviados} enviadas, ` +
    `${e.entregues} entregues, ${e.lidos} lidas, ${e.falhas} falhas e ${e.cancelados} canceladas.`

  return (
    <section>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-medium text-tinta">
          Entrega <span className="font-normal text-tinta-2">· {total} {plural}</span>
        </h3>
        {ativa ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-tinta-2">
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-pill bg-folha opacity-60" />
              <span className="relative inline-flex size-2 rounded-pill bg-folha" />
            </span>
            Atualiza sozinho
          </span>
        ) : (
          campanha.enfileirado_em && (
            <span className="text-xs text-tinta-2">Disparada em {formatarDataHora(campanha.enfileirado_em)}</span>
          )
        )}
      </div>
      {ativa && campanha.enfileirado_em && (
        <p className="mb-3 text-xs text-tinta-2">Disparada em {formatarDataHora(campanha.enfileirado_em)}</p>
      )}

      {/* Barra-funil: cada etapa ocupa sua fatia do total. Decorativa; o texto vai nos cartões + resumo. */}
      <div className="mt-1 flex h-2.5 w-full gap-px overflow-hidden rounded-pill bg-papel-2" aria-hidden>
        {total > 0 &&
          METRICAS.map((m) => {
            const n = e[m.chave]
            if (n === 0) return null
            return <div key={m.chave} className={m.cor} style={{ width: `${(n / total) * 100}%` }} />
          })}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {METRICAS.map((m) => {
          const n = e[m.chave]
          const alerta = (m.chave === 'falhas' || m.chave === 'cancelados') && n > 0
          return (
            <div
              key={m.chave}
              className={cn('rounded-input border bg-papel-2 px-3 py-2.5', alerta ? 'border-barro/30' : 'border-linha')}
            >
              <dt className="flex items-center gap-1.5 text-xs text-tinta-2">
                <span className={cn('size-2 flex-none rounded-pill', m.cor)} aria-hidden />
                {m.rotulo}
              </dt>
              <dd className="mt-1 flex items-baseline gap-1.5">
                <span className={cn('text-lg font-semibold tabular-nums', n > 0 ? m.texto : 'text-tinta-2')}>{n}</span>
                {total > 0 && n > 0 && <span className="text-xs tabular-nums text-tinta-2">{pct(n)}%</span>}
              </dd>
            </div>
          )
        })}
      </dl>

      {/* Único ponto de leitura dinâmica: anuncia apenas quando os números mudam (a cada refetch de 15s). */}
      <p className="sr-only" aria-live="polite">
        {resumo}
      </p>

      {ativa && (
        <Button className="mt-3" variante="secondary" onClick={aoCancelar}>
          Cancelar envios pendentes
        </Button>
      )}
    </section>
  )
}
