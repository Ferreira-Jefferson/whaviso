// Detalhe do prospecto (operador): contato (telefone em claro so aqui, para ligar), estagio com
// historico, vinculo com a conta e linha do tempo de atividades (append-only) com follow-ups.
import { useMemo, useState, type ReactNode } from 'react'
import { Pencil, Phone, UserRound } from 'lucide-react'
import {
  Badge,
  Banner,
  Button,
  ConfirmDialog,
  DateInput,
  Dialog,
  Field,
  Input,
  Select,
  Skeleton,
  useToast,
} from '@/shared/ui'
import { telefone as formatarTelefone } from '@/shared/format'
import type { EstagioProspecto, TipoAtividadeProspecto } from '@/shared/contracts/_generated/enums'
import type { AtividadeDto } from '@/shared/contracts/_generated/plataforma_funil'
import {
  useAtividades,
  useCriarAtividade,
  useMudarEstagio,
  useProspecto,
  useVincularConta,
  type ProspectoDetalhe,
} from '../api'
import {
  ACAO_ESTAGIO,
  ROTULO_ATIVIDADE,
  ROTULO_ESTAGIO,
  TOM_ESTAGIO,
  TRANSICOES,
  isoSaoPaulo,
  quando,
} from '../rotulos'
import { mensagemDeErro } from '../erros'
import { AreaErro } from './AreaErro'
import { ConcluirFollowUpDialog, type AlvoConclusao } from './ConcluirFollowUpDialog'
import { ProspectoFormDialog } from './ProspectoFormDialog'
import { SeletorConta, type ContaEscolhida } from './SeletorConta'

interface Props {
  prospectoId: string | null
  aoFechar: () => void
}

export function ProspectoDialog({ prospectoId, aoFechar }: Props) {
  const detalhe = useProspecto(prospectoId)
  return (
    <Dialog
      aberto={prospectoId != null}
      onFechar={aoFechar}
      titulo={detalhe.data?.nome_restaurante ?? 'Prospecto'}
      className="max-h-[90dvh] max-w-2xl overflow-y-auto"
    >
      {prospectoId != null && detalhe.isPending && (
        <div aria-busy="true" aria-label="Carregando prospecto" className="flex flex-col gap-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {detalhe.isError && <AreaErro erro={detalhe.error} aoTentarDeNovo={() => void detalhe.refetch()} />}
      {detalhe.data && <Conteudo prospecto={detalhe.data} aoFechar={aoFechar} />}
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

function Conteudo({ prospecto: p, aoFechar }: { prospecto: ProspectoDetalhe; aoFechar: () => void }) {
  const [editando, setEditando] = useState(false)
  const [destino, setDestino] = useState<EstagioProspecto | null>(null)
  const [motivo, setMotivo] = useState('')
  const [concluindo, setConcluindo] = useState<AlvoConclusao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const mudar = useMudarEstagio()
  const { mostrarToast } = useToast()

  const proximos = TRANSICOES[p.estagio]

  const confirmarEstagio = () => {
    if (!destino) return
    setErro(null)
    const m = motivo.trim()
    mudar.mutate(
      { id: p.id, body: { estagio: destino, ...(m ? { motivo: m } : {}) } },
      {
        onSuccess: () => mostrarToast('Estágio atualizado.', { tom: 'sucesso' }),
        onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível mudar o estágio.')),
        onSettled: () => {
          setDestino(null)
          setMotivo('')
        },
      },
    )
  }

  return (
    <div className="text-tinta">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tom={TOM_ESTAGIO[p.estagio]}>{ROTULO_ESTAGIO[p.estagio]}</Badge>
        {p.conta_nome && <Badge tom="sucesso">Conta: {p.conta_nome}</Badge>}
        <span className="flex items-center gap-1.5 text-xs text-tinta-2">
          <UserRound className="size-3.5 flex-none" aria-hidden />
          {p.responsavel_nome ?? 'sem responsável'}
        </span>
        <Button variante="ghost" className="ml-auto min-h-9 px-3 py-1.5" onClick={() => setEditando(true)}>
          <Pencil className="size-4" aria-hidden />
          Editar
        </Button>
      </div>

      <Secao titulo="Contato">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <Linha rotulo="Nome" valor={p.contato_nome} />
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-tinta-2">Telefone</dt>
            <dd className="tabular font-medium">
              {p.contato_telefone ? (
                <a
                  href={`tel:${p.contato_telefone}`}
                  className="inline-flex items-center gap-1.5 text-salvia underline-offset-2 hover:underline"
                >
                  <Phone className="size-3.5" aria-hidden />
                  {formatarTelefone(p.contato_telefone)}
                </a>
              ) : (
                'Não informado'
              )}
            </dd>
          </div>
          <Linha rotulo="E-mail" valor={p.contato_email} />
          <Linha rotulo="Cidade" valor={p.cidade} />
          <Linha rotulo="Como chegou" valor={p.origem} />
        </dl>
        {p.observacoes && <p className="mt-2 whitespace-pre-line text-sm text-tinta-2">{p.observacoes}</p>}
      </Secao>

      <Secao titulo="Estágio">
        {erro && <Banner tom="erro" className="mb-3">{erro}</Banner>}
        {proximos.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {proximos.map((e) => (
              <Button key={e} variante={e === 'perdido' ? 'secondary' : 'primary'} className="min-h-9 px-4 py-1.5" disabled={mudar.isPending} onClick={() => setDestino(e)}>
                {ACAO_ESTAGIO[e]}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-tinta-2">Virou cliente. O estágio não muda mais por aqui.</p>
        )}
        {p.estagio !== 'ativo' && !p.conta_id && <VincularConta prospectoId={p.id} />}
      </Secao>

      <Secao titulo="Registrar atividade">
        <FormAtividade prospectoId={p.id} />
      </Secao>

      <Secao titulo="Histórico">
        <LinhaDoTempo prospectoId={p.id} nomeRestaurante={p.nome_restaurante} aoConcluir={setConcluindo} />
      </Secao>

      <div className="mt-6">
        <Button variante="secondary" className="w-full" onClick={aoFechar}>
          Fechar
        </Button>
      </div>

      <ProspectoFormDialog aberto={editando} prospecto={p} aoFechar={() => setEditando(false)} />
      <ConcluirFollowUpDialog alvo={concluindo} aoFechar={() => setConcluindo(null)} />
      <ConfirmDialog
        aberto={destino != null}
        titulo={destino ? `${ACAO_ESTAGIO[destino]}?` : ''}
        variante={destino === 'perdido' ? 'destructive' : 'primary'}
        textoConfirmar="Confirmar"
        carregando={mudar.isPending}
        onCancelar={() => {
          setDestino(null)
          setMotivo('')
        }}
        onConfirmar={confirmarEstagio}
      >
        <div className="flex flex-col gap-3">
          <p>
            {p.nome_restaurante}: de {ROTULO_ESTAGIO[p.estagio]} para {destino ? ROTULO_ESTAGIO[destino] : ''}. A mudança
            fica registrada no histórico.
          </p>
          <Field label="Motivo ">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />
          </Field>
        </div>
      </ConfirmDialog>
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-tinta-2">{rotulo}</dt>
      <dd className="font-medium">{valor ?? 'Não informado'}</dd>
    </div>
  )
}

function VincularConta({ prospectoId }: { prospectoId: string }) {
  const [conta, setConta] = useState<ContaEscolhida | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const vincular = useVincularConta()
  const { mostrarToast } = useToast()

  return (
    <div className="mt-4 rounded-input border border-linha p-3">
      <h4 className="text-sm font-medium">Já virou cliente?</h4>
      <p className="mb-2 text-xs text-tinta-2">Vincule à conta criada pelo cadastro do restaurante. Isso marca o prospecto como cliente.</p>
      <SeletorConta escolhida={conta} onEscolher={setConta} />
      {erro && <Banner tom="erro" className="mt-2">{erro}</Banner>}
      {conta && (
        <Button
          className="mt-3 min-h-9 px-4 py-1.5"
          loading={vincular.isPending}
          onClick={() => {
            setErro(null)
            vincular.mutate(
              { id: prospectoId, contaId: conta.id },
              {
                onSuccess: () => mostrarToast('Prospecto vinculado à conta.', { tom: 'sucesso' }),
                onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível vincular.')),
              },
            )
          }}
        >
          Vincular a {conta.nome}
        </Button>
      )}
    </div>
  )
}

const TIPOS_REGISTRO: ReadonlyArray<TipoAtividadeProspecto> = ['nota', 'ligacao', 'mensagem', 'reuniao', 'follow_up']

function FormAtividade({ prospectoId }: { prospectoId: string }) {
  const [tipo, setTipo] = useState<TipoAtividadeProspecto>('nota')
  const [texto, setTexto] = useState('')
  const [data, setData] = useState('')
  const [hora, setHora] = useState('09:00')
  const [erro, setErro] = useState<string | null>(null)
  const criar = useCriarAtividade()
  const { mostrarToast } = useToast()
  const ehFollowUp = tipo === 'follow_up'

  const salvar = () => {
    const descricao = texto.trim()
    if (tipo === 'nota' && !descricao) return setErro('Escreva a nota.')
    if (ehFollowUp && (!data || !/^\d{2}:\d{2}$/.test(hora))) return setErro('Escolha o dia e a hora do follow-up.')
    setErro(null)
    criar.mutate(
      {
        prospectoId,
        body: {
          tipo,
          ...(descricao ? { descricao } : {}),
          ...(ehFollowUp ? { agendada_para: isoSaoPaulo(data, hora) } : {}),
        },
      },
      {
        onSuccess: () => {
          mostrarToast(ehFollowUp ? 'Follow-up agendado.' : 'Atividade registrada.', { tom: 'sucesso' })
          setTexto('')
          setData('')
        },
        onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível registrar.')),
      },
    )
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        salvar()
      }}
    >
      <Select
        ariaLabel="Tipo de atividade"
        value={tipo}
        onChange={setTipo}
        options={TIPOS_REGISTRO.map((t) => ({ value: t, label: ROTULO_ATIVIDADE[t] }))}
      />
      {ehFollowUp && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Dia">
            <DateInput value={data} onChange={(e) => setData(e.target.value)} />
          </Field>
          <Field label="Hora">
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </Field>
        </div>
      )}
      <textarea
        aria-label="Descrição"
        placeholder={ehFollowUp ? 'O que combinar ' : 'O que aconteceu'}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={2}
        maxLength={2000}
        className="w-full rounded-input border border-linha bg-cartao px-3 py-2.5 text-sm text-tinta placeholder:text-tinta-2/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
      />
      {erro && <Banner tom="erro">{erro}</Banner>}
      <Button type="submit" className="self-start" loading={criar.isPending}>
        Registrar
      </Button>
    </form>
  )
}

function LinhaDoTempo({
  prospectoId,
  nomeRestaurante,
  aoConcluir,
}: {
  prospectoId: string
  nomeRestaurante: string
  aoConcluir: (alvo: AlvoConclusao) => void
}) {
  const lista = useAtividades(prospectoId)
  const itens = useMemo<AtividadeDto[]>(() => lista.data?.pages.flatMap((pg) => pg.itens) ?? [], [lista.data])
  // Follow-up em aberto = nenhum registro carregado o conclui.
  const concluidos = useMemo(() => new Set(itens.flatMap((a) => (a.conclui_atividade_id != null ? [a.conclui_atividade_id] : []))), [itens])

  if (lista.isPending) return <Skeleton className="h-20 w-full" />
  if (lista.isError) return <AreaErro erro={lista.error} aoTentarDeNovo={() => void lista.refetch()} />
  if (itens.length === 0) return <p className="text-sm text-tinta-2">Nenhuma atividade ainda.</p>

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3 border-l border-linha pl-4">
        {itens.map((a) => {
          const emAberto = a.tipo === 'follow_up' && !concluidos.has(a.id)
          const corPonto = emAberto
            ? 'border-ambar bg-ambar'
            : a.conclui_atividade_id != null
              ? 'border-folha bg-folha'
              : 'border-salvia bg-salvia'
          return (
            <li key={a.id} className="relative">
              <span className={`absolute -left-[21px] top-1.5 size-2.5 rounded-full border ${corPonto}`} aria-hidden />
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{ROTULO_ATIVIDADE[a.tipo]}</span>
                {a.tipo === 'follow_up' && (
                  <Badge tom={emAberto ? 'atencao' : 'sucesso'}>{emAberto ? 'Em aberto' : 'Concluído'}</Badge>
                )}
                {a.conclui_atividade_id != null && <Badge tom="sucesso">Concluiu follow-up</Badge>}
                <span className="text-xs text-tinta-2">
                  {quando(a.criado_em)} · {a.operador_nome ?? 'Sistema'}
                </span>
              </div>
              {a.agendada_para && <p className="text-xs text-tinta-2">Marcado para {quando(a.agendada_para)}</p>}
              {a.descricao && <p className="mt-0.5 whitespace-pre-line text-sm text-tinta-2">{a.descricao}</p>}
              {emAberto && (
                <Button
                  variante="secondary"
                  className="mt-2 min-h-9 px-3 py-1.5"
                  onClick={() => aoConcluir({ prospectoId, atividadeId: a.id, nomeRestaurante })}
                >
                  Concluir
                </Button>
              )}
            </li>
          )
        })}
      </ol>
      {lista.hasNextPage && (
        <Button variante="ghost" className="self-start" loading={lista.isFetchingNextPage} onClick={() => void lista.fetchNextPage()}>
          Ver mais antigas
        </Button>
      )}
    </div>
  )
}
