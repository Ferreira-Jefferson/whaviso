// /zonas: zonas de entrega da loja (bairro, polígono ou raio) com taxa do cliente, valor do
// motoboy, pedido mínimo e frete grátis. Lista + cadastro/edição + importação de bairros.
// Dinheiro em centavos (formatarCentavos). Estados loading/empty/error; mobile-first.
import { useState } from 'react'
import { ListPlus, MapPinned, Plus } from 'lucide-react'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  SegmentedControl,
  Skeleton,
  TableResponsive,
  type ColunaTabela,
} from '@/shared/ui'
import { formatarCentavos } from '@/shared/format'
import { useZonas, type Zona } from '../api'
import { ROTULO_TIPO, resumoDaArea } from '../estados'
import { LoteDialog } from '../components/LoteDialog'
import { ZonaDialog } from '../components/ZonaDialog'

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
      <span className="text-tinta-2">
        {ROTULO_TIPO[z.tipo]}: {resumoDaArea(z)}
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

export default function Zonas() {
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
    <div>
      <PageHeader
        titulo="Zonas de entrega"
        descricao="Defina onde você entrega, quanto o cliente paga e quanto o motoboy recebe."
        acoes={
          <>
            <Button variante="secondary" onClick={() => setImportando(true)}>
              <ListPlus className="size-4" aria-hidden />
              Importar bairros
            </Button>
            <Button onClick={() => setCriando(true)}>
              <Plus className="size-4" aria-hidden />
              Nova zona
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4">
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
      </div>

      <ZonaDialog aberto={criando || editando != null} zona={editando} aoFechar={fechar} />
      <LoteDialog aberto={importando} aoFechar={() => setImportando(false)} />
    </div>
  )
}
