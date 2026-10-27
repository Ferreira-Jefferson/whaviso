// Ficha da conta (operador): lojas, saude do WhatsApp, membros e ultima assinatura. So metadado:
// sem contato (telefone/e-mail) e sem nenhum conteudo da loja (conversa, pedido, cliente final).
// Suspender/reativar assinatura NAO mora aqui (modulo de cobranca).
import type { ReactNode } from 'react'
import { Badge, Dialog, Button, Skeleton } from '@/shared/ui'
import { brl, formatarData, formatarDataHora } from '@/shared/format'
import type { PlataformaContaFicha } from '@/shared/contracts/_generated/plataforma_clientes'
import { useFichaConta } from '../api'
import {
  ROTULO_PAPEL_MEMBRO,
  ROTULO_SAUDE,
  ROTULO_SITUACAO,
  ROTULO_STATUS_NUMERO,
  TOM_SAUDE,
  TOM_SITUACAO,
  idCurto,
} from '../rotulos'
import { AreaErro } from './AreaErro'

interface Props {
  contaId: string | null
  aoFechar: () => void
}

export function FichaContaDialog({ contaId, aoFechar }: Props) {
  const ficha = useFichaConta(contaId)
  return (
    <Dialog
      aberto={contaId != null}
      onFechar={aoFechar}
      titulo={ficha.data?.nome ?? 'Ficha da conta'}
      className="max-w-2xl"
      acoes={
        <Button variante="secondary" onClick={aoFechar}>
          Fechar
        </Button>
      }
    >
      {ficha.isPending && contaId != null && (
        <div aria-busy="true" aria-label="Carregando ficha" className="flex flex-col gap-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}
      {ficha.isError && <AreaErro erro={ficha.error} aoTentarDeNovo={() => void ficha.refetch()} />}
      {ficha.data && <Conteudo ficha={ficha.data} />}
    </Dialog>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-tinta-2">{titulo}</h3>
      {children}
    </section>
  )
}

function Conteudo({ ficha }: { ficha: PlataformaContaFicha }) {
  const nomeLoja = (id: string | null) =>
    id == null ? 'Todas as lojas' : (ficha.lojas.find((l) => l.id === id)?.nome ?? `Loja ${idCurto(id)}`)
  const a = ficha.assinatura

  return (
    <div className="text-tinta">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tom={TOM_SITUACAO[ficha.situacao]}>{ROTULO_SITUACAO[ficha.situacao]}</Badge>
        <Badge tom={TOM_SAUDE[ficha.saude_whatsapp]}>{ROTULO_SAUDE[ficha.saude_whatsapp]}</Badge>
        <span className="text-xs text-tinta-2">Cliente desde {formatarData(ficha.criado_em)}</span>
      </div>

      <Secao titulo="Assinatura">
        {a ? (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <Linha rotulo="Situação" valor={ROTULO_SITUACAO[a.status]} />
            <Linha rotulo="Valor mensal" valor={brl(a.valor_mensal_centavos)} />
            <Linha rotulo="Vencimento" valor={`Todo dia ${a.dia_vencimento}`} />
            <Linha rotulo="Abrangência" valor={nomeLoja(a.loja_id)} />
            {a.trial_ate && <Linha rotulo="Teste até" valor={formatarData(a.trial_ate)} />}
            {a.inicio_em && <Linha rotulo="Início" valor={formatarData(a.inicio_em)} />}
            {a.cancelada_em && <Linha rotulo="Cancelada em" valor={formatarDataHora(a.cancelada_em)} />}
          </dl>
        ) : (
          <p className="text-sm text-tinta-2">Esta conta ainda não tem assinatura.</p>
        )}
      </Secao>

      <Secao titulo={`Lojas (${ficha.lojas.length})`}>
        {ficha.lojas.length === 0 ? (
          <p className="text-sm text-tinta-2">Cadastro sem loja ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ficha.lojas.map((l) => (
              <li key={l.id} className="rounded-input border border-linha p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{l.nome}</span>
                  {!l.ativo && <Badge tom="neutro">Desativada pela loja</Badge>}
                </div>
                <p className="mt-1 text-xs text-tinta-2">
                  {l.numero
                    ? `WhatsApp: ${ROTULO_STATUS_NUMERO[l.numero.status]}, ${l.numero.verificado ? 'verificado' : 'não verificado'}, cadastrado em ${formatarData(l.numero.criado_em)}`
                    : 'Sem número de WhatsApp'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo={`Membros (${ficha.membros.length})`}>
        {ficha.membros.length === 0 ? (
          <p className="text-sm text-tinta-2">Nenhum membro.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-linha text-sm">
            {ficha.membros.map((m) => (
              <li key={`${m.user_id}-${m.loja_id ?? 'todas'}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="flex items-center gap-2">
                  <span className="font-medium">{ROTULO_PAPEL_MEMBRO[m.papel]}</span>
                  {m.user_id === ficha.dono_user_id && <Badge tom="marca">Dono da conta</Badge>}
                  {!m.ativo && <Badge tom="neutro">Inativo</Badge>}
                </span>
                <span className="text-xs text-tinta-2">
                  {nomeLoja(m.loja_id)} · ref. {idCurto(m.user_id)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-tinta-2">Por privacidade, o console não mostra contato nem dados de uso da loja.</p>
      </Secao>
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-tinta-2">{rotulo}</dt>
      <dd className="tabular font-medium">{valor}</dd>
    </div>
  )
}
