// Acesso a dados dos relatorios (read-model): SO SELECT, parametrizado via sql`...`. Toda
// consulta filtra por loja_id e agrega no banco. Le pedidos, itens_pedido, itens, categorias,
// movimentos_caixa, pagamentos por SQL (sem importar o codigo desses modulos). Nenhum dado
// pessoal e selecionado (clientes so por contagem de ids distintos, sem expor id).
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import { TZ } from '@whaviso/shared/datas'
import type { Dimensao, VendasFiltro } from './schemas'
import { RE_DIMENSAO_OPCAO } from './schemas'

export interface Janela {
  lojaId: string
  inicio: Date
  fim: Date
}

export interface GrupoLinha {
  chave: string
  /** Rotulo legivel quando a chave nao e exibivel (ex.: id do motoboy); null => o servico deriva. */
  rotulo: string | null
  pedidos: number
  quantidade: number | null
  faturamento: number
  total_grupo: number
}

// --- Montador flexivel (grao de item) ----------------------------------------
// TZ e constante do codigo; toda expressao abaixo e literal de LISTA FECHADA (nunca entrada).
// Os VALORES de entrada (ids, nomes de filtro, grupo_id) entram SEMPRE como parametro via sql``.
const LOCAL = `(p.criado_em at time zone '${TZ}')`
const EXPR_TEMPO: Record<string, string> = {
  dia: `to_char(${LOCAL}::date, 'YYYY-MM-DD')`,
  semana: `to_char(date_trunc('week', ${LOCAL}), 'YYYY-MM-DD')`,
  mes: `to_char(date_trunc('month', ${LOCAL}), 'YYYY-MM')`,
  hora: `lpad(extract(hour from ${LOCAL})::int::text, 2, '0')`,
  dia_semana: `extract(dow from ${LOCAL})::int::text`,
}
const DIMENSOES_TEMPO = new Set(Object.keys(EXPR_TEMPO))
// Dimensoes cuja chave e uma expressao simples sobre a linha (sem rotulo proprio).
const EXPR_FIXA: Record<string, string> = {
  ...EXPR_TEMPO,
  origem: 'p.origem::text',
  modalidade: 'p.modalidade::text',
  categoria: `coalesce(c.nome, 'Sem categoria')`,
  item: 'i.nome_snapshot',
}

const JOINS_BASE = sqlBruto(`from public.itens_pedido i
    join public.pedidos p on p.id = i.pedido_id and p.loja_id = i.loja_id
    left join public.itens it on it.id = i.item_id and it.loja_id = i.loja_id
    left join public.categorias c on c.id = it.categoria_id and c.loja_id = i.loja_id
    left join public.motoboys m on m.id = p.motoboy_id and m.loja_id = p.loja_id`)

function grupoIdDaDimensao(dim: Dimensao): string | null {
  return RE_DIMENSAO_OPCAO.test(dim) ? dim.slice('opcao:'.length) : null
}

/** Uma condicao de filtro (dimensao + valores). Valores sempre como parametro; nunca concatenados. */
function condicaoFiltro(f: VendasFiltro): Consulta {
  const g = grupoIdDaDimensao(f.dimensao)
  if (g !== null) {
    // Mantem a linha cujo item tem, nesse grupo de opcao, alguma das opcoes escolhidas.
    return sql`exists (
      select 1 from public.itens_pedido_opcoes o
        join public.opcoes op on op.id = o.opcao_id and op.loja_id = o.loja_id
       where o.item_pedido_id = i.id and op.grupo_id = ${g} and o.nome_snapshot = any(${f.valores}))`
  }
  if (f.dimensao === 'motoboy') {
    const sem = f.valores.includes('sem')
    const ids = f.valores.filter((v) => v !== 'sem')
    if (ids.length && sem) return sql`(p.motoboy_id::text = any(${ids}) or p.motoboy_id is null)`
    if (ids.length) return sql`p.motoboy_id::text = any(${ids})`
    return sqlBruto('p.motoboy_id is null')
  }
  return sql`${sqlBruto(EXPR_FIXA[f.dimensao]!)} = any(${f.valores})`
}

/** WHERE comum: loja, entregue, nao cancelado, periodo e os filtros combinados (E entre eles). */
function whereBase(j: Janela, filtros: readonly VendasFiltro[]): Consulta {
  let w = sql`p.loja_id = ${j.lojaId} and p.status = 'entregue' and not i.cancelado
      and p.criado_em >= ${j.inicio} and p.criado_em < ${j.fim}`
  for (const f of filtros) w = sql`${w} and (${condicaoFiltro(f)})`
  return w
}

/** Linhas do relatorio flexivel, no grao de item. Dimensao fixa ou 'opcao:<grupo_id>'. */
export async function vendasFlexivel(
  exec: Executor, j: Janela, dim: Dimensao, filtros: readonly VendasFiltro[], limite: number,
): Promise<GrupoLinha[]> {
  const g = grupoIdDaDimensao(dim)
  let chave: Consulta
  let rotulo: Consulta
  let joinExtra: Consulta = sqlBruto('')
  if (g !== null) {
    // Agrupa pela opcao escolhida dentro do grupo; item sem opcao no grupo vira "(sem opção)".
    joinExtra = sql`left join lateral (
        select o.nome_snapshot as nome
          from public.itens_pedido_opcoes o
          join public.opcoes op on op.id = o.opcao_id and op.loja_id = o.loja_id
         where o.item_pedido_id = i.id and op.grupo_id = ${g}) optd on true`
    chave = sqlBruto(`coalesce(optd.nome, '(sem opção)')`)
    rotulo = sqlBruto('null')
  } else if (dim === 'motoboy') {
    chave = sqlBruto(`coalesce(m.id::text, 'sem')`)
    rotulo = sqlBruto(`coalesce(m.nome, 'Sem motoboy')`)
  } else {
    chave = sqlBruto(EXPR_FIXA[dim]!)
    rotulo = sqlBruto('null')
  }
  const ordem = DIMENSOES_TEMPO.has(dim) ? sqlBruto('chave') : sqlBruto('faturamento desc, chave')
  const consulta = sql`with g as (
      select ${chave} as chave, ${rotulo} as rotulo,
             count(distinct p.id)::int as pedidos,
             sum(i.quantidade)::int as quantidade,
             sum(i.total_centavos)::float8 as faturamento
        ${JOINS_BASE}
        ${joinExtra}
       where ${whereBase(j, filtros)}
       group by 1, 2)
    select chave, rotulo, pedidos, quantidade, faturamento,
           (sum(faturamento) over ())::float8 as total_grupo
      from g order by ${ordem} limit ${limite}`
  return consultar<GrupoLinha>(exec, consulta)
}

export interface TotalVendas {
  pedidos: number
  faturamento: number
}

/** Universo honesto do relatorio (mesmos filtros, sem agrupar nem multiplicar por opcao). */
export async function totalVendasFiltrado(
  exec: Executor, j: Janela, filtros: readonly VendasFiltro[],
): Promise<TotalVendas> {
  const r = await consultarUm<TotalVendas>(
    exec,
    sql`select count(distinct p.id)::int as pedidos,
               coalesce(sum(i.total_centavos), 0)::float8 as faturamento
          ${JOINS_BASE}
         where ${whereBase(j, filtros)}`,
  )
  return r!
}

// --- Salao (mesa): fonte propria, nao se liga a pedidos, fica fora do montador ----
/** Vendas do salao por mesa: comandas FECHADAS, periodo pela data de fechamento. */
export async function vendasPorMesa(exec: Executor, j: Janela): Promise<GrupoLinha[]> {
  return consultar<GrupoLinha>(
    exec,
    sql`with g as (
        select me.id::text as chave, me.nome as rotulo,
               count(*)::int as pedidos,
               null::int as quantidade,
               sum(c.total_centavos)::float8 as faturamento
          from public.comandas c
          join public.mesas me on me.id = c.mesa_id and me.loja_id = c.loja_id
         where c.loja_id = ${j.lojaId} and c.status = 'fechada'
           and c.fechada_em >= ${j.inicio} and c.fechada_em < ${j.fim}
         group by 1, 2)
      select chave, rotulo, pedidos, quantidade, faturamento,
             (sum(faturamento) over ())::float8 as total_grupo
        from g order by faturamento desc, rotulo`,
  )
}

/** Universo do salao: comandas fechadas no periodo (denominador proprio, nao pedidos). */
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

// --- Catalogo de dimensoes (alimenta os seletores do montador) --------------------
export interface Rotulado { id: string; nome: string }

/** Grupos de opcao da loja (viram dimensoes 'opcao:<id>': Tamanho, Sabor, Adicional...). */
export async function gruposOpcaoDaLoja(exec: Executor, lojaId: string): Promise<Rotulado[]> {
  return consultar<Rotulado>(
    exec,
    sql`select id, nome from public.grupos_opcoes
         where loja_id = ${lojaId} and ativo order by ordem, nome`,
  )
}

export interface OpcaoDoGrupo { grupo_id: string; nome: string }
/** Opcoes ativas por grupo (valores dos filtros de opcao). */
export async function opcoesPorGrupo(exec: Executor, lojaId: string): Promise<OpcaoDoGrupo[]> {
  return consultar<OpcaoDoGrupo>(
    exec,
    sql`select grupo_id, nome from public.opcoes
         where loja_id = ${lojaId} and ativo order by grupo_id, ordem, nome`,
  )
}

/** Motoboys ativos da loja (valores do filtro de motoboy). */
export async function motoboysDaLoja(exec: Executor, lojaId: string): Promise<Rotulado[]> {
  return consultar<Rotulado>(
    exec,
    sql`select id, nome from public.motoboys where loja_id = ${lojaId} and ativo order by nome`,
  )
}

/** Categorias da loja (valores do filtro de categoria). */
export async function categoriasDaLoja(exec: Executor, lojaId: string): Promise<{ nome: string }[]> {
  return consultar<{ nome: string }>(
    exec,
    sql`select nome from public.categorias where loja_id = ${lojaId} order by nome`,
  )
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
