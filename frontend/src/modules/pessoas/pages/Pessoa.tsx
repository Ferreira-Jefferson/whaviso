// Visão por pessoa/contato (E15): reúne todos os combinados de UM número, com os quatro
// totais e um atalho para um novo combinado com a pessoa. A identidade é o NÚMERO (o nome
// é rótulo): a lista vem AGRUPADA POR NOME do servidor (H15.3). Reaproveita os componentes
// do painel (StatCard/TableResponsive/StatusBadge) via @/shared/ui; nada de regra no front.
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Clock, Plus, Wallet } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import {
  Button,
  EmptyState,
  MoneyText,
  PageHeader,
  Skeleton,
  StatCard,
  StatusBadge,
  TableResponsive,
  type ColunaTabela,
} from '@/shared/ui'
import { ROTULO_PAPEL, dataPtBR, telefone as fmtTelefone } from '@/shared/format'
import { usePerfil } from '@/shared/auth'
import type { Aviso, StatusAviso } from '@/shared/contracts'
import { usePessoaCombinados, usePessoaResumo } from '../api'

// Ativo não pago (espelha shared/estados.ATIVOS_NAO_PAGOS do backend); o resto é histórico.
const ATIVOS: ReadonlySet<StatusAviso> = new Set<StatusAviso>([
  'aguardando_aceite',
  'programado',
  'informado_pago',
  'pausado',
  'aguardando_aprovacao_aviso_editado',
  'desregistrado',
])
const ehAtivo = (s: StatusAviso) => ATIVOS.has(s)

export default function PessoaPage() {
  const { avisoId = '' } = useParams()
  const navigate = useNavigate()
  const perfil = usePerfil()
  const resumo = usePessoaResumo(avisoId)
  const combinados = usePessoaCombinados(avisoId)

  // Papel do usuário NAQUELE combinado: sou cobrador se o cobrador_id for o meu id.
  const souCobrador = (a: Aviso) => Boolean(perfil?.id && a.cobrador_id === perfil.id)

  const colunas: ReadonlyArray<ColunaTabela<Aviso>> = [
    {
      chave: 'papel',
      titulo: 'Tipo',
      render: (a) => (
        <span className="text-xs font-medium text-tinta-2">
          {souCobrador(a) ? ROTULO_PAPEL.cobrador : ROTULO_PAPEL.devedor}
        </span>
      ),
    },
    {
      chave: 'motivo',
      titulo: 'Sobre',
      principal: true,
      render: (a) => <span className="font-medium">{a.motivo}</span>,
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      alinhar: 'direita',
      render: (a) => <MoneyText centavos={a.valor_centavos} />,
    },
    { chave: 'data', titulo: 'Data combinada', render: (a) => dataPtBR(a.data_combinada) },
    {
      chave: 'status',
      titulo: 'Situação',
      ocultarRotuloMobile: true,
      render: (a) => <StatusBadge status={a.status} />,
    },
  ]

  const nome = resumo.data?.nome_entrada ?? 'Pessoa'

  return (
    <div className="animate-rise">
      <PageHeader
        titulo={nome}
        descricao={
          resumo.data
            ? `Todos os combinados de ${fmtTelefone(resumo.data.telefone)}.`
            : 'Todos os combinados desta pessoa.'
        }
        acoes={
          <div className="flex items-center gap-2">
            <Button variante="ghost" onClick={() => navigate('/app')}>
              <ArrowLeft strokeWidth={1.75} className="size-4" />
              Voltar
            </Button>
            {resumo.data && (
              <button
                type="button"
                onClick={() =>
                  navigate('/app/avisos/novo', {
                    // Pré-preenche nome + telefone SEM pôr o número na URL (H15.7): vai por
                    // state de navegação (não aparece em rota/histórico do navegador).
                    state: { pessoa: { nome: resumo.data!.nome_entrada, telefone: resumo.data!.telefone } },
                  })
                }
                className="inline-flex items-center gap-2 rounded-pill bg-salvia px-5 py-2.5 text-sm font-medium text-papel transition-[background-color] duration-150 hover:bg-tinta"
              >
                <Plus strokeWidth={1.75} className="size-4" />
                Novo combinado
              </button>
            )}
          </div>
        }
      />

      {/* Quatro totais (H15.2): a receber/recebido (cobrador) + a pagar/pago (devedor). */}
      {resumo.isError ? (
        <EmptyState
          titulo="Não foi possível carregar"
          descricao="O combinado pode não existir ou ainda não ter WhatsApp da outra ponta."
        />
      ) : resumo.isLoading || !resumo.data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-card" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            rotulo="A receber"
            centavos={resumo.data.a_receber_centavos}
            tom="ambar"
            icone={<Clock strokeWidth={1.75} className="size-4" />}
            detalhe={`${resumo.data.a_receber_qtd} ${resumo.data.a_receber_qtd === 1 ? 'combinado' : 'combinados'}`}
          />
          <StatCard
            rotulo="Recebido"
            centavos={resumo.data.recebido_centavos}
            tom="folha"
            icone={<ArrowDownLeft strokeWidth={1.75} className="size-4" />}
            detalhe={`${resumo.data.recebido_qtd} ${resumo.data.recebido_qtd === 1 ? 'combinado' : 'combinados'}`}
          />
          <StatCard
            rotulo="A pagar"
            centavos={resumo.data.a_pagar_centavos}
            tom="salvia"
            icone={<Wallet strokeWidth={1.75} className="size-4" />}
            detalhe={`${resumo.data.a_pagar_qtd} ${resumo.data.a_pagar_qtd === 1 ? 'combinado' : 'combinados'}`}
          />
          <StatCard
            rotulo="Pago"
            centavos={resumo.data.pago_centavos}
            tom="neutro"
            icone={<ArrowUpRight strokeWidth={1.75} className="size-4" />}
            detalhe={`${resumo.data.pago_qtd} ${resumo.data.pago_qtd === 1 ? 'combinado' : 'combinados'}`}
          />
        </div>
      )}

      {/* Combinados do número, AGRUPADOS POR NOME (H15.3). Dentro do grupo, ativos e
          encerrados aparecem separados. */}
      <section className="mt-10">
        <h2 className="text-xl text-salvia">Combinados</h2>
        {combinados.isLoading ? (
          <div className="mt-4 flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-card" />
            ))}
          </div>
        ) : combinados.isError ? (
          <EmptyState
            className="mt-4"
            titulo="Não foi possível carregar os combinados"
            descricao="Verifique sua conexão e tente novamente."
          />
        ) : (combinados.data?.total ?? 0) === 0 ? (
          <EmptyState className="mt-4" titulo="Nenhum combinado" descricao="Esta pessoa ainda não tem combinados." />
        ) : (
          <div className="mt-4 flex flex-col gap-8">
            {combinados.data!.grupos.map((grupo) => {
              const ativos = grupo.itens.filter((a) => ehAtivo(a.status))
              const encerrados = grupo.itens.filter((a) => !ehAtivo(a.status))
              return (
                <div key={grupo.nome} className="flex flex-col gap-3">
                  <h3 className="flex items-center gap-2 text-base font-medium text-tinta">
                    {grupo.nome}
                    <span className="rounded-pill bg-salvia-claro px-2 py-0.5 text-xs font-normal text-salvia">
                      {grupo.itens.length}
                    </span>
                  </h3>
                  {ativos.length > 0 && (
                    <FaixaCombinados
                      legenda={`Ativos de ${grupo.nome}`}
                      rotulo="Ativos"
                      colunas={colunas}
                      linhas={ativos}
                      onRowClick={(a) => navigate(`/app/avisos/${a.id}`)}
                    />
                  )}
                  {encerrados.length > 0 && (
                    <FaixaCombinados
                      legenda={`Encerrados de ${grupo.nome}`}
                      rotulo="Encerrados"
                      colunas={colunas}
                      linhas={encerrados}
                      onRowClick={(a) => navigate(`/app/avisos/${a.id}`)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

// Uma faixa (Ativos / Encerrados) dentro de um grupo de nome. Só o rótulo aparece quando
// as duas faixas coexistem; a tabela reaproveita o TableResponsive do painel.
function FaixaCombinados({
  legenda,
  rotulo,
  colunas,
  linhas,
  onRowClick,
}: {
  legenda: string
  rotulo: string
  colunas: ReadonlyArray<ColunaTabela<Aviso>>
  linhas: Aviso[]
  onRowClick: (a: Aviso) => void
}) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-tinta-2">{rotulo}</p>
      <div className="md:rounded-card md:border md:border-linha md:bg-cartao md:p-2">
        <TableResponsive<Aviso>
          legenda={legenda}
          colunas={colunas}
          linhas={linhas}
          chaveLinha={(a) => a.id}
          onRowClick={onRowClick}
        />
      </div>
    </div>
  )
}
