// Fase A: "Resultado" (/app/metricas). Saúde do negócio de quem vende: recebido, a
// receber, lucro (só onde o custo foi informado), ticket médio, melhores clientes,
// quebra por categoria e clientes inativos. Só leitura: consome GET /v1/painel/metricas
// (tudo calculado no servidor). Linguagem sem termos proibidos, neutra quanto a gênero.
// H18.2: "no período escolhido", mesmo padrão De/Até do Painel (../pages/Painel.tsx),
// na URL própria desta rota (/app/gestao); sem período, mostra o histórico inteiro.
import { useSearchParams } from 'react-router'
import { Activity, PiggyBank, UserX, Users, Tags } from 'lucide-react'
import { Button, Card, DateInput, EmptyState, MoneyText, Spinner, StatCard } from '@/shared/ui'
import { dataPtBR } from '@/shared/format'
import { usePainelMetricas } from '../api'

// Mascara o número (mantém só os 4 últimos), para não expor telefone inteiro na tela.
function mascararTelefone(tel: string | null): string {
  if (!tel) return ''
  return tel.length <= 4 ? tel : `${'•'.repeat(3)} ${tel.slice(-4)}`
}

export default function MetricasPage() {
  const [params, setParams] = useSearchParams()
  const de = params.get('de') ?? ''
  const ate = params.get('ate') ?? ''
  const emPeriodo = Boolean(de || ate)

  function setParam(patch: Record<string, string | null>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [chave, valor] of Object.entries(patch)) {
          if (valor) next.set(chave, valor)
          else next.delete(chave)
        }
        return next
      },
      { replace: true },
    )
  }

  const { data, isLoading, isError } = usePainelMetricas({
    de: de || undefined,
    ate: ate || undefined,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-salvia">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <EmptyState
        titulo="Não deu para carregar agora"
        descricao="Tente de novo em instantes."
      />
    )
  }

  const temLucro = data.lucro_base_qtd > 0

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-tinta-2">
        Como vai o seu negócio: o que recebeu, o que ainda tem a receber e quanto rendeu.
      </p>

      {/* H18.2: filtro de período. Mesmo padrão do Painel; sem período, mostra o
          histórico inteiro (comportamento anterior). */}
      <div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-tinta-2">
            De
            <DateInput
              value={de}
              onChange={(e) => setParam({ de: e.target.value || null })}
              className="w-44"
              aria-label="Período: data inicial"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-tinta-2">
            Até
            <DateInput
              value={ate}
              onChange={(e) => setParam({ ate: e.target.value || null })}
              className="w-44"
              aria-label="Período: data final"
            />
          </label>
          {emPeriodo && (
            <Button variante="ghost" onClick={() => setParam({ de: null, ate: null })}>
              Limpar período
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-tinta-2">
          {emPeriodo ? 'Números do período escolhido.' : 'Sem período, mostra o histórico inteiro.'}
        </p>
      </div>

      {/* Números principais */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          rotulo="Recebido"
          centavos={data.recebido_centavos}
          detalhe={`${data.recebido_qtd} ${data.recebido_qtd === 1 ? 'combinado' : 'combinados'}`}
          tom="folha"
        />
        <StatCard
          rotulo="A receber"
          centavos={data.a_receber_centavos}
          detalhe={`${data.a_receber_qtd} ${data.a_receber_qtd === 1 ? 'combinado' : 'combinados'}`}
          tom="salvia"
        />
        <StatCard
          rotulo="Resultado"
          centavos={data.lucro_centavos}
          detalhe={
            temLucro
              ? `de ${data.lucro_base_qtd} com custo informado`
              : 'informe o custo para ver o quanto sobrou'
          }
          tom="folha"
          icone={<PiggyBank strokeWidth={1.75} className="size-4" />}
        />
        <StatCard
          rotulo="Ticket médio"
          centavos={data.ticket_medio_centavos}
          detalhe="por combinado recebido"
          tom="neutro"
        />
      </div>

      {/* Por categoria */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl text-salvia">
          <Tags strokeWidth={1.75} className="size-5" />
          Por categoria
        </h2>
        {data.por_categoria.length === 0 ? (
          <Card className="text-sm text-tinta-2">
            Ainda não há combinados para resumir por categoria.
          </Card>
        ) : (
          <Card className="flex flex-col divide-y divide-linha p-0">
            {data.por_categoria.map((c) => (
              <div
                key={c.categoria_id ?? 'sem'}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <span className="flex items-center gap-2 text-tinta">
                  <span
                    aria-hidden
                    className="size-3 rounded-full border border-linha"
                    style={{ backgroundColor: c.cor ?? 'transparent' }}
                  />
                  {c.nome ?? 'Sem categoria'}
                  <span className="text-xs text-tinta-2">
                    ({c.qtd} {c.qtd === 1 ? 'combinado' : 'combinados'})
                  </span>
                </span>
                <span className="flex items-center gap-4 text-sm">
                  <span className="text-tinta-2">
                    recebido <MoneyText centavos={c.recebido_centavos} className="text-folha" />
                  </span>
                  <span className="text-tinta-2">
                    resultado <MoneyText centavos={c.lucro_centavos} className="text-salvia" />
                  </span>
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* E18 H18.2 (item 17): engajamento do devedor e conclusão dos combinados. Só TOTAL
          nesta leva (não por cliente, decisão registrada no plano de implementação). */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl text-salvia">
          <Activity strokeWidth={1.75} className="size-5" />
          Engajamento e conclusão
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="flex flex-col gap-2">
            <span className="text-sm text-tinta-2">Combinados concluídos</span>
            <span className="tabular text-2xl text-salvia">
              {data.taxa_combinados_concluidos === null
                ? 'sem dados'
                : `${Math.round(data.taxa_combinados_concluidos * 100)}%`}
            </span>
            <span className="text-xs text-tinta-2">
              dos combinados que já chegaram a um resultado final
            </span>
          </Card>
          <Card className="flex flex-col gap-2">
            <span className="text-sm text-tinta-2">Tempo até confirmação</span>
            <span className="tabular text-2xl text-salvia">
              {data.tempo_medio_confirmacao_dias === null
                ? 'sem dados'
                : `${data.tempo_medio_confirmacao_dias} dias`}
            </span>
            <span className="text-xs text-tinta-2">média do "já paguei" até você confirmar</span>
          </Card>
          <Card className="flex flex-col gap-2">
            <span className="text-sm text-tinta-2">Mensagens lidas</span>
            <span className="tabular text-2xl text-salvia">{data.mensagens_lidas_qtd}</span>
            <span className="text-xs text-tinta-2">
              de {data.mensagens_com_status_qtd} com status de entrega
            </span>
          </Card>
          <Card className="flex flex-col gap-2">
            <span className="text-sm text-tinta-2">Chave Pix consultada</span>
            <span className="tabular text-2xl text-salvia">{data.solicitou_pix_qtd}</span>
            <span className="text-xs text-tinta-2">vezes que a outra ponta pediu a chave</span>
          </Card>
        </div>
      </section>

      {/* Melhores clientes */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl text-salvia">
          <Users strokeWidth={1.75} className="size-5" />
          Melhores clientes
        </h2>
        {data.melhores_clientes.length === 0 ? (
          <Card className="text-sm text-tinta-2">
            Assim que você registrar recebimentos, os melhores clientes aparecem aqui.
          </Card>
        ) : (
          <Card className="flex flex-col divide-y divide-linha p-0">
            {data.melhores_clientes.map((m, i) => (
              <div
                key={`${m.telefone ?? m.nome}-${i}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <span className="text-tinta">
                  {m.nome}
                  <span className="ml-2 text-xs text-tinta-2">{mascararTelefone(m.telefone)}</span>
                </span>
                <span className="text-sm text-tinta-2">
                  <MoneyText centavos={m.recebido_centavos} className="text-folha" /> em {m.qtd}{' '}
                  {m.qtd === 1 ? 'combinado' : 'combinados'}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* H18.2: clientes inativos (sem combinado ativo e sem comprar há um tempo). Calculado
          no servidor (painel/repo.ts); antes só existia no backend, nunca renderizado. */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl text-salvia">
          <UserX strokeWidth={1.75} className="size-5" />
          Clientes parados
        </h2>
        {data.inativos.length === 0 ? (
          <Card className="text-sm text-tinta-2">
            Ninguém parado por aqui: todo mundo tem algo ativo ou comprou recentemente.
          </Card>
        ) : (
          <Card className="flex flex-col divide-y divide-linha p-0">
            {data.inativos.map((c, i) => (
              <div
                key={`${c.telefone ?? c.nome}-${i}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <span className="text-tinta">
                  {c.nome}
                  <span className="ml-2 text-xs text-tinta-2">{mascararTelefone(c.telefone)}</span>
                </span>
                <span className="text-sm text-tinta-2">
                  última compra {dataPtBR(c.ultima_data)} · faz {c.dias} dias
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>

    </div>
  )
}
