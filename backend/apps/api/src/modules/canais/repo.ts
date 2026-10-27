// Acesso a dados do modulo canais. SO via @whaviso/shared/db, sempre com sql`...` (parametrizado).
// `credencial_cifrada` so e lida em `buscarCredencial` (pull de sincronizacao); toda projecao de
// listagem/estado usa lista EXPLICITA de metadado (nunca `select *`).
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { CanalTipo } from './schemas'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

export interface CanalMeta {
  id: string
  canal: CanalTipo
  ativo: boolean
  ultimos4: string | null
  config: Record<string, unknown>
  ultima_sincronizacao_em: string | null
  ultimo_erro: string | null
  criado_em: string
  atualizado_em: string
}

const META = sql`${sqlBruto('id, canal, ativo, ultimos4, config, ultimo_erro')},
  ${TS('ultima_sincronizacao_em')} as ultima_sincronizacao_em, ${TS('criado_em')} as criado_em,
  ${TS('atualizado_em')} as atualizado_em`

export async function listar(exec: Executor, lojaId: string): Promise<CanalMeta[]> {
  return consultar<CanalMeta>(exec, sql`select ${META} from public.canais_loja where loja_id = ${lojaId} order by canal`)
}

export async function buscar(exec: Executor, lojaId: string, canal: CanalTipo): Promise<CanalMeta | null> {
  return consultarUm<CanalMeta>(
    exec,
    sql`select ${META} from public.canais_loja where loja_id = ${lojaId} and canal = ${canal}::canal_pedido`,
  )
}

export async function upsert(
  exec: Executor,
  d: { lojaId: string; canal: CanalTipo; credencialCifrada: Buffer; ultimos4: string; config: object },
): Promise<CanalMeta> {
  const linha = await consultarUm<CanalMeta>(
    exec,
    sql`insert into public.canais_loja (loja_id, canal, credencial_cifrada, ultimos4, config, ativo)
        values (${d.lojaId}, ${d.canal}::canal_pedido, ${d.credencialCifrada}, ${d.ultimos4},
                ${JSON.stringify(d.config)}::jsonb, true)
        on conflict (loja_id, canal) do update set
          credencial_cifrada = ${d.credencialCifrada},
          ultimos4 = excluded.ultimos4,
          config = excluded.config,
          ativo = true,
          ultimo_erro = null
        returning ${META}`,
  )
  return linha!
}

export async function ajustar(
  exec: Executor,
  lojaId: string,
  canal: CanalTipo,
  campos: { ativo?: boolean | undefined; config?: object | undefined },
): Promise<CanalMeta | null> {
  return consultarUm<CanalMeta>(
    exec,
    sql`update public.canais_loja set
          ativo = coalesce(${campos.ativo ?? null}::boolean, ativo),
          config = coalesce(${campos.config === undefined ? null : JSON.stringify(campos.config)}::jsonb, config)
        where loja_id = ${lojaId} and canal = ${canal}::canal_pedido
        returning ${META}`,
  )
}

/** Unica leitura da credencial cifrada: so para o pull de sincronizacao. Nunca vai a resposta/log. */
export async function buscarCredencial(
  exec: Executor,
  lojaId: string,
  canal: CanalTipo,
): Promise<{ id: string; ativo: boolean; credencial_cifrada: Buffer; ultima_sincronizacao_em: string | null } | null> {
  return consultarUm(
    exec,
    sql`select id, ativo, credencial_cifrada, ${TS('ultima_sincronizacao_em')} as ultima_sincronizacao_em
          from public.canais_loja where loja_id = ${lojaId} and canal = ${canal}::canal_pedido`,
  )
}

/** Marca o resultado da sincronizacao: sucesso limpa o erro e avanca a marca; falha grava so o codigo. */
export async function marcarSincronizacao(
  exec: Executor,
  canalLojaId: string,
  erro: string | null,
): Promise<void> {
  await consultar(
    exec,
    erro === null
      ? sql`update public.canais_loja set ultima_sincronizacao_em = now(), ultimo_erro = null where id = ${canalLojaId}`
      : sql`update public.canais_loja set ultimo_erro = ${erro.slice(0, 60)} where id = ${canalLojaId}`,
  )
}

export async function pedidoJaImportado(exec: Executor, canalLojaId: string, idExterno: string): Promise<boolean> {
  const l = await consultarUm(
    exec,
    sql`select 1 as x from public.canal_pedidos where canal_loja_id = ${canalLojaId} and id_externo = ${idExterno}`,
  )
  return l !== null
}

export interface NovoPedido {
  lojaId: string
  codigo: string
  origem: 'ifood' | 'manual'
  modalidade: 'entrega' | 'retirada'
  subtotal: number
  taxa: number
  total: number
  observacao: string | null
  criadoEm: string
}

/** Cria o pedido (status `novo`, sem cliente: PII fica no canal). Codigo duplicado = 23505 (chamador tenta outro). */
export async function criarPedido(exec: Executor, p: NovoPedido): Promise<string> {
  const l = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.pedidos
          (loja_id, codigo, status, origem, modalidade, subtotal_centavos, taxa_entrega_centavos,
           total_centavos, observacao, criado_em)
        values (${p.lojaId}, ${p.codigo}, 'novo', ${p.origem}::origem_pedido, ${p.modalidade}::modalidade_pedido,
                ${p.subtotal}, ${p.taxa}, ${p.total}, ${p.observacao}, ${p.criadoEm}::timestamptz)
        returning id`,
  )
  return l!.id
}

export async function criarItem(
  exec: Executor,
  d: { pedidoId: string; lojaId: string; nome: string; preco: number; qtd: number; total: number; obs: string | null },
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.itens_pedido
          (pedido_id, loja_id, nome_snapshot, preco_unitario_centavos, quantidade, total_centavos, observacao)
        values (${d.pedidoId}, ${d.lojaId}, ${d.nome}, ${d.preco}, ${d.qtd}, ${d.total}, ${d.obs})`,
  )
}

export async function mapear(
  exec: Executor,
  d: { lojaId: string; canalLojaId: string; idExterno: string; pedidoId: string },
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.canal_pedidos (loja_id, canal_loja_id, id_externo, pedido_id)
        values (${d.lojaId}, ${d.canalLojaId}, ${d.idExterno}, ${d.pedidoId})`,
  )
}

export interface CanalPedidoLinha {
  id_externo: string
  pedido_id: string
  codigo: string
  total_centavos: number
  criado_em: string
}

export async function listarPedidos(exec: Executor, lojaId: string): Promise<CanalPedidoLinha[]> {
  return consultar<CanalPedidoLinha>(
    exec,
    sql`select cp.id_externo, cp.pedido_id, p.codigo, p.total_centavos, ${TS('cp.criado_em')} as criado_em
          from public.canal_pedidos cp join public.pedidos p on p.id = cp.pedido_id
         where cp.loja_id = ${lojaId} order by cp.criado_em desc limit 100`,
  )
}

export async function registrarEvento(
  exec: Executor,
  e: { lojaId: string; tipo: string; entidadeId: string; detalhes: object },
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, ${e.tipo}, 'canal_loja', ${e.entidadeId}, 'loja', ${JSON.stringify(e.detalhes)}::jsonb)`,
  )
}
