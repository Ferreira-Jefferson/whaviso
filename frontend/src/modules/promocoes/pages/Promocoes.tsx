// Promocoes da loja: cupons (percentual e fixo) e combos, com validade, limites e liga/desliga.
// Rota /promocoes. Dados pela api REST (raiz ['promocoes']); nao ha exclusao: desligar e o caminho.
import { useMemo, useState } from 'react'
import { FlaskConical, Package, Plus, Tag, TicketPercent } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { brl, formatarDataHora } from '@/shared/format'
import {
  Badge,
  Button,
  cn,
  EmptyState,
  ErrorState,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
  Switch,
  TableResponsive,
  useToast,
  type ColunaTabela,
} from '@/shared/ui'
import { useAtualizarPromocao, usePromocoes, type Promocao, type PromocaoTipo } from '../api'
import { PromocaoDialog } from '../components/PromocaoDialog'
import { TestarCupomDialog } from '../components/TestarCupomDialog'
import { ROTULO_SITUACAO, ROTULO_TIPO, situacaoDe, TIPOS, TOM_SITUACAO } from '../estados'

type Estado = 'todas' | 'ativas' | 'desligadas'

const ICONE_TIPO: Record<PromocaoTipo, typeof TicketPercent> = {
  cupom_percentual: TicketPercent,
  cupom_fixo: Tag,
  combo: Package,
}

/** Selo quadrado com o ícone do tipo: dá rosto e ritmo à lista sem depender só de texto. */
function TipoTile({ tipo, inativo }: { tipo: PromocaoTipo; inativo?: boolean }) {
  const Icone = ICONE_TIPO[tipo]
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 flex-none items-center justify-center rounded-input bg-salvia-claro text-salvia',
        inativo && 'opacity-50',
      )}
    >
      <Icone className="size-4" />
    </span>
  )
}

function descontoTexto(p: Promocao): string {
  if (p.tipo === 'cupom_percentual') return `${p.valor}%`
  if (p.tipo === 'cupom_fixo') return brl(p.valor)
  return `${brl(p.valor)} (preço do combo)`
}

function validadeTexto(p: Promocao): string {
  if (!p.inicio_em && !p.fim_em) return 'Sem prazo'
  if (p.inicio_em && p.fim_em) return `${formatarDataHora(p.inicio_em)} a ${formatarDataHora(p.fim_em)}`
  if (p.fim_em) return `Até ${formatarDataHora(p.fim_em)}`
  return `A partir de ${formatarDataHora(p.inicio_em as string)}`
}

export default function Promocoes() {
  const [tipo, setTipo] = useState<PromocaoTipo | ''>('')
  const [estado, setEstado] = useState<Estado>('todas')
  const [dialogo, setDialogo] = useState<{ aberto: boolean; promocao: Promocao | null }>({ aberto: false, promocao: null })
  const [testando, setTestando] = useState(false)
  const { mostrarToast } = useToast()

  const lista = usePromocoes({ tipo: tipo || null, ativo: estado === 'todas' ? null : estado === 'ativas' })
  const itens = useMemo(() => lista.data?.pages.flatMap((p) => p.itens) ?? [], [lista.data])
  const alternar = useAtualizarPromocao()
  const ocupadoId = alternar.isPending ? alternar.variables?.id : undefined

  const colunas: ReadonlyArray<ColunaTabela<Promocao>> = [
    {
      chave: 'nome',
      titulo: 'Promoção',
      principal: true,
      render: (p) => (
        <span className="flex items-center gap-3">
          <TipoTile tipo={p.tipo} inativo={!p.ativo} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{p.nome}</span>
            <span className="text-xs text-tinta-2">
              {ROTULO_TIPO[p.tipo]}
              {p.codigo ? ` · ${p.codigo}` : ''}
            </span>
          </span>
        </span>
      ),
    },
    { chave: 'desconto', titulo: 'Desconto', render: (p) => <span className="tabular-nums">{descontoTexto(p)}</span> },
    { chave: 'validade', titulo: 'Validade', render: (p) => <span className="text-tinta-2">{validadeTexto(p)}</span> },
    {
      chave: 'usos',
      titulo: 'Usos',
      alinhar: 'direita',
      render: (p) => {
        if (p.limite_total == null || p.limite_total <= 0) {
          return <span className="tabular-nums text-tinta-2">{p.usos_total}</span>
        }
        const pct = Math.min(100, Math.round((p.usos_total / p.limite_total) * 100))
        const cheio = p.usos_total >= p.limite_total
        return (
          <span className="inline-flex flex-col items-end gap-1">
            <span className="tabular-nums">
              {p.usos_total} / {p.limite_total}
            </span>
            <span className="h-1 w-16 overflow-hidden rounded-pill bg-linha">
              <span
                className={cn('block h-full rounded-pill', cheio ? 'bg-ambar' : 'bg-salvia')}
                style={{ width: `${pct}%` }}
              />
            </span>
          </span>
        )
      },
    },
    {
      chave: 'situacao',
      titulo: 'Situação',
      render: (p) => {
        const s = situacaoDe(p)
        return <Badge tom={TOM_SITUACAO[s]}>{ROTULO_SITUACAO[s]}</Badge>
      },
    },
    {
      chave: 'ativo',
      titulo: 'Ligada',
      ocultarRotuloMobile: true,
      alinhar: 'direita',
      render: (p) => (
        // Envolve em span que barra a propagacao: a linha abre a edicao ao clicar, o Switch nao deve dispara-la.
        <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
          <Switch
            ligado={p.ativo}
            rotulo={`${p.ativo ? 'Desligar' : 'Ligar'} ${p.nome}`}
            carregando={ocupadoId === p.id}
            onMudar={(ligado) =>
              alternar.mutate(
                { id: p.id, body: { ativo: ligado } },
                {
                  onError: (e) =>
                    mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível mudar a promoção.', { tom: 'erro' }),
                },
              )
            }
          />
        </span>
      ),
    },
  ]

  const botoes = (
    <>
      <Button variante="secondary" onClick={() => setTestando(true)}>
        <FlaskConical className="size-4" aria-hidden />
        Testar cupom
      </Button>
      <Button onClick={() => setDialogo({ aberto: true, promocao: null })}>
        <Plus className="size-4" aria-hidden />
        Nova promoção
      </Button>
    </>
  )

  const filtrando = tipo !== '' || estado !== 'todas'

  return (
    <div className="animate-rise">
      <PageHeader titulo="Promoções" descricao="Cupons e combos para vender mais." acoes={botoes} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SegmentedControl<Estado>
          ariaLabel="Situação"
          value={estado}
          onChange={setEstado}
          options={[
            { value: 'todas', label: 'Todas' },
            { value: 'ativas', label: 'Ligadas' },
            { value: 'desligadas', label: 'Desligadas' },
          ]}
        />
        <Select
          ariaLabel="Tipo de promoção"
          value={tipo}
          onChange={(v) => setTipo(v as PromocaoTipo | '')}
          className="w-full sm:w-56"
          options={[{ value: '', label: 'Todos os tipos' }, ...TIPOS.map((t) => ({ value: t, label: ROTULO_TIPO[t] }))]}
        />
      </div>

      {lista.isPending && (
        <div aria-busy="true" aria-label="Carregando promoções" className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {lista.isError && <ErrorState aoTentarDeNovo={() => void lista.refetch()} />}
      {lista.isSuccess && itens.length === 0 && (
        <EmptyState
          icone={<TicketPercent className="size-7" aria-hidden />}
          titulo={filtrando ? 'Nenhuma promoção neste filtro' : 'Nenhuma promoção ainda'}
          descricao={
            filtrando
              ? 'Tente outro tipo ou mostre todas.'
              : 'Crie um cupom de desconto ou um combo com preço fechado.'
          }
          acao={
            filtrando ? undefined : (
              <Button onClick={() => setDialogo({ aberto: true, promocao: null })}>
                <Plus className="size-4" aria-hidden />
                Nova promoção
              </Button>
            )
          }
        />
      )}
      {lista.isSuccess && itens.length > 0 && (
        <>
          <TableResponsive
            colunas={colunas}
            linhas={itens}
            chaveLinha={(p) => p.id}
            onRowClick={(p) => setDialogo({ aberto: true, promocao: p })}
            legenda="Promoções"
          />
          {lista.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button variante="secondary" loading={lista.isFetchingNextPage} onClick={() => void lista.fetchNextPage()}>
                Ver mais
              </Button>
            </div>
          )}
        </>
      )}

      <PromocaoDialog
        aberto={dialogo.aberto}
        promocao={dialogo.promocao}
        aoFechar={() => setDialogo((d) => ({ ...d, aberto: false }))}
      />
      <TestarCupomDialog aberto={testando} aoFechar={() => setTestando(false)} />
    </div>
  )
}
