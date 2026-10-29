// Acesso a dados do dashboard (read-model): SO SELECT, via @whaviso/shared/db com sql`...`
// (parametrizado). Toda consulta filtra por loja_id (multi-tenant) e agrega no banco. Le
// pedidos, itens_pedido e conversas diretamente (sem importar o codigo desses modulos). Nenhum
// dado pessoal (telefone, nome de cliente, endereco) e selecionado.
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'
import { TZ } from '@whaviso/shared/datas'

export interface Janela {
  lojaId: string
  inicio: Date
  fim: Date
}

export interface ResumoLinha {
  total: number
  novo: number
  em_preparo: number
  saiu_entrega: number
  entregue: number
  problema: number
  whatsapp: number
  ifood: number
  manual: number
  entrega: number
  retirada: number
  fat_realizado: number
  fat_andamento: number
  minutos_medio: number | null
}

/** Uma passada em pedidos. `rascunho` (fora do kanban) nunca conta. */
export async function resumo(exec: Executor, j: Janela): Promise<ResumoLinha> {
  const r = await consultarUm<ResumoLinha>(
    exec,
    sql`select count(*)::int as total,
               (count(*) filter (where status = 'novo'))::int as novo,
               (count(*) filter (where status = 'em_preparo'))::int as em_preparo,
               (count(*) filter (where status = 'saiu_entrega'))::int as saiu_entrega,
               (count(*) filter (where status = 'entregue'))::int as entregue,
               (count(*) filter (where status = 'problema'))::int as problema,
               (count(*) filter (where origem = 'whatsapp'))::int as whatsapp,
               (count(*) filter (where origem = 'ifood'))::int as ifood,
               (count(*) filter (where origem = 'manual'))::int as manual,
               (count(*) filter (where modalidade = 'entrega'))::int as entrega,
               (count(*) filter (where modalidade = 'retirada'))::int as retirada,
               coalesce(sum(total_centavos) filter (where status = 'entregue'), 0)::float8 as fat_realizado,
               coalesce(sum(total_centavos) filter (where status in ('novo', 'em_preparo', 'saiu_entrega')), 0)::float8
                 as fat_andamento,
               (avg(extract(epoch from (entregue_em - criado_em)) / 60.0)
                  filter (where status = 'entregue' and entregue_em is not null))::float8 as minutos_medio
          from public.pedidos
         where loja_id = ${j.lojaId} and status <> 'rascunho'
           and criado_em >= ${j.inicio} and criado_em < ${j.fim}`,
  )
  return r!
}

export interface DiaLinha {
  data: string
  pedidos: number
  entregues: number
  faturamento: number
}

/** Serie por dia civil de SP; dias sem pedido vem com zero (generate_series). */
export async function seriePorDia(exec: Executor, j: Janela, de: string, ate: string): Promise<DiaLinha[]> {
  return consultar<DiaLinha>(
    exec,
    sql`select to_char(d.dia, 'YYYY-MM-DD') as data,
               coalesce(a.pedidos, 0)::int as pedidos,
               coalesce(a.entregues, 0)::int as entregues,
               coalesce(a.faturamento, 0)::float8 as faturamento
          from generate_series(${de}::date, ${ate}::date, interval '1 day') as d(dia)
          left join (
            select (criado_em at time zone ${TZ})::date as dia,
                   count(*) as pedidos,
                   count(*) filter (where status = 'entregue') as entregues,
                   sum(total_centavos) filter (where status = 'entregue') as faturamento
              from public.pedidos
             where loja_id = ${j.lojaId} and status <> 'rascunho'
               and criado_em >= ${j.inicio} and criado_em < ${j.fim}
             group by 1
          ) a on a.dia = d.dia::date
         order by d.dia`,
  )
}

export interface HoraLinha {
  hora: number
  pedidos: number
  faturamento: number
}

/** Serie por hora do dia (0..23, relogio de SP) somada no periodo; horas vazias vem com zero. */
export async function seriePorHora(exec: Executor, j: Janela): Promise<HoraLinha[]> {
  return consultar<HoraLinha>(
    exec,
    sql`select h.hora::int as hora,
               coalesce(a.pedidos, 0)::int as pedidos,
               coalesce(a.faturamento, 0)::float8 as faturamento
          from generate_series(0, 23) as h(hora)
          left join (
            select extract(hour from criado_em at time zone ${TZ})::int as hora,
                   count(*) as pedidos,
                   sum(total_centavos) filter (where status = 'entregue') as faturamento
              from public.pedidos
             where loja_id = ${j.lojaId} and status <> 'rascunho'
               and criado_em >= ${j.inicio} and criado_em < ${j.fim}
             group by 1
          ) a on a.hora = h.hora
         order by h.hora`,
  )
}

export interface TopItemLinha {
  nome: string
  quantidade: number
  receita: number
}

/** Itens mais vendidos: pedidos nem rascunho nem problema, linhas nao canceladas. */
export async function topItens(exec: Executor, j: Janela, limite: number): Promise<TopItemLinha[]> {
  return consultar<TopItemLinha>(
    exec,
    sql`select i.nome_snapshot as nome,
               sum(i.quantidade)::int as quantidade,
               sum(i.total_centavos)::float8 as receita
          from public.itens_pedido i
          join public.pedidos p on p.id = i.pedido_id and p.loja_id = i.loja_id
         where p.loja_id = ${j.lojaId} and p.status not in ('rascunho', 'problema')
           and not i.cancelado
           and p.criado_em >= ${j.inicio} and p.criado_em < ${j.fim}
         group by i.nome_snapshot
         order by quantidade desc, nome
         limit ${limite}`,
  )
}

export interface ConversasLinha {
  abertas: number
  em_humano: number
  p_ia: number
  p_humano: number
  p_encerrada: number
}

export async function conversas(exec: Executor, j: Janela): Promise<ConversasLinha> {
  const r = await consultarUm<ConversasLinha>(
    exec,
    sql`select (count(*) filter (where status <> 'encerrada'))::int as abertas,
               (count(*) filter (where status = 'humano'))::int as em_humano,
               (count(*) filter (where status = 'ia' and criado_em >= ${j.inicio} and criado_em < ${j.fim}))::int as p_ia,
               (count(*) filter (where status = 'humano' and criado_em >= ${j.inicio} and criado_em < ${j.fim}))::int
                 as p_humano,
               (count(*) filter (where status = 'encerrada' and criado_em >= ${j.inicio} and criado_em < ${j.fim}))::int
                 as p_encerrada
          from public.conversas
         where loja_id = ${j.lojaId}
           and (status <> 'encerrada' or (criado_em >= ${j.inicio} and criado_em < ${j.fim}))`,
  )
  return r!
}

export interface AutonomiaLinha {
  com_conversa: number
  sem_humano: number
}

/** Pedidos do periodo com conversa e quantos cuja conversa nunca teve `humano_desde`. */
export async function autonomia(exec: Executor, j: Janela): Promise<AutonomiaLinha> {
  const r = await consultarUm<AutonomiaLinha>(
    exec,
    sql`select count(*)::int as com_conversa,
               (count(*) filter (where c.humano_desde is null))::int as sem_humano
          from public.pedidos p
          join public.conversas c on c.id = p.conversa_id and c.loja_id = p.loja_id
         where p.loja_id = ${j.lojaId} and p.status <> 'rascunho'
           and p.criado_em >= ${j.inicio} and p.criado_em < ${j.fim}`,
  )
  return r!
}
