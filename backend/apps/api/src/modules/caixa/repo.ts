// Acesso a dados do modulo caixa: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado).
// Toda consulta filtra por loja_id (multi-tenant). Nenhum dado pessoal e selecionado ou logado.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { FormaPagamento, TipoMovimentoCaixa } from './schemas'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

export interface CaixaLinha {
  id: string
  status: 'aberto' | 'fechado'
  aberto_por_user_id: string
  aberto_em: string
  saldo_inicial_centavos: number
  fechado_por_user_id: string | null
  fechado_em: string | null
  saldo_informado_centavos: number | null
  saldo_calculado_centavos: number | null
  diferenca_centavos: number | null
  observacoes: string | null
}

export interface MovimentoLinha {
  id: string
  caixa_id: string
  tipo: TipoMovimentoCaixa
  forma_pagamento: FormaPagamento | null
  valor_centavos: number
  pedido_id: string | null
  motivo: string | null
  criado_por_user_id: string
  criado_em: string
}

export interface TotaisLinha {
  total_vendas: number
  total_suprimentos: number
  total_sangrias: number
  total_ajustes: number
  venda_dinheiro: number
  venda_credito: number
  venda_debito: number
  venda_pix: number
  venda_outro: number
  qtd: number
}

const COLS_CAIXA = sqlBruto(
  `id, status, aberto_por_user_id, saldo_inicial_centavos, fechado_por_user_id,
   saldo_informado_centavos, saldo_calculado_centavos, diferenca_centavos, observacoes`,
)
const SAIDA_CAIXA = sql`${COLS_CAIXA}, ${TS('aberto_em')} as aberto_em, ${TS('fechado_em')} as fechado_em`

export async function obterSessaoAberta(exec: Executor, lojaId: string) {
  return consultarUm<CaixaLinha>(
    exec,
    sql`select ${SAIDA_CAIXA} from public.caixas
         where loja_id = ${lojaId} and status = 'aberto'`,
  )
}

export async function obterCaixa(exec: Executor, lojaId: string, id: string) {
  return consultarUm<CaixaLinha>(
    exec,
    sql`select ${SAIDA_CAIXA} from public.caixas where id = ${id} and loja_id = ${lojaId}`,
  )
}

export async function abrir(
  exec: Executor,
  lojaId: string,
  d: { abertoPor: string; saldoInicial: number },
) {
  return consultarUm<CaixaLinha>(
    exec,
    sql`insert into public.caixas (loja_id, aberto_por_user_id, saldo_inicial_centavos)
        values (${lojaId}, ${d.abertoPor}, ${d.saldoInicial})
        returning ${SAIDA_CAIXA}`,
  )
}

export async function pedidoDaLoja(exec: Executor, lojaId: string, pedidoId: string) {
  return consultarUm<{ id: string }>(
    exec,
    sql`select id from public.pedidos where id = ${pedidoId} and loja_id = ${lojaId}`,
  )
}

export async function inserirMovimento(
  exec: Executor,
  lojaId: string,
  caixaId: string,
  m: {
    tipo: TipoMovimentoCaixa
    formaPagamento: FormaPagamento | null
    valor: number
    pedidoId: string | null
    motivo: string | null
    criadoPor: string
  },
) {
  return consultarUm<MovimentoLinha>(
    exec,
    sql`insert into public.movimentos_caixa
          (loja_id, caixa_id, tipo, forma_pagamento, valor_centavos, pedido_id, motivo, criado_por_user_id)
        values (${lojaId}, ${caixaId}, ${m.tipo}, ${m.formaPagamento}, ${m.valor},
                ${m.pedidoId}, ${m.motivo}, ${m.criadoPor})
        returning id, caixa_id, tipo, forma_pagamento, valor_centavos, pedido_id, motivo,
                  criado_por_user_id, ${TS('criado_em')} as criado_em`,
  )
}

export async function listarMovimentos(exec: Executor, lojaId: string, caixaId: string) {
  return consultar<MovimentoLinha>(
    exec,
    sql`select id, caixa_id, tipo, forma_pagamento, valor_centavos, pedido_id, motivo,
               criado_por_user_id, ${TS('criado_em')} as criado_em
          from public.movimentos_caixa
         where caixa_id = ${caixaId} and loja_id = ${lojaId}
         order by criado_em, id`,
  )
}

export async function totais(exec: Executor, lojaId: string, caixaId: string) {
  const r = await consultarUm<TotaisLinha>(
    exec,
    sql`select
          coalesce(sum(valor_centavos) filter (where tipo = 'venda'), 0)::int as total_vendas,
          coalesce(sum(valor_centavos) filter (where tipo = 'suprimento'), 0)::int as total_suprimentos,
          coalesce(sum(valor_centavos) filter (where tipo = 'sangria'), 0)::int as total_sangrias,
          coalesce(sum(valor_centavos) filter (where tipo = 'ajuste'), 0)::int as total_ajustes,
          coalesce(sum(valor_centavos) filter (where tipo = 'venda' and forma_pagamento = 'dinheiro'), 0)::int as venda_dinheiro,
          coalesce(sum(valor_centavos) filter (where tipo = 'venda' and forma_pagamento = 'credito'), 0)::int as venda_credito,
          coalesce(sum(valor_centavos) filter (where tipo = 'venda' and forma_pagamento = 'debito'), 0)::int as venda_debito,
          coalesce(sum(valor_centavos) filter (where tipo = 'venda' and forma_pagamento = 'pix'), 0)::int as venda_pix,
          coalesce(sum(valor_centavos) filter (where tipo = 'venda' and forma_pagamento = 'outro'), 0)::int as venda_outro,
          count(*)::int as qtd
        from public.movimentos_caixa
       where caixa_id = ${caixaId} and loja_id = ${lojaId}`,
  )
  return r!
}

export async function fechar(
  exec: Executor,
  lojaId: string,
  id: string,
  d: {
    fechadoPor: string
    saldoInformado: number
    saldoCalculado: number
    diferenca: number
    observacoes: string | null
  },
) {
  // UPDATE condicionado a status = 'aberto': barra corrida (duas requisicoes de fechamento).
  return consultarUm<CaixaLinha>(
    exec,
    sql`update public.caixas
           set status = 'fechado', fechado_por_user_id = ${d.fechadoPor}, fechado_em = now(),
               saldo_informado_centavos = ${d.saldoInformado}, saldo_calculado_centavos = ${d.saldoCalculado},
               diferenca_centavos = ${d.diferenca}, observacoes = ${d.observacoes}
         where id = ${id} and loja_id = ${lojaId} and status = 'aberto'
         returning ${SAIDA_CAIXA}`,
  )
}

/** Auditoria sem PII (tabela eventos). `detalhes` so carrega ids e metadados nao sensiveis. */
export async function registrarEvento(
  exec: Executor,
  e: { lojaId: string; tipo: string; entidade: string; entidadeId: string; detalhes: object },
) {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, ${e.tipo}, ${e.entidade}, ${e.entidadeId}, 'loja',
                ${JSON.stringify(e.detalhes)}::jsonb)`,
  )
}
