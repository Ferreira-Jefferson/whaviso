// Ficha do cliente no CRM: segmento e notas RFM, metricas, o que ele mais pede, ultimos pedidos
// e o consentimento de marketing (opt-out e primeira classe). Sem telefone (PII fica em clientes).
import { useEffect, useState, type ReactNode } from 'react'
import { BellOff, BellRing } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { formatarData, formatarDataHora } from '@/shared/format'
import { Badge, Button, Dialog, ErrorState, Field, Input, MoneyText, Skeleton, useToast } from '@/shared/ui'
import { useAlterarConsentimento, useCrmDetalhe, type CrmDetalhe } from '../api'
import { DICA_SEGMENTO } from '../segmentos'
import { SeloSegmento } from './SeloSegmento'

interface Props {
  id: string | null
  aoFechar: () => void
}

export function FichaClienteDialog({ id, aoFechar }: Props) {
  const consulta = useCrmDetalhe(id)
  return (
    <Dialog aberto={id != null} onFechar={aoFechar} titulo="Ficha do cliente" className="max-h-[88vh] max-w-xl overflow-y-auto">
      {consulta.isPending && id != null && <Esqueleto />}
      {consulta.isError && <ErrorState aoTentarDeNovo={() => void consulta.refetch()} />}
      {consulta.data && <Corpo ficha={consulta.data} />}
    </Dialog>
  )
}

function Corpo({ ficha }: { ficha: CrmDetalhe }) {
  const m = ficha.metricas
  return (
    <div className="flex flex-col gap-5 text-left">
      <div>
        <p className="font-display text-xl font-semibold text-tinta">{ficha.nome ?? 'Cliente sem nome'}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <SeloSegmento segmento={m.segmento} />
          {ficha.consentimento.opt_out_marketing && <Badge tom="erro">Não quer receber marketing</Badge>}
        </div>
        <p className="mt-1.5 text-xs text-tinta-2">{DICA_SEGMENTO[m.segmento]}</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Tile rotulo="Pedidos" valor={<span className="tabular-nums">{m.pedidos_total}</span>} />
        <Tile rotulo="Gasto total" valor={<MoneyText centavos={m.gasto_total_centavos} />} />
        <Tile rotulo="Ticket médio" valor={<MoneyText centavos={m.ticket_medio_centavos} />} />
        <Tile
          rotulo="Última compra"
          valor={
            <span className="tabular-nums">
              {m.recencia_dias == null
                ? 'Nenhuma'
                : m.recencia_dias === 0
                  ? 'Hoje'
                  : `há ${m.recencia_dias} ${m.recencia_dias === 1 ? 'dia' : 'dias'}`}
            </span>
          }
        />
      </div>

      <section aria-label="Notas RFM">
        <h3 className="mb-2 text-sm font-medium text-tinta">Notas RFM (1 a 5)</h3>
        <div className="grid grid-cols-3 gap-2.5">
          <Nota rotulo="Recência" nota={m.nota_r} />
          <Nota rotulo="Frequência" nota={m.nota_f} />
          <Nota rotulo="Valor" nota={m.nota_m} />
        </div>
        <p className="mt-2 text-xs text-tinta-2">
          Últimos 180 dias: {m.pedidos_180d} {m.pedidos_180d === 1 ? 'pedido' : 'pedidos'},{' '}
          <MoneyText centavos={m.gasto_180d_centavos} />.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium text-tinta">O que mais pede</h3>
        {ficha.itens_favoritos.length === 0 ? (
          <p className="text-sm text-tinta-2">Ainda sem itens para mostrar.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {ficha.itens_favoritos.map((i, idx) => (
              <li
                key={i.item_id ?? i.nome}
                className="flex items-center justify-between gap-3 rounded-input border border-linha bg-papel-2 px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex size-5 flex-none items-center justify-center rounded-pill bg-salvia-claro text-[11px] font-bold tabular-nums text-salvia">
                    {idx + 1}
                  </span>
                  <span className="min-w-0 truncate text-tinta">{i.nome}</span>
                </span>
                <span className="flex-none tabular-nums text-tinta-2">{i.quantidade}x</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium text-tinta">Últimos pedidos</h3>
        {ficha.ultimos_pedidos.length === 0 ? (
          <p className="text-sm text-tinta-2">Nenhum pedido ainda.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {ficha.ultimos_pedidos.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-input border border-linha px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-tinta">#{p.codigo}</span>
                  <span className="ml-2 text-xs text-tinta-2">
                    {formatarData(p.criado_em)} · {rotuloTexto(p.status)} · {rotuloTexto(p.modalidade)}
                  </span>
                </div>
                <MoneyText centavos={p.total_centavos} className="flex-none" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Consentimento id={ficha.cliente_id} consentimento={ficha.consentimento} />
    </div>
  )
}

const ROTULO_ORIGEM: Record<string, string> = {
  painel: 'pelo painel',
  cliente_whatsapp: 'pelo próprio cliente no WhatsApp',
  importacao: 'por importação',
}

function Consentimento({ id, consentimento }: { id: string; consentimento: CrmDetalhe['consentimento'] }) {
  const [confirmando, setConfirmando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const alterar = useAlterarConsentimento()
  const { mostrarToast } = useToast()
  const optOut = consentimento.opt_out_marketing

  useEffect(() => {
    setConfirmando(false)
    setMotivo('')
    setErro(null)
  }, [id, optOut])

  const aplicar = () => {
    setErro(null)
    alterar.mutate(
      { id, optOut: !optOut, motivo: motivo.trim() || undefined },
      {
        onSuccess: () =>
          mostrarToast(optOut ? 'Cliente volta a poder receber campanhas.' : 'Cliente não receberá mais campanhas.', {
            tom: 'sucesso',
          }),
        onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar a preferência.'),
      },
    )
  }

  const desde = optOut ? consentimento.opt_out_em : consentimento.opt_in_em

  return (
    <section className="rounded-card border border-linha bg-papel-2 p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-medium text-tinta">
        {optOut ? <BellOff className="size-4 text-barro" aria-hidden /> : <BellRing className="size-4 text-salvia" aria-hidden />}
        Mensagens de marketing
      </h3>
      <p className="mt-1 text-sm text-tinta-2">
        {optOut
          ? 'Este cliente não quer receber campanhas. Ele fica de fora de qualquer disparo.'
          : 'Este cliente pode receber campanhas de WhatsApp.'}
        {desde && (
          <span className="block text-xs">
            Desde {formatarDataHora(desde)}
            {consentimento.origem ? `, ${ROTULO_ORIGEM[consentimento.origem] ?? ''}` : ''}
            {optOut && consentimento.motivo ? `. Motivo: ${consentimento.motivo}` : ''}
          </span>
        )}
      </p>

      {!confirmando ? (
        <Button className="mt-3" variante={optOut ? 'secondary' : 'destructive'} onClick={() => setConfirmando(true)}>
          {optOut ? 'Voltar a permitir contato' : 'Marcar como não contactar'}
        </Button>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {!optOut && (
            <Field label="Motivo " erro={erro ?? undefined}>
              <Input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={200}
                placeholder="Ex.: pediu para parar de receber"
              />
            </Field>
          )}
          {optOut && erro && (
            <p role="alert" className="text-xs text-barro">
              {erro}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variante={optOut ? 'primary' : 'destructive'} loading={alterar.isPending} onClick={aplicar}>
              Confirmar
            </Button>
            <Button variante="secondary" disabled={alterar.isPending} onClick={() => setConfirmando(false)}>
              Voltar
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

function Tile({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-input border border-linha bg-papel-2 p-3">
      <span className="text-xs text-tinta-2">{rotulo}</span>
      <span className="text-base font-semibold text-tinta">{valor}</span>
    </div>
  )
}

function Nota({ rotulo, nota }: { rotulo: string; nota: number | null }) {
  return (
    <div className="rounded-input border border-linha p-3">
      <span className="text-xs text-tinta-2">{rotulo}</span>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-base font-semibold tabular-nums text-tinta">{nota ?? '-'}</span>
        <div className="flex gap-0.5" aria-hidden>
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className={`h-1.5 w-3 rounded-pill ${nota != null && n <= nota ? 'bg-salvia' : 'bg-linha'}`} />
          ))}
        </div>
      </div>
    </div>
  )
}

function rotuloTexto(valor: string): string {
  const t = valor.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function Esqueleto() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <Skeleton className="h-7 w-2/3" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <Skeleton className="h-24" />
    </div>
  )
}
