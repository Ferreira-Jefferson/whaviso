// Assinaturas (operador): lista por situacao, criacao (trial ou ativa) e alteracao (suspender,
// reativar, cancelar, valor e vencimento). Valor/vencimento valem so para faturas FUTURAS. A
// suspensao da loja deriva do status da assinatura (trigger no banco); aqui so mudamos o status.
import { useState } from 'react'
import { CreditCard, Plus, Repeat } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import {
  Badge,
  Banner,
  Button,
  ConfirmDialog,
  DateInput,
  Dialog,
  EmptyState,
  Field,
  Input,
  MoneyInput,
  MoneyText,
  Select,
  Skeleton,
  TableResponsive,
  useToast,
  type ColunaTabela,
  type SelectOption,
} from '@/shared/ui'
import { formatarData } from '@/shared/format'
import {
  statusAssinatura,
  type AssinaturaDTO,
  type AssinaturaPatch,
  type StatusAssinatura,
} from '@/shared/contracts/_generated/plataforma_cobranca'
import { useAlterarAssinatura, useAssinaturas, useCriarAssinatura, useNomesContas } from '../api'
import {
  ACAO_TRANSICAO,
  ROTULO_STATUS_ASSINATURA,
  TOM_STATUS_ASSINATURA,
  TRANSICOES,
  idCurto,
} from '../rotulos'
import { AreaErro } from './AreaErro'
import { SeletorConta, type ContaEscolhida } from './SeletorConta'

type FiltroStatus = StatusAssinatura | 'todas'

const OPCOES_STATUS: ReadonlyArray<SelectOption<FiltroStatus>> = [
  { value: 'todas', label: 'Todas as situações' },
  ...statusAssinatura.options.map((s) => ({ value: s, label: ROTULO_STATUS_ASSINATURA[s] })),
]

const VALOR_PADRAO_CENTAVOS = 70000
const DIA_PADRAO = 10

function mensagem(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}

/** Dia de vencimento: inteiro 1..28 (existe em todo mes). */
function diaValido(texto: string): number | null {
  if (!/^\d{1,2}$/.test(texto.trim())) return null
  const n = Number(texto)
  return n >= 1 && n <= 28 ? n : null
}

export function PainelAssinaturas() {
  const [status, setStatus] = useState<FiltroStatus>('todas')
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<AssinaturaDTO | null>(null)

  const lista = useAssinaturas(status === 'todas' ? undefined : status)
  const nomes = useNomesContas()
  const itens = lista.data ?? []
  const nomeConta = (id: string) => nomes.data?.get(id) ?? `Conta ${idCurto(id)}`

  // Receita mensal recorrente das assinaturas ativas visiveis e quantas estao suspensas: a leitura
  // de saude que o operador quer antes de abrir uma linha. So apresentacao (deriva da lista).
  const ativas = itens.filter((a) => a.status === 'ativa')
  const mrrCentavos = ativas.reduce((soma, a) => soma + a.valor_mensal_centavos, 0)
  const qtdSuspensas = itens.filter((a) => a.status === 'suspensa').length

  const colunas: ReadonlyArray<ColunaTabela<AssinaturaDTO>> = [
      { chave: 'conta', titulo: 'Conta', principal: true, render: (a) => <span className="font-medium">{nomeConta(a.conta_id)}</span> },
      {
        chave: 'status',
        titulo: 'Situação',
        render: (a) => <Badge tom={TOM_STATUS_ASSINATURA[a.status]}>{ROTULO_STATUS_ASSINATURA[a.status]}</Badge>,
      },
      { chave: 'valor', titulo: 'Valor mensal', alinhar: 'direita', render: (a) => <MoneyText centavos={a.valor_mensal_centavos} /> },
      { chave: 'dia', titulo: 'Vencimento', render: (a) => <span className="tabular text-tinta-2">Dia {a.dia_vencimento}</span> },
      {
        chave: 'datas',
        titulo: 'Teste até',
        render: (a) => <span className="tabular text-tinta-2">{a.trial_ate && a.status === 'trial' ? formatarData(a.trial_ate) : 'Sem data'}</span>,
      },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Select ariaLabel="Filtrar por situação" value={status} onChange={setStatus} options={OPCOES_STATUS} className="w-full sm:w-52" />
          <Button className="max-sm:w-full" onClick={() => setCriando(true)}>
            <Plus className="size-4" aria-hidden />
            Nova assinatura
          </Button>
        </div>
        {lista.isSuccess && (ativas.length > 0 || qtdSuspensas > 0) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tinta-2">
            <Repeat className="size-4 flex-none text-salvia" strokeWidth={1.75} aria-hidden />
            <MoneyText centavos={mrrCentavos} className="text-salvia" />
            <span>
              por mês em {ativas.length} {ativas.length === 1 ? 'assinatura ativa' : 'assinaturas ativas'}
            </span>
            {qtdSuspensas > 0 && (
              <span className="inline-flex items-center rounded-pill bg-ambar-claro px-2.5 py-0.5 text-xs font-bold text-ambar">
                {qtdSuspensas} {qtdSuspensas === 1 ? 'suspensa' : 'suspensas'}
              </span>
            )}
          </div>
        )}
      </div>

      {lista.isPending && (
        <div aria-busy="true" aria-label="Carregando assinaturas" className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {lista.isError && <AreaErro erro={lista.error} aoTentarDeNovo={() => void lista.refetch()} />}
      {lista.isSuccess && itens.length === 0 && (
        <EmptyState
          icone={<CreditCard className="size-7" aria-hidden />}
          titulo="Nenhuma assinatura"
          descricao="Crie a assinatura de uma conta para começar a faturar."
        />
      )}
      {lista.isSuccess && itens.length > 0 && (
        <TableResponsive colunas={colunas} linhas={itens} chaveLinha={(a) => a.id} onRowClick={setEditando} legenda="Assinaturas" />
      )}

      <Dialog aberto={criando} onFechar={() => setCriando(false)} titulo="Nova assinatura" className="max-w-md">
        {criando && <FormCriar aoFechar={() => setCriando(false)} />}
      </Dialog>
      <Dialog
        aberto={editando != null}
        onFechar={() => setEditando(null)}
        titulo={editando ? nomeConta(editando.conta_id) : 'Assinatura'}
        className="max-w-md"
      >
        {editando && <FormEditar key={editando.id} assinatura={editando} aoFechar={() => setEditando(null)} />}
      </Dialog>
    </div>
  )
}

function FormCriar({ aoFechar }: { aoFechar: () => void }) {
  const [conta, setConta] = useState<ContaEscolhida | null>(null)
  const [tipo, setTipo] = useState<'trial' | 'ativa'>('trial')
  const [trialAte, setTrialAte] = useState('')
  const [valor, setValor] = useState<number | null>(VALOR_PADRAO_CENTAVOS)
  const [dia, setDia] = useState(String(DIA_PADRAO))
  const [erro, setErro] = useState<string | null>(null)
  const criar = useCriarAssinatura()
  const { mostrarToast } = useToast()

  const salvar = () => {
    const diaNum = diaValido(dia)
    if (!conta) return setErro('Escolha a conta.')
    if (valor === null || valor <= 0) return setErro('Informe o valor mensal.')
    if (diaNum === null) return setErro('O dia de vencimento vai de 1 a 28.')
    if (tipo === 'trial' && !trialAte) return setErro('Informe até quando vai o teste.')
    setErro(null)
    criar.mutate(
      {
        conta_id: conta.id,
        status: tipo,
        valor_mensal_centavos: valor,
        dia_vencimento: diaNum,
        // Fim do dia em Sao Paulo (UTC-3, sem horario de verao desde 2019).
        ...(tipo === 'trial' ? { trial_ate: `${trialAte}T23:59:59-03:00` } : {}),
      },
      {
        onSuccess: () => {
          mostrarToast('Assinatura criada.', { tom: 'sucesso' })
          aoFechar()
        },
        onError: (e) => setErro(mensagem(e, 'Não foi possível criar.')),
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
      <Field label="Conta">
        <SeletorConta escolhida={conta} onEscolher={setConta} />
      </Field>
      <Field label="Começa como">
        <Select
          ariaLabel="Começa como"
          value={tipo}
          onChange={setTipo}
          options={[
            { value: 'trial', label: 'Em teste' },
            { value: 'ativa', label: 'Ativa (já cobra)' },
          ]}
        />
      </Field>
      {tipo === 'trial' && (
        <Field label="Teste até">
          <DateInput value={trialAte} onChange={(e) => setTrialAte(e.target.value)} />
        </Field>
      )}
      <Field label="Valor mensal">
        <MoneyInput value={valor} onChange={setValor} />
      </Field>
      <Field label="Dia de vencimento" dica="De 1 a 28, para existir em todos os meses.">
        <Input inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} maxLength={2} />
      </Field>
      {erro && <Banner tom="erro">{erro}</Banner>}
      <div className="flex flex-col gap-2">
        <Button type="submit" loading={criar.isPending}>
          Criar assinatura
        </Button>
        <Button type="button" variante="secondary" disabled={criar.isPending} onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

function FormEditar({ assinatura, aoFechar }: { assinatura: AssinaturaDTO; aoFechar: () => void }) {
  const [valor, setValor] = useState<number | null>(assinatura.valor_mensal_centavos)
  const [dia, setDia] = useState(String(assinatura.dia_vencimento))
  const [erro, setErro] = useState<string | null>(null)
  const [transicao, setTransicao] = useState<StatusAssinatura | null>(null)
  const alterar = useAlterarAssinatura()
  const { mostrarToast } = useToast()

  const destinos = TRANSICOES[assinatura.status]
  const encerrada = destinos.length === 0

  const enviar = (patch: AssinaturaPatch, ok: string) => {
    setErro(null)
    alterar.mutate(
      { id: assinatura.id, patch },
      {
        onSuccess: () => {
          mostrarToast(ok, { tom: 'sucesso' })
          setTransicao(null)
          aoFechar()
        },
        onError: (e) => {
          setTransicao(null)
          setErro(mensagem(e, 'Não foi possível salvar.'))
        },
      },
    )
  }

  const salvarValores = () => {
    const diaNum = diaValido(dia)
    if (valor === null || valor <= 0) return setErro('Informe o valor mensal.')
    if (diaNum === null) return setErro('O dia de vencimento vai de 1 a 28.')
    const patch: { valor_mensal_centavos?: number; dia_vencimento?: number } = {}
    if (valor !== assinatura.valor_mensal_centavos) patch.valor_mensal_centavos = valor
    if (diaNum !== assinatura.dia_vencimento) patch.dia_vencimento = diaNum
    if (Object.keys(patch).length === 0) return aoFechar()
    enviar(patch, 'Assinatura atualizada.')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Badge tom={TOM_STATUS_ASSINATURA[assinatura.status]}>{ROTULO_STATUS_ASSINATURA[assinatura.status]}</Badge>
        {assinatura.cancelada_em && <span className="text-xs text-tinta-2">em {formatarData(assinatura.cancelada_em)}</span>}
      </div>

      {!encerrada && (
        <>
          <Field label="Valor mensal">
            <MoneyInput value={valor} onChange={setValor} />
          </Field>
          <Field label="Dia de vencimento" dica="De 1 a 28.">
            <Input inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} maxLength={2} />
          </Field>
          <p className="text-xs text-tinta-2">Mudanças de valor e vencimento valem só para as próximas faturas. A fatura já emitida não muda.</p>
        </>
      )}
      {encerrada && <Banner tom="info">Assinatura cancelada não muda mais. Para voltar a cobrar, crie uma nova.</Banner>}

      {erro && <Banner tom="erro">{erro}</Banner>}

      <div className="flex flex-col gap-2">
        {!encerrada && (
          <Button loading={alterar.isPending && transicao === null} onClick={salvarValores}>
            Salvar valor e vencimento
          </Button>
        )}
        {destinos.map((d) => (
          <Button
            key={d}
            variante={d === 'cancelada' ? 'destructive' : 'secondary'}
            disabled={alterar.isPending}
            onClick={() => setTransicao(d)}
          >
            {ACAO_TRANSICAO[d]}
          </Button>
        ))}
        <Button variante="ghost" onClick={aoFechar}>
          Fechar
        </Button>
      </div>

      <ConfirmDialog
        aberto={transicao != null}
        titulo={transicao ? `${ACAO_TRANSICAO[transicao]}?` : ''}
        variante={transicao === 'cancelada' || transicao === 'suspensa' ? 'destructive' : 'primary'}
        textoConfirmar={transicao ? ACAO_TRANSICAO[transicao] : 'Confirmar'}
        carregando={alterar.isPending}
        onCancelar={() => setTransicao(null)}
        onConfirmar={() => transicao && enviar({ status: transicao }, 'Situação atualizada.')}
      >
        {transicao === 'suspensa' && 'A loja deixa de atender pedidos até a assinatura ser reativada.'}
        {transicao === 'cancelada' && 'A loja deixa de atender e a assinatura não pode ser retomada. Esta ação não volta atrás.'}
        {transicao === 'ativa' && 'A assinatura volta a ser cobrada e a loja volta a atender.'}
      </ConfirmDialog>
    </div>
  )
}
