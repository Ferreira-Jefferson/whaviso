// Pool de chaves de LLM da plataforma: lista que o admin mantem (ex.: uma conta OpenRouter do
// whaviso) para atribuir a uma loja em vez de exigir que ela cadastre a propria. A atribuicao por
// loja fica em /plataforma/usuarios (e sobre a loja, nao sobre o pool); aqui e so o CRUD do pool.
import { useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import {
  Badge, Button, Card, Dialog, EmptyState, Field, Input, Select, Skeleton, Switch,
  TableResponsive, useToast, type ColunaTabela, type SelectOption,
} from '@/shared/ui'
import { useAjustarPoolLlm, useCriarPoolLlm, usePoolLlm } from '../api'
import type { PoolLlmItem, ProvedorLlm } from '../contracts'
import { AreaErro } from './AreaErro'

function mensagem(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}

const OPCOES_PROVEDOR: ReadonlyArray<SelectOption<ProvedorLlm>> = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'outro', label: 'Outro' },
]

export function PainelPoolLlm() {
  const lista = usePoolLlm()
  const ajustar = useAjustarPoolLlm()
  const { mostrarToast } = useToast()
  const [criando, setCriando] = useState(false)
  const [rotacionando, setRotacionando] = useState<PoolLlmItem | null>(null)
  const itens = lista.data ?? []

  const alternar = (item: PoolLlmItem, ativo: boolean) =>
    ajustar.mutate(
      { id: item.id, patch: { ativo } },
      {
        onSuccess: () => mostrarToast(ativo ? 'Chave ativada.' : 'Chave desativada.', { tom: 'sucesso' }),
        onError: (e) => mostrarToast(mensagem(e, 'Não foi possível alterar a chave.'), { tom: 'erro' }),
      },
    )

  const colunas: ReadonlyArray<ColunaTabela<PoolLlmItem>> = [
    { chave: 'nome', titulo: 'Nome', principal: true, render: (p) => <span className="font-medium">{p.nome}</span> },
    {
      chave: 'provedor',
      titulo: 'Provedor',
      render: (p) => <span className="text-tinta-2">{OPCOES_PROVEDOR.find((o) => o.value === p.provedor)?.label ?? p.provedor}</span>,
    },
    {
      chave: 'chave',
      titulo: 'Chave',
      render: (p) => <span className="tabular text-sm text-tinta-2">{p.ultimos4 ? `•••• ${p.ultimos4}` : 'Cadastrada'}</span>,
    },
    {
      chave: 'situacao',
      titulo: 'Situação',
      render: (p) => (
        <span className="flex items-center gap-2">
          <Badge tom={p.ativo ? 'sucesso' : 'neutro'}>{p.ativo ? 'Ativa' : 'Inativa'}</Badge>
          <span onClick={(e) => e.stopPropagation()}>
            <Switch
              ligado={p.ativo}
              rotulo={p.ativo ? `Desativar ${p.nome}` : `Ativar ${p.nome}`}
              carregando={ajustar.isPending && ajustar.variables?.id === p.id}
              onMudar={(v) => alternar(p, v)}
            />
          </span>
        </span>
      ),
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      alinhar: 'direita',
      render: (p) => (
        <Button variante="ghost" onClick={() => setRotacionando(p)}>
          Rotacionar
        </Button>
      ),
    },
  ]

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Sparkles className="size-5 flex-none text-salvia" aria-hidden />
        <div className="flex flex-1 flex-col gap-1">
          <h2 className="text-lg text-salvia">Pool de chaves de IA</h2>
          <p className="text-sm text-tinta-2">
            Chaves da plataforma que uma loja pode usar em vez de cadastrar a própria. Quem escolhe
            qual loja usa qual chave é em Usuários, na ficha da loja.
          </p>
        </div>
        <Button variante="secondary" onClick={() => setCriando(true)}>
          <Plus className="size-4" aria-hidden />
          Nova chave
        </Button>
      </div>

      {lista.isPending && (
        <div aria-busy="true" aria-label="Carregando pool de chaves" className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {lista.isError && <AreaErro erro={lista.error} aoTentarDeNovo={() => void lista.refetch()} />}
      {lista.isSuccess && itens.length === 0 && (
        <EmptyState
          icone={<Sparkles className="size-7" aria-hidden />}
          titulo="Nenhuma chave no pool ainda"
          descricao="Crie a primeira chave para poder atribuí-la a uma loja."
        />
      )}
      {lista.isSuccess && itens.length > 0 && (
        <TableResponsive colunas={colunas} linhas={itens} chaveLinha={(p) => p.id} legenda="Pool de chaves de IA" />
      )}

      <Dialog aberto={criando} onFechar={() => setCriando(false)} titulo="Nova chave do pool" className="max-w-md">
        {criando && <FormNovaChave aoFechar={() => setCriando(false)} />}
      </Dialog>
      <Dialog aberto={rotacionando != null} onFechar={() => setRotacionando(null)} titulo="Rotacionar chave" className="max-w-md">
        {rotacionando && <FormRotacionar item={rotacionando} aoFechar={() => setRotacionando(null)} />}
      </Dialog>
    </Card>
  )
}

function FormNovaChave({ aoFechar }: { aoFechar: () => void }) {
  const [nome, setNome] = useState('')
  const [provedor, setProvedor] = useState<ProvedorLlm>('openrouter')
  const [chave, setChave] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const criar = useCriarPoolLlm()
  const { mostrarToast } = useToast()

  const salvar = () => {
    if (!nome.trim()) return setErro('Informe um nome pra essa chave.')
    if (!chave.trim()) return setErro('Informe a chave.')
    setErro(null)
    criar.mutate(
      { nome: nome.trim(), provedor, chave: chave.trim() },
      {
        onSuccess: () => {
          mostrarToast('Chave criada.', { tom: 'sucesso' })
          aoFechar()
        },
        onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível criar a chave.'),
      },
    )
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); salvar() }}>
      <Field label="Nome" dica="Só pra você reconhecer na lista, ex.: 'Conta principal'.">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} />
      </Field>
      <Field label="Provedor">
        <Select ariaLabel="Provedor da chave" value={provedor} onChange={setProvedor} options={OPCOES_PROVEDOR} />
      </Field>
      <Field label="Chave">
        <Input type="password" autoComplete="off" value={chave} onChange={(e) => setChave(e.target.value)} placeholder="sk-or-..." />
      </Field>
      {erro && <p className="text-sm text-barro">{erro}</p>}
      <div className="flex flex-col gap-2">
        <Button type="submit" loading={criar.isPending}>Criar chave</Button>
        <Button type="button" variante="secondary" disabled={criar.isPending} onClick={aoFechar}>Cancelar</Button>
      </div>
    </form>
  )
}

function FormRotacionar({ item, aoFechar }: { item: PoolLlmItem; aoFechar: () => void }) {
  const [chave, setChave] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const ajustar = useAjustarPoolLlm()
  const { mostrarToast } = useToast()

  const salvar = () => {
    if (!chave.trim()) return setErro('Informe a nova chave.')
    setErro(null)
    ajustar.mutate(
      { id: item.id, patch: { chave: chave.trim() } },
      {
        onSuccess: () => {
          mostrarToast('Chave rotacionada.', { tom: 'sucesso' })
          aoFechar()
        },
        onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível rotacionar a chave.'),
      },
    )
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); salvar() }}>
      <p className="text-sm text-tinta-2">
        Troca a chave de <strong className="text-tinta">{item.nome}</strong>. Lojas atribuídas a ela
        passam a usar a nova chave no próximo atendimento.
      </p>
      <Field label="Nova chave">
        <Input type="password" autoComplete="off" value={chave} onChange={(e) => setChave(e.target.value)} placeholder="sk-or-..." />
      </Field>
      {erro && <p className="text-sm text-barro">{erro}</p>}
      <div className="flex flex-col gap-2">
        <Button type="submit" loading={ajustar.isPending}>Rotacionar</Button>
        <Button type="button" variante="secondary" disabled={ajustar.isPending} onClick={aoFechar}>Cancelar</Button>
      </div>
    </form>
  )
}
