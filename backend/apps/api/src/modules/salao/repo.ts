// Leitura do salao. Acesso a dados SO via @whaviso/shared/db, sempre com sql`...`
// (parametrizado) e SEMPRE filtrando por loja_id do escopo (SEC-001/002). Escrita em
// repo_escrita.ts. Dinheiro em centavos; timestamps serializados em ISO/UTC.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

export interface MesaLinha {
  id: string
  nome: string
  capacidade: number | null
  ativo: boolean
  comanda_aberta_id: string | null
  comanda_aberta_total_centavos: number | null
  criado_em: string
}

export interface ComandaLinha {
  id: string
  mesa_id: string
  mesa_nome: string
  status: 'aberta' | 'fechada'
  total_centavos: number
  observacoes: string | null
  aberta_em: string
  fechada_em: string | null
}

export interface ComandaItemLinha {
  id: string
  item_id: string
  nome_item: string
  quantidade: number
  preco_unitario_centavos: number
  total_centavos: number
  criado_em: string
}

export interface ItemCardapio {
  id: string
  nome: string
  preco_centavos: number
  ativo: boolean
}

const MESA_COMANDA = sql`left join lateral (
  select c.id, c.total_centavos from public.comandas c
   where c.mesa_id = m.id and c.loja_id = m.loja_id and c.status = 'aberta' limit 1
) ca on true`

export async function listarMesas(exec: Executor, lojaId: string): Promise<MesaLinha[]> {
  return consultar<MesaLinha>(
    exec,
    sql`select m.id, m.nome, m.capacidade::int as capacidade, m.ativo,
               ca.id as comanda_aberta_id, ca.total_centavos as comanda_aberta_total_centavos,
               ${TS('m.criado_em')} as criado_em
          from public.mesas m
          ${MESA_COMANDA}
         where m.loja_id = ${lojaId}
         order by m.ativo desc, m.nome, m.id`,
  )
}

export async function obterMesa(exec: Executor, lojaId: string, id: string): Promise<MesaLinha | null> {
  return consultarUm<MesaLinha>(
    exec,
    sql`select m.id, m.nome, m.capacidade::int as capacidade, m.ativo,
               ca.id as comanda_aberta_id, ca.total_centavos as comanda_aberta_total_centavos,
               ${TS('m.criado_em')} as criado_em
          from public.mesas m
          ${MESA_COMANDA}
         where m.loja_id = ${lojaId} and m.id = ${id}`,
  )
}

/** Mesa so para guarda de pertencimento/estado (sem o read-model completo). */
export async function mesaBasica(
  exec: Executor,
  lojaId: string,
  id: string,
): Promise<{ id: string; ativo: boolean } | null> {
  return consultarUm<{ id: string; ativo: boolean }>(
    exec,
    sql`select id, ativo from public.mesas where loja_id = ${lojaId} and id = ${id}`,
  )
}

export async function obterComanda(exec: Executor, lojaId: string, id: string): Promise<ComandaLinha | null> {
  return consultarUm<ComandaLinha>(
    exec,
    sql`select c.id, c.mesa_id, m.nome as mesa_nome, c.status, c.total_centavos, c.observacoes,
               ${TS('c.aberta_em')} as aberta_em, ${TS('c.fechada_em')} as fechada_em
          from public.comandas c
          join public.mesas m on m.id = c.mesa_id and m.loja_id = c.loja_id
         where c.loja_id = ${lojaId} and c.id = ${id}`,
  )
}

export async function itensDaComanda(exec: Executor, lojaId: string, comandaId: string): Promise<ComandaItemLinha[]> {
  return consultar<ComandaItemLinha>(
    exec,
    sql`select id, item_id, nome_item, quantidade, preco_unitario_centavos,
               (quantidade * preco_unitario_centavos)::int as total_centavos,
               ${TS('criado_em')} as criado_em
          from public.comanda_itens
         where loja_id = ${lojaId} and comanda_id = ${comandaId}
         order by criado_em, id`,
  )
}

/** Item do cardapio da loja (origem do snapshot de nome/preco no lancamento). */
export async function itemDoCardapio(exec: Executor, lojaId: string, itemId: string): Promise<ItemCardapio | null> {
  return consultarUm<ItemCardapio>(
    exec,
    sql`select id, nome, preco_centavos, ativo from public.itens
         where loja_id = ${lojaId} and id = ${itemId}`,
  )
}
