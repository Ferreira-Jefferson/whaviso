// Detalhe da campanha: previa do publico (sem opt-out), disparo com confirmacao, cancelamento e
// acompanhamento da entrega. Nunca mostra telefone: o backend nem devolve (o cliente e so contagem).
import { useState } from 'react'
import { Send, UsersRound } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { formatarDataHora } from '@/shared/format'
import { Badge, Banner, Button, ConfirmDialog, Dialog, ErrorState, Skeleton, useToast } from '@/shared/ui'
import { useCampanha, useCancelarCampanha, useDestinatarios, useDispararCampanha, type CampanhaDetalhe } from '../api'
import { ROTULO_STATUS, rotuloPublico, TOM_STATUS } from '../estados'

interface Props {
  id: string | null
  aoFechar: () => void
}

const ERROS_DISPARO: Record<string, string> = {
  campanha_nao_disparavel: 'Esta campanha já foi disparada ou cancelada.',
}

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
  const e = campanha.entrega
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

      {!rascunho && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-tinta">
            Entrega ({campanha.total_destinatarios} {campanha.total_destinatarios === 1 ? 'destinatário' : 'destinatários'})
          </h3>
          {campanha.enfileirado_em && (
            <p className="mb-2 text-xs text-tinta-2">Disparada em {formatarDataHora(campanha.enfileirado_em)}</p>
          )}
          <div className="grid grid-cols-3 gap-2.5">
            <Contagem rotulo="Na fila" valor={e.enfileirados} />
            <Contagem rotulo="Enviadas" valor={e.enviados} />
            <Contagem rotulo="Entregues" valor={e.entregues} />
            <Contagem rotulo="Lidas" valor={e.lidos} />
            <Contagem rotulo="Falhas" valor={e.falhas} destaque={e.falhas > 0} />
            <Contagem rotulo="Canceladas" valor={e.cancelados} />
          </div>
          {campanha.status === 'enfileirada' && (
            <Button className="mt-3" variante="secondary" onClick={() => setConfirmaCancelar(true)}>
              Cancelar envios pendentes
            </Button>
          )}
        </section>
      )}

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

function Contagem({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-input border border-linha bg-papel-2 p-3">
      <span className="text-xs text-tinta-2">{rotulo}</span>
      <span className={`text-lg font-semibold tabular-nums ${destaque ? 'text-barro' : 'text-tinta'}`}>{valor}</span>
    </div>
  )
}
