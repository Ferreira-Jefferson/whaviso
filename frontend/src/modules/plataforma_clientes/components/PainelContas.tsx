// Lista de contas (restaurantes clientes): busca por nome (min. 2 caracteres, com debounce),
// filtro por situacao da assinatura, paginacao por cursor ("Carregar mais") e ficha ao clicar.
import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Store } from 'lucide-react'
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Input,
  Select,
  Skeleton,
  TableResponsive,
  type ColunaTabela,
  type SelectOption,
} from '@/shared/ui'
import { formatarData } from '@/shared/format'
import {
  plataformaSituacaoConta,
  type PlataformaContaResumo,
  type PlataformaSituacaoConta,
} from '@/shared/contracts/_generated/plataforma_clientes'
import { useContas } from '../api'
import { ROTULO_SAUDE, ROTULO_SITUACAO, TOM_SAUDE, TOM_SITUACAO } from '../rotulos'
import { AreaErro } from './AreaErro'
import { FichaContaDialog } from './FichaContaDialog'
import { NovoClienteDialog } from './NovoClienteDialog'

type FiltroSituacao = PlataformaSituacaoConta | 'todas'

const OPCOES_SITUACAO: ReadonlyArray<SelectOption<FiltroSituacao>> = [
  { value: 'todas', label: 'Todas as situações' },
  ...plataformaSituacaoConta.options.map((s) => ({ value: s, label: ROTULO_SITUACAO[s] })),
]

const COLUNAS: ReadonlyArray<ColunaTabela<PlataformaContaResumo>> = [
  {
    chave: 'nome',
    titulo: 'Conta',
    principal: true,
    render: (c) => (
      <span className="flex items-center gap-3">
        <Avatar nome={c.nome} forma="quadrado" tamanho="md" />
        <span className="min-w-0 truncate font-medium text-tinta">{c.nome}</span>
      </span>
    ),
  },
  {
    chave: 'situacao',
    titulo: 'Situação',
    render: (c) => <Badge tom={TOM_SITUACAO[c.situacao]}>{ROTULO_SITUACAO[c.situacao]}</Badge>,
  },
  {
    chave: 'lojas',
    titulo: 'Lojas ativas',
    render: (c) => (
      <span className="tabular text-tinta-2">
        <span className="font-medium text-tinta">{c.qtd_lojas_ativas}</span> de {c.qtd_lojas}
      </span>
    ),
  },
  {
    chave: 'whatsapp',
    titulo: 'WhatsApp',
    render: (c) => <Badge tom={TOM_SAUDE[c.saude_whatsapp]}>{ROTULO_SAUDE[c.saude_whatsapp]}</Badge>,
  },
  { chave: 'criado', titulo: 'Cliente desde', render: (c) => <span className="tabular text-tinta-2">{formatarData(c.criado_em)}</span> },
]

/** Debounce simples do texto de busca para nao disparar uma requisicao por tecla. */
function useDebounce<T>(valor: T, ms: number): T {
  const [atual, setAtual] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setAtual(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return atual
}

export function PainelContas() {
  const [texto, setTexto] = useState('')
  const [situacao, setSituacao] = useState<FiltroSituacao>('todas')
  const [aberta, setAberta] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)

  const termo = useDebounce(texto.trim(), 300)
  // O backend exige >= 2 caracteres; abaixo disso a lista fica sem filtro de busca.
  const busca = termo.length >= 2 ? termo : undefined
  const lista = useContas({ busca, situacao: situacao === 'todas' ? undefined : situacao })

  const itens = useMemo(() => lista.data?.pages.flatMap((p) => p.itens) ?? [], [lista.data])
  const filtrando = busca !== undefined || situacao !== 'todas'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tinta-2" aria-hidden />
          <Input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por nome da conta ou da loja"
            aria-label="Buscar contas"
            maxLength={80}
            className="pl-9"
          />
        </div>
        <Select ariaLabel="Filtrar por situação" value={situacao} onChange={setSituacao} options={OPCOES_SITUACAO} className="w-full sm:w-56" />
        <Button onClick={() => setCriando(true)}>
          <Plus className="size-4" aria-hidden />
          Novo cliente
        </Button>
      </div>
      {texto.trim().length === 1 && <p className="-mt-2 text-xs text-tinta-2">Digite ao menos 2 letras para buscar.</p>}

      {lista.isPending && (
        <div aria-busy="true" aria-label="Carregando contas" className="flex flex-col gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {lista.isError && <AreaErro erro={lista.error} aoTentarDeNovo={() => void lista.refetch()} />}

      {lista.isSuccess && itens.length === 0 && (
        <EmptyState
          icone={<Store className="size-7" aria-hidden />}
          titulo={filtrando ? 'Nenhuma conta encontrada' : 'Ainda não há contas'}
          descricao={filtrando ? 'Ajuste a busca ou o filtro de situação.' : 'Quando um restaurante se cadastrar, ele aparece aqui.'}
        />
      )}

      {lista.isSuccess && itens.length > 0 && (
        <>
          <p className="text-sm text-tinta-2" aria-live="polite">
            {`${itens.length} ${itens.length === 1 ? 'conta' : 'contas'}`}
            {lista.hasNextPage ? (itens.length === 1 ? ' carregada' : ' carregadas') : ''}
            {filtrando ? ' no filtro atual' : ''}
          </p>
          <TableResponsive colunas={COLUNAS} linhas={itens} chaveLinha={(c) => c.id} onRowClick={(c) => setAberta(c.id)} legenda="Contas clientes" />
          {lista.hasNextPage && (
            <div className="flex justify-center">
              <Button variante="secondary" loading={lista.isFetchingNextPage} onClick={() => void lista.fetchNextPage()}>
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}

      <NovoClienteDialog aberto={criando} aoFechar={() => setCriando(false)} />
      <FichaContaDialog contaId={aberta} aoFechar={() => setAberta(null)} />
    </div>
  )
}
