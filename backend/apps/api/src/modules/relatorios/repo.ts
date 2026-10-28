// Acesso a dados dos relatorios (read-model): SO SELECT, parametrizado via sql`...`. Toda
// consulta filtra por loja_id e agrega no banco. Le pedidos, itens_pedido, itens, categorias,
// movimentos_caixa, pagamentos por SQL (sem importar o codigo desses modulos). Nenhum dado
// pessoal e selecionado (clientes so por contagem de ids distintos, sem expor id).
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import { TZ } from '@whaviso/shared/datas'
import type { VendasDimensao } from './schemas'

export interface Janela {
  lojaId: string
  inicio: Date
  fim: Date
}

export interface GrupoLinha {
  chave: string
  /** Rotulo legivel quando a chave nao e exibivel (ex.: id do motoboy/mesa); null => o servico deriva. */
  rotulo: string | null
  pedidos: number
  quantidade: number | null
  faturamento: number
  total_grupo: number
}

// Expressoes de chave de uma lista FECHADA (nunca vem da entrada); TZ e constante do codigo.
const LOCAL = `(p.criado_em at time zone '${TZ}')`
const CHAVE_PEDIDO: Partial<Record<VendasDimensao, string>> = {
  dia: `to_char(${LOCAL}::date, 'YYYY-MM-DD')`,
  semana: `to_char(date_trunc('week', ${LOCAL}), 'YYYY-MM-DD')`,
  mes: `to_char(date_trunc('month', ${LOCAL}), 'YYYY-MM')`,
  hora: `lpad(extract(hour from ${LOCAL})::int::text, 2, '0')`,
  dia_semana: `extract(dow from ${LOCAL})::int::text`,
  origem: 'p.origem::text',
  modalidade: 'p.modalidade::text',
}
const DIMENSOES_TEMPO = new Set<VendasDimensao>(['dia', 'semana', 'mes', 'hora', 'dia_semana'])

/** Vendas realizadas (`entregue`) por dimensao. Periodo por `criado_em`, como o dashboard. */
export async function vendasPorDimensao(
  exec: Executor, j: Janela, dim: VendasDimensao, limite: number,
): Promise<GrupoLinha[]> {
  const ordem = DIMENSOES_TEMPO.has(dim) ? sqlBruto('chave') : sqlBruto('faturamento desc, chave')
  let consulta: Consulta
  if (dim === 'mesa') {
    // Fonte: salao. Comandas FECHADAS por mesa, periodo pela data de fechamento (venda realizada).
    consulta = sql`with g as (
        select me.id::text as chave, me.nome as rotulo,
               count(*)::int as pedidos,
               null::int as quantidade,
               sum(c.total_centavos)::float8 as faturamento
          from public.comandas c
          join public.mesas me on me.id = c.mesa_id and me.loja_id = c.loja_id
         where c.loja_id = ${j.lojaId} and c.status = 'fechada'
           and c.fechada_em >= ${j.inicio} and c.fechada_em < ${j.fim}
         group by 1, 2)
      select chave, rotulo, pedidos, quantidade, faturamento, (sum(faturamento) over ())::float8 as total_grupo
        from g order by ${ordem}`
  } else if (dim === 'motoboy') {
    // Pedidos entregues por entregador; sem motoboy (retirada/mesa) vira um balde "Sem motoboy".
    consulta = sql`with g as (
        select coalesce(m.id::text, 'sem') as chave,
               coalesce(m.nome, 'Sem motoboy') as rotulo,
               count(*)::int as pedidos,
               null::int as quantidade,
               sum(p.total_centavos)::float8 as faturamento
          from public.pedidos p
          left join public.motoboys m on m.id = p.motoboy_id and m.loja_id = p.loja_id
         where p.loja_id = ${j.lojaId} and p.status = 'entregue'
           and p.criado_em >= ${j.inicio} and p.criado_em < ${j.fim}
         group by 1, 2)
      select chave, rotulo, pedidos, quantidade, faturamento, (sum(faturamento) over ())::float8 as total_grupo
        from g order by ${ordem}`
  } else if (dim === 'tamanho') {
    // Itens de pedidos entregues cuja opcao vem de um grupo tipo 'tamanho'. Uma unica opcao de
    // tamanho por item (distinct on) evita contar o item duas vezes; a classificacao exige o
    // vinculo a opcao de origem (snapshot sem opcao_id nao e classificavel => fica de fora).
    consulta = sql`with tam as (
          select distinct on (o.item_pedido_id) o.item_pedido_id, o.nome_snapshot as nome
            from public.itens_pedido_opcoes o
            join public.opcoes op on op.id = o.opcao_id and op.loja_id = o.loja_id
            join public.grupos_opcoes gr on gr.id = op.grupo_id and gr.loja_id = o.loja_id and gr.tipo = 'tamanho'
           where o.loja_id = ${j.lojaId}
           order by o.item_pedido_id, o.criado_em
        ), g as (
          select tam.nome as chave,
                 count(distinct p.id)::int as pedidos,
                 sum(i.quantidade)::int as quantidade,
                 sum(i.total_centavos)::float8 as faturamento
            from tam
            join public.itens_pedido i on i.id = tam.item_pedido_id
            join public.pedidos p on p.id = i.pedido_id and p.loja_id = i.loja_id
           where p.loja_id = ${j.lojaId} and p.status = 'entregue' and not i.cancelado
             and p.criado_em >= ${j.inicio} and p.criado_em < ${j.fim}
           group by 1)
      select chave, null::text as rotulo, pedidos, quantidade, faturamento,
             (sum(faturamento) over ())::float8 as total_grupo
        from g order by ${ordem}`
  } else if (dim === 'item' || dim === 'categoria') {
    const chave = dim === 'item' ? sqlBruto('i.nome_snapshot') : sqlBruto(`coalesce(c.nome, 'Sem categoria')`)
    consulta = sql`with g as (
        select ${chave} as chave,
               count(distinct p.id)::int as pedidos,
               sum(i.quantidade)::int as quantidade,
               sum(i.total_centavos)::float8 as faturamento
          from public.itens_pedido i
          join public.pedidos p on p.id = i.pedido_id and p.loja_id = i.loja_id
          left join public.itens it on it.id = i.item_id and it.loja_id = i.loja_id
          left join public.categorias c on c.id = it.categoria_id and c.loja_id = i.loja_id
         where p.loja_id = ${j.lojaId} and p.status = 'entregue' and not i.cancelado
           and p.criado_em >= ${j.inicio} and p.criado_em < ${j.fim}
         group by 1)
      select chave, null::text as rotulo, pedidos, quantidade, faturamento,
             (sum(faturamento) over ())::float8 as total_grupo
        from g order by ${ordem} limit ${limite}`
  } else {
    const chave = sqlBruto(CHAVE_PEDIDO[dim]!)
    consulta = sql`with g as (
        select ${chave} as chave,
               count(*)::int as pedidos,
               null::int as quantidade,
               sum(p.total_centavos)::float8 as faturamento
          from public.pedidos p
         where p.loja_id = ${j.lojaId} and p.status = 'entregue'
           and p.criado_em >= ${j.inicio} and p.criado_em < ${j.fim}
         group by 1)
      select chave, null::text as rotulo, pedidos, quantidade, faturamento,
             (sum(faturamento) over ())::float8 as total_grupo
        from g order by ${ordem}`
  }
  return consultar<GrupoLinha>(exec, consulta)
}

export interface TotalVendas {
  pedidos: number
  faturamento: number
}

export async function totalVendas(exec: Executor, j: Janela): Promise<TotalVendas> {
  const r = await consultarUm<TotalVendas>(
    exec,
    sql`select count(*)::int as pedidos, coalesce(sum(total_centavos), 0)::float8 as faturamento
          from public.pedidos
         where loja_id = ${j.lojaId} and status = 'entregue'
           and criado_em >= ${j.inicio} and criado_em < ${j.fim}`,
  )
  return r!
}

/** Universo da dimensao `mesa`: comandas fechadas no periodo (denominador proprio, nao pedidos). */
export async function totalComandas(exec: Executor, j: Janela): Promise<TotalVendas> {
  const r = await consultarUm<TotalVendas>(
    exec,
    sql`select count(*)::int as pedidos, coalesce(sum(total_centavos), 0)::float8 as faturamento
          from public.comandas
         where loja_id = ${j.lojaId} and status = 'fechada'
           and fechada_em >= ${j.inicio} and fechada_em < ${j.fim}`,
  )
  return r!
}

export interface FormaLinha {
  forma: string
  transacoes: number
  valor: number
}

/**
 * Formas de pagamento: vendas lancadas no caixa (forma informada) + Pix online conciliado
 * (`pagamentos.pago`) de pedidos que NAO tiveram venda no caixa (evita contar duas vezes).
 */
export async function formasPagamento(exec: Executor, j: Janela): Promise<FormaLinha[]> {
  return consultar<FormaLinha>(
    exec,
    sql`select forma, count(*)::int as transacoes, sum(valor)::float8 as valor
          from (
            select m.forma_pagamento as forma, m.valor_centavos as valor
              from public.movimentos_caixa m
             where m.loja_id = ${j.lojaId} and m.tipo = 'venda'
               and m.criado_em >= ${j.inicio} and m.criado_em < ${j.fim}
            union all
            select 'pix', g.valor_centavos
              from public.pagamentos g
             where g.loja_id = ${j.lojaId} and g.status = 'pago'
               and g.pago_em >= ${j.inicio} and g.pago_em < ${j.fim}
               and not exists (
                 select 1 from public.movimentos_caixa m2
                  where m2.loja_id = g.loja_id and m2.pedido_id = g.pedido_id and m2.tipo = 'venda')
          ) t
         group by forma
         order by valor desc, forma`,
  )
}

export interface CancelamentoTotais {
  pedidos: number
  problemas: number
  valor_perdido: number
}

export async function cancelamentoTotais(exec: Executor, j: Janela): Promise<CancelamentoTotais> {
  const r = await consultarUm<CancelamentoTotais>(
    exec,
    sql`select count(*)::int as pedidos,
               (count(*) filter (where status = 'problema'))::int as problemas,
               coalesce(sum(total_centavos) filter (where status = 'problema'), 0)::float8 as valor_perdido
          from public.pedidos
         where loja_id = ${j.lojaId} and status <> 'rascunho'
           and criado_em >= ${j.inicio} and criado_em < ${j.fim}`,
  )
  return r!
}

export interface MotivoLinha {
  motivo: string
  pedidos: number
  valor: number
}

/** Motivo normalizado (trim + minusculas) para agrupar variacoes de digitacao. */
export async function motivosProblema(exec: Executor, j: Janela, limite: number): Promise<MotivoLinha[]> {
  return consultar<MotivoLinha>(
    exec,
    sql`select lower(btrim(problema_motivo)) as motivo,
               count(*)::int as pedidos,
               sum(total_centavos)::float8 as valor
          from public.pedidos
         where loja_id = ${j.lojaId} and status = 'problema'
           and criado_em >= ${j.inicio} and criado_em < ${j.fim}
         group by 1
         order by pedidos desc, valor desc, motivo
         limit ${limite}`,
  )
}

export interface CoorteLinha {
  coorte: string
  offset: number
  clientes: number
}

/**
 * Coortes mensais (mes SP do primeiro pedido valido do cliente) cuja estreia cai no periodo,
 * com clientes ativos em cada mes seguinte (offset 0..12). Pedido valido = nem rascunho nem
 * problema. Retorna so contagens (sem id de cliente).
 */
export async function coortes(exec: Executor, lojaId: string, de: string, ate: string): Promise<CoorteLinha[]> {
  return consultar<CoorteLinha>(
    exec,
    sql`with atividade as (
          select cliente_id,
                 date_trunc('month', criado_em at time zone ${TZ})::date as mes
            from public.pedidos
           where loja_id = ${lojaId} and cliente_id is not null
             and status not in ('rascunho', 'problema')
           group by 1, 2
        ), estreia as (
          select cliente_id, min(mes) as coorte from atividade group by 1
        )
        select to_char(e.coorte, 'YYYY-MM') as coorte,
               ((extract(year from a.mes) - extract(year from e.coorte)) * 12
                 + extract(month from a.mes) - extract(month from e.coorte))::int as "offset",
               count(*)::int as clientes
          from estreia e
          join atividade a on a.cliente_id = e.cliente_id
         where e.coorte >= date_trunc('month', ${de}::date)::date
           and e.coorte <= date_trunc('month', ${ate}::date)::date
           and a.mes <= (e.coorte + interval '12 months')::date
         group by 1, 2
         order by 1, 2`,
  )
}
