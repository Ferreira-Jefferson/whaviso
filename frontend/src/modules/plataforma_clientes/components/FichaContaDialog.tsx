// Ficha da conta (operador): lojas, saude do WhatsApp, membros e ultima assinatura. So metadado:
// sem contato (telefone/e-mail) e sem nenhum conteudo da loja (conversa, pedido, cliente final).
// Suspender/reativar assinatura NAO mora aqui (modulo de cobranca).
import { useState, type ReactNode } from 'react'
import { ApiError } from '@/shared/api_client'
import { Avatar, Badge, Banner, ConfirmDialog, Dialog, Button, Field, Input, Skeleton, useToast } from '@/shared/ui'
import { brl, formatarData, formatarDataHora } from '@/shared/format'
import type {
  PlataformaContaFicha,
  PlataformaLojaResumo,
} from '@/shared/contracts/_generated/plataforma_clientes'
import type { StatusNumero } from '@/shared/contracts/_generated/enums'
import { useChavesApi, useCriarChaveApi, useFichaConta, useRevogarChaveApi } from '../api'
import type { ChaveApiDTO, SituacaoChave } from '../schemas'
import {
  ROTULO_PAPEL_MEMBRO,
  ROTULO_SAUDE,
  ROTULO_SITUACAO,
  ROTULO_STATUS_NUMERO,
  TOM_SAUDE,
  TOM_SITUACAO,
  type TomBadge,
  idCurto,
} from '../rotulos'
import { AreaErro } from './AreaErro'

/** Tom do selo de status do numero (apresentacao; nunca expoe o numero em si). */
const TOM_STATUS_NUMERO: Record<StatusNumero, TomBadge> = {
  conectado: 'sucesso',
  pausado: 'atencao',
  removido: 'neutro',
}

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
      <div className="flex items-center gap-3">
        <Avatar nome={ficha.nome} forma="quadrado" tamanho="lg" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tom={TOM_SITUACAO[ficha.situacao]}>{ROTULO_SITUACAO[ficha.situacao]}</Badge>
            <Badge tom={TOM_SAUDE[ficha.saude_whatsapp]}>{ROTULO_SAUDE[ficha.saude_whatsapp]}</Badge>
          </div>
          <p className="mt-1 text-xs text-tinta-2">Cliente desde {formatarData(ficha.criado_em)}</p>
        </div>
      </div>

      <Secao titulo="Assinatura">
        {a ? (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-input border border-linha bg-papel-2 p-4 text-sm sm:grid-cols-2">
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
              <LojaItem key={l.id} loja={l} />
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

      <SecaoChavesApi contaId={ficha.id} />
    </div>
  )
}

function LojaItem({ loja }: { loja: PlataformaLojaResumo }) {
  return (
    <li className="rounded-input border border-linha p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{loja.nome}</span>
        {!loja.ativo && <Badge tom="neutro">Desativada pela loja</Badge>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tinta-2">
        {loja.numero ? (
          <>
            <Badge tom={TOM_STATUS_NUMERO[loja.numero.status]}>{ROTULO_STATUS_NUMERO[loja.numero.status]}</Badge>
            <span>{loja.numero.verificado ? 'Verificado' : 'Não verificado'}</span>
            <span aria-hidden>·</span>
            <span>desde {formatarData(loja.numero.criado_em)}</span>
          </>
        ) : (
          <span>Sem número de WhatsApp</span>
        )}
      </div>
    </li>
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

const ROTULO_SITUACAO_CHAVE: Record<SituacaoChave, string> = { ativa: 'Ativa', expirada: 'Expirada', revogada: 'Revogada' }
const TOM_SITUACAO_CHAVE: Record<SituacaoChave, TomBadge> = { ativa: 'sucesso', expirada: 'atencao', revogada: 'neutro' }

/** Chaves de API da conta: emitidas pela Whaviso, so admin. O valor completo aparece uma unica vez. */
function SecaoChavesApi({ contaId }: { contaId: string }) {
  const chaves = useChavesApi(contaId)
  const revogar = useRevogarChaveApi(contaId)
  const { mostrarToast } = useToast()
  const [criando, setCriando] = useState(false)
  const [alvo, setAlvo] = useState<ChaveApiDTO | null>(null)

  const semPermissao = chaves.error instanceof ApiError && chaves.error.status === 403

  return (
    <Secao titulo="Chaves de API">
      {chaves.isPending && <Skeleton className="h-12 w-full" />}
      {semPermissao && <p className="text-sm text-tinta-2">Apenas administradores gerenciam as chaves de API.</p>}
      {chaves.isError && !semPermissao && (
        <AreaErro erro={chaves.error} aoTentarDeNovo={() => void chaves.refetch()} />
      )}
      {chaves.data && (
        <>
          {chaves.data.itens.length === 0 ? (
            <p className="text-sm text-tinta-2">Esta conta ainda não tem chave de API.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Chaves de API da conta</caption>
                <thead className="text-xs text-tinta-2">
                  <tr>
                    <th scope="col" className="py-1.5 pr-3 font-medium">Nome</th>
                    <th scope="col" className="py-1.5 pr-3 font-medium">Chave</th>
                    <th scope="col" className="py-1.5 pr-3 font-medium">Criação</th>
                    <th scope="col" className="py-1.5 pr-3 font-medium">Validade</th>
                    <th scope="col" className="py-1.5 pr-3 font-medium">Situação</th>
                    <th scope="col" className="py-1.5 font-medium"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linha">
                  {chaves.data.itens.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2 pr-3 font-medium">{c.nome}</td>
                      <td className="py-2 pr-3"><code className="text-xs">{c.mascara}</code></td>
                      <td className="tabular py-2 pr-3">{formatarData(c.criado_em)}</td>
                      <td className="tabular py-2 pr-3">{c.expira_em ? formatarData(c.expira_em) : 'Sem validade'}</td>
                      <td className="py-2 pr-3">
                        <Badge tom={TOM_SITUACAO_CHAVE[c.situacao]}>{ROTULO_SITUACAO_CHAVE[c.situacao]}</Badge>
                      </td>
                      <td className="py-2 text-right">
                        {c.situacao !== 'revogada' && (
                          <Button type="button" variante="secondary" onClick={() => setAlvo(c)}>
                            Revogar
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3">
            <Button type="button" variante="secondary" onClick={() => setCriando(true)}>
              Nova chave
            </Button>
          </div>
        </>
      )}

      <NovaChaveDialog contaId={contaId} aberto={criando} aoFechar={() => setCriando(false)} />
      <ConfirmDialog
        aberto={alvo != null}
        titulo="Revogar chave de API"
        textoConfirmar="Revogar"
        variante="destructive"
        carregando={revogar.isPending}
        onCancelar={() => setAlvo(null)}
        onConfirmar={() => {
          if (!alvo) return
          revogar.mutate(alvo.id, {
            onSuccess: () => {
              mostrarToast('Chave revogada.', { tom: 'sucesso' })
              setAlvo(null)
            },
            onError: () => mostrarToast('Não foi possível revogar a chave.', { tom: 'erro' }),
          })
        }}
      >
        <p className="text-sm text-tinta-2">
          A chave {alvo?.mascara} deixa de funcionar agora e não volta a valer. O cliente precisará de uma chave nova.
        </p>
      </ConfirmDialog>
    </Secao>
  )
}

function NovaChaveDialog({ contaId, aberto, aoFechar }: { contaId: string; aberto: boolean; aoFechar: () => void }) {
  return (
    <Dialog aberto={aberto} onFechar={aoFechar} titulo="Nova chave de API" className="max-w-md">
      {aberto && <FormNovaChave contaId={contaId} aoFechar={aoFechar} />}
    </Dialog>
  )
}

function FormNovaChave({ contaId, aoFechar }: { contaId: string; aoFechar: () => void }) {
  const [nome, setNome] = useState('')
  const [validade, setValidade] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [valor, setValor] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const criar = useCriarChaveApi(contaId)

  if (valor != null) {
    return (
      <div className="flex flex-col gap-4">
        <Banner tom="atencao">Copie a chave agora. Por segurança, ela não será mostrada de novo.</Banner>
        <input
          readOnly
          value={valor}
          aria-label="Chave de API"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 rounded-input border border-linha bg-papel-2 px-3 py-2.5 font-mono text-sm text-tinta"
        />
        <Button
          type="button"
          onClick={() => {
            void navigator.clipboard
              .writeText(valor)
              .then(() => setCopiado(true))
              .catch(() => setErro('Não foi possível copiar. Selecione o texto e copie manualmente.'))
          }}
        >
          {copiado ? 'Copiado!' : 'Copiar chave'}
        </Button>
        {erro && <Banner tom="erro">{erro}</Banner>}
        <Button type="button" variante="secondary" onClick={aoFechar}>
          Já guardei a chave
        </Button>
      </div>
    )
  }

  const salvar = () => {
    const nomeLimpo = nome.trim()
    if (nomeLimpo.length < 1) return setErro('Informe um nome para a chave.')
    // Validade opcional: vale ate o fim do dia (horario de Sao Paulo, sem horario de verao).
    const expira_em = validade ? new Date(`${validade}T23:59:59-03:00`).toISOString() : undefined
    if (expira_em && Date.parse(expira_em) <= Date.now()) return setErro('A validade precisa estar no futuro.')
    setErro(null)
    criar.mutate(
      { nome: nomeLimpo, ...(expira_em ? { expira_em } : {}) },
      {
        onSuccess: (r) => setValor(r.valor),
        onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível criar a chave.'),
      },
    )
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        salvar()
      }}
    >
      <Field label="Nome" dica="Identifica onde a chave é usada (ex.: integração com o ERP).">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} />
      </Field>
      <Field label="Validade (opcional)" dica="Deixe em branco para uma chave sem validade.">
        <Input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
      </Field>
      {erro && <Banner tom="erro">{erro}</Banner>}
      <div className="flex flex-col gap-2">
        <Button type="submit" loading={criar.isPending}>
          Criar chave
        </Button>
        <Button type="button" variante="secondary" disabled={criar.isPending} onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
