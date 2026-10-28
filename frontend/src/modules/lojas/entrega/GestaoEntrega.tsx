// Gestao das zonas de entrega de UMA loja, como conteudo da aba "Entrega" do editor de loja.
// Zonas (bairro, poligono ou raio) com taxa do cliente, valor do motoboy, pedido minimo e frete
// gratis. Resumo + lista + cadastro/edicao + importacao de bairros. Dinheiro em centavos.
// A api e escopada pela loja ativa do shell (header x-loja-id): o editor torna a loja ativa antes
// de mostrar esta aba. Estados loading/empty/error; mobile-first.
import { type ReactNode, useState } from 'react'
import { Bike, Circle, Hexagon, ListPlus, MapPin, MapPinned, Plus, Wallet } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  SegmentedControl,
  Skeleton,
  TableResponsive,
  type ColunaTabela,
} from '@/shared/ui'
import { formatarCentavos } from '@/shared/format'
import { useZonas, type Zona } from './api'
import { ROTULO_TIPO, resumoDaArea } from './estados'
import { LoteDialog } from './LoteDialog'
import { ZonaDialog } from './ZonaDialog'

const ICONE_TIPO: Record<Zona['tipo'], ReactNode> = {
  bairro: <MapPin className="size-3" aria-hidden />,
  raio: <Circle className="size-3" aria-hidden />,
  poligono: <Hexagon className="size-3" aria-hidden />,
}

const COLUNAS: ReadonlyArray<ColunaTabela<Zona>> = [
  {
    chave: 'nome',
    titulo: 'Zona',
    principal: true,
    render: (z) => (
      <span className="flex flex-wrap items-center gap-2 font-medium">
        {z.nome}
        {!z.ativo && <Badge tom="neutro">Desativada</Badge>}
        {z.pedidos_em_aberto > 0 && (
          <Badge tom="atencao">
            {z.pedidos_em_aberto} {z.pedidos_em_aberto === 1 ? 'pedido em andamento' : 'pedidos em andamento'}
          </Badge>
        )}
      </span>
    ),
  },
  {
    chave: 'area',
    titulo: 'Área',
    render: (z) => (
      <span className="flex flex-wrap items-center gap-2">
        <Badge tom="neutro" className="gap-1 font-medium">
          {ICONE_TIPO[z.tipo]}
          {ROTULO_TIPO[z.tipo]}
        </Badge>
        <span className="text-tinta-2">{resumoDaArea(z)}</span>
      </span>
    ),
  },
  {
    chave: 'taxa',
    titulo: 'Taxa do cliente',
    alinhar: 'direita',
    render: (z) => <span className="tabular">{formatarCentavos(z.taxa_cliente_centavos)}</span>,
  },
  {
    chave: 'motoboy',
    titulo: 'Motoboy recebe',
    alinhar: 'direita',
    render: (z) => <span className="tabular">{formatarCentavos(z.valor_motoboy_centavos)}</span>,
  },
  {
    chave: 'minimo',
    titulo: 'Pedido mínimo',
    alinhar: 'direita',
    render: (z) => (
      <span className="tabular text-tinta-2">
        {z.pedido_minimo_centavos == null ? 'Sem mínimo' : formatarCentavos(z.pedido_minimo_centavos)}
      </span>
    ),
  },
  {
    chave: 'frete',
    titulo: 'Frete grátis acima de',
    alinhar: 'direita',
    render: (z) => (
      <span className="tabular text-tinta-2">
        {z.frete_gratis_acima_centavos == null ? 'Não tem' : formatarCentavos(z.frete_gratis_acima_centavos)}
      </span>
    ),
  },
]

/** Faixa de valores (menor a maior) de uma lista de centavos, formatada em BRL. */
function faixaCentavos(valores: ReadonlyArray<number>): string {
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  return min === max ? formatarCentavos(min) : `${formatarCentavos(min)} a ${formatarCentavos(max)}`
}

function ResumoZona({ rotulo, valor, detalhe, icone }: { rotulo: string; valor: string; detalhe?: string; icone: ReactNode }) {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-tinta-2">{rotulo}</span>
        <span className="inline-flex size-8 flex-none items-center justify-center rounded-full bg-papel-2 text-tinta-2">
          {icone}
        </span>
      </div>
      <span className="tabular text-2xl tracking-tight text-tinta">{valor}</span>
      {detalhe && <span className="text-xs text-tinta-2">{detalhe}</span>}
    </Card>
  )
}

function Resumo({ itens, incluirInativas }: { itens: ReadonlyArray<Zona>; incluirInativas: boolean }) {
  const ativas = itens.filter((z) => z.ativo).length
  const comFreteGratis = itens.filter((z) => z.frete_gratis_acima_centavos != null).length
  const detalheContagem = incluirInativas
    ? `${ativas} ${ativas === 1 ? 'ativa' : 'ativas'}, ${itens.length - ativas} ${itens.length - ativas === 1 ? 'desativada' : 'desativadas'}`
    : comFreteGratis > 0
      ? `${comFreteGratis} com frete grátis`
      : undefined
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <ResumoZona
        rotulo={incluirInativas ? 'Zonas cadastradas' : 'Zonas ativas'}
        valor={String(itens.length)}
        detalhe={detalheContagem}
        icone={<MapPinned className="size-4" aria-hidden />}
      />
      <ResumoZona
        rotulo="Taxa do cliente"
        valor={faixaCentavos(itens.map((z) => z.taxa_cliente_centavos))}
        icone={<Wallet className="size-4" aria-hidden />}
      />
      <ResumoZona
        rotulo="Motoboy recebe"
        valor={faixaCentavos(itens.map((z) => z.valor_motoboy_centavos))}
        icone={<Bike className="size-4" aria-hidden />}
      />
    </div>
  )
}

/** Conteudo da aba Entrega: as zonas de entrega da loja ativa. */
export function GestaoEntrega() {
  const [incluirInativas, setIncluirInativas] = useState(false)
  const [editando, setEditando] = useState<Zona | null>(null)
  const [criando, setCriando] = useState(false)
  const [importando, setImportando] = useState(false)

  const lista = useZonas(incluirInativas)
  const itens = lista.data?.itens ?? []
  const vazio = lista.isSuccess && itens.length === 0

  const fechar = () => {
    setEditando(null)
    setCriando(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold text-tinta">Zonas de entrega</h3>
          <p className="mt-0.5 text-sm text-tinta-2">
            Defina onde a loja entrega, quanto o cliente paga e quanto o motoboy recebe.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variante="secondary" onClick={() => setImportando(true)}>
            <ListPlus className="size-4" aria-hidden />
            Importar bairros
          </Button>
          <Button onClick={() => setCriando(true)}>
            <Plus className="size-4" aria-hidden />
            Nova zona
          </Button>
        </div>
      </div>

      <SegmentedControl
        ariaLabel="Filtrar por situação"
        value={incluirInativas ? 'todas' : 'ativas'}
        onChange={(v) => setIncluirInativas(v === 'todas')}
        options={[
          { value: 'ativas', label: 'Ativas' },
          { value: 'todas', label: 'Todas' },
        ]}
      />

      {lista.isPending && (
        <div aria-busy="true" aria-label="Carregando zonas" className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {lista.isError && <ErrorState aoTentarDeNovo={() => void lista.refetch()} />}

      {lista.isSuccess && itens.length > 0 && <Resumo itens={itens} incluirInativas={incluirInativas} />}

      {vazio && (
        <EmptyState
          icone={<MapPinned className="size-7" aria-hidden />}
          titulo={incluirInativas ? 'Nenhuma zona cadastrada' : 'Ainda sem zonas ativas'}
          descricao="Cadastre as zonas de entrega para cobrar a taxa certa e pagar o motoboy."
          acao={
            <Button onClick={() => setCriando(true)}>
              <Plus className="size-4" aria-hidden />
              Nova zona
            </Button>
          }
        />
      )}

      {lista.isSuccess && itens.length > 0 && (
        <TableResponsive
          colunas={COLUNAS}
          linhas={itens}
          chaveLinha={(z) => z.id}
          onRowClick={(z) => setEditando(z)}
          legenda="Zonas de entrega"
        />
      )}

      <ZonaDialog aberto={criando || editando != null} zona={editando} aoFechar={fechar} />
      <LoteDialog aberto={importando} aoFechar={() => setImportando(false)} />
    </div>
  )
}
