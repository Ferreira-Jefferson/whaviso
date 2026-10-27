// Lista de prospectos: busca (nome do restaurante/contato), filtro por estagio e cidade, paginacao
// por cursor. Telefone aparece so mascarado.
import { useEffect, useMemo, useState } from 'react'
import { Search, UserSearch } from 'lucide-react'
import {
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
import type { EstagioProspecto } from '@/shared/contracts/_generated/enums'
import type { ProspectoDto } from '@/shared/contracts/_generated/plataforma_funil'
import { useProspectos } from '../api'
import { ESTAGIOS, ROTULO_ESTAGIO, TOM_ESTAGIO, quando } from '../rotulos'
import { AreaErro } from './AreaErro'

type FiltroEstagio = EstagioProspecto | 'todos'

const OPCOES_ESTAGIO: ReadonlyArray<SelectOption<FiltroEstagio>> = [
  { value: 'todos', label: 'Todos os estágios' },
  ...ESTAGIOS.map((e) => ({ value: e, label: ROTULO_ESTAGIO[e] })),
]

const COLUNAS: ReadonlyArray<ColunaTabela<ProspectoDto>> = [
  { chave: 'nome', titulo: 'Restaurante', principal: true, render: (p) => <span className="font-medium">{p.nome_restaurante}</span> },
  { chave: 'estagio', titulo: 'Estágio', render: (p) => <Badge tom={TOM_ESTAGIO[p.estagio]}>{ROTULO_ESTAGIO[p.estagio]}</Badge> },
  { chave: 'contato', titulo: 'Contato', render: (p) => <span className="text-tinta-2">{p.contato_nome ?? 'Sem nome'}</span> },
  { chave: 'telefone', titulo: 'Telefone', render: (p) => <span className="tabular text-tinta-2">{p.contato_telefone_mascarado ?? 'Não informado'}</span> },
  { chave: 'cidade', titulo: 'Cidade', render: (p) => <span className="text-tinta-2">{p.cidade ?? 'Não informada'}</span> },
  { chave: 'resp', titulo: 'Responsável', render: (p) => <span className="text-tinta-2">{p.responsavel_nome ?? 'Sem responsável'}</span> },
  { chave: 'atualizado', titulo: 'Atualizado', render: (p) => <span className="tabular text-tinta-2">{quando(p.atualizado_em)}</span> },
]

function useDebounce<T>(valor: T, ms: number): T {
  const [atual, setAtual] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setAtual(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return atual
}

export function ListaProspectos({ aoAbrir }: { aoAbrir: (id: string) => void }) {
  const [texto, setTexto] = useState('')
  const [cidadeTexto, setCidadeTexto] = useState('')
  const [estagio, setEstagio] = useState<FiltroEstagio>('todos')

  const q = useDebounce(texto.trim(), 300)
  const cidade = useDebounce(cidadeTexto.trim(), 300)
  const lista = useProspectos({
    estagio: estagio === 'todos' ? undefined : estagio,
    q: q || undefined,
    cidade: cidade || undefined,
  })
  const itens = useMemo(() => lista.data?.pages.flatMap((p) => p.itens) ?? [], [lista.data])
  const filtrando = q !== '' || cidade !== '' || estagio !== 'todos'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tinta-2" aria-hidden />
          <Input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar restaurante ou contato"
            aria-label="Buscar prospectos"
            maxLength={120}
            className="pl-9"
          />
        </div>
        <Input
          value={cidadeTexto}
          onChange={(e) => setCidadeTexto(e.target.value)}
          placeholder="Cidade"
          aria-label="Filtrar por cidade"
          maxLength={80}
          className="w-full sm:w-44"
        />
        <Select ariaLabel="Filtrar por estágio" value={estagio} onChange={setEstagio} options={OPCOES_ESTAGIO} className="w-full sm:w-52" />
      </div>

      {lista.isPending && (
        <div aria-busy="true" aria-label="Carregando prospectos" className="flex flex-col gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {lista.isError && <AreaErro erro={lista.error} aoTentarDeNovo={() => void lista.refetch()} />}
      {lista.isSuccess && itens.length === 0 && (
        <EmptyState
          icone={<UserSearch className="size-7" aria-hidden />}
          titulo={filtrando ? 'Nenhum prospecto encontrado' : 'Ainda não há prospectos'}
          descricao={filtrando ? 'Ajuste a busca ou os filtros.' : 'Cadastre o primeiro restaurante que você quer conquistar.'}
        />
      )}
      {lista.isSuccess && itens.length > 0 && (
        <>
          <p className="text-xs text-tinta-2" aria-live="polite">
            {itens.length} {itens.length === 1 ? 'prospecto' : 'prospectos'}
            {lista.hasNextPage ? ' carregados' : ''}
            {filtrando ? ' no filtro atual' : ''}
          </p>
          <TableResponsive colunas={COLUNAS} linhas={itens} chaveLinha={(p) => p.id} onRowClick={(p) => aoAbrir(p.id)} legenda="Prospectos" />
          {lista.hasNextPage && (
            <div className="flex justify-center">
              <Button variante="secondary" loading={lista.isFetchingNextPage} onClick={() => void lista.fetchNextPage()}>
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
