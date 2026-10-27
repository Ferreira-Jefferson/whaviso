// Escritas do modulo (dentro de transacao). mensagens: so INSERT (registro imutavel).
import { consultar, consultarUm, sql, sqlBruto, type Executor } from '@whaviso/shared/db'
import type { StatusConversa } from '@whaviso/shared/contracts'
import { COLS_MSG, type LinhaMensagem } from './repo'

export interface ConversaTravada {
  id: string
  status: StatusConversa
  ultima_entrada_em: Date | null
  cliente_id: string
  numero_whatsapp_id: string
  telefone_hash: string
  numero_status: 'conectado' | 'pausado' | 'removido'
}

/** Trava a linha da conversa (FOR UPDATE OF c), escopada por loja. */
export async function travarConversa(
  exec: Executor,
  lojaId: string,
  conversaId: string,
): Promise<ConversaTravada | null> {
  return consultarUm<ConversaTravada>(
    exec,
    sql`select c.id, c.status, c.ultima_entrada_em, c.cliente_id, c.numero_whatsapp_id,
               cl.telefone_hash, nw.status as numero_status
          from public.conversas c
          join public.clientes cl on cl.id = c.cliente_id and cl.loja_id = c.loja_id
          join public.numeros_whatsapp nw on nw.id = c.numero_whatsapp_id and nw.loja_id = c.loja_id
         where c.loja_id = ${lojaId} and c.id = ${conversaId}
           for update of c`,
  )
}

export async function inserirMensagemHumana(
  exec: Executor,
  lojaId: string,
  conversaId: string,
  texto: string,
): Promise<LinhaMensagem> {
  const [nova] = await consultar<{ id: string }>(
    exec,
    sql`insert into public.mensagens (loja_id, conversa_id, direcao, autor, tipo, conteudo)
        values (${lojaId}, ${conversaId}, 'saida', 'humano', 'texto', ${texto})
        returning id`,
  )
  const [linha] = await consultar<LinhaMensagem>(
    exec,
    sql`select ${sqlBruto(COLS_MSG)} from public.mensagens m where m.id = ${nova!.id}`,
  )
  return linha!
}

/** Enfileira no outbox (texto livre = template_chave NULL). O zap drena; a api nunca fala com a Meta. */
export async function enfileirarTextoLivre(
  exec: Executor,
  c: {
    lojaId: string
    conversaId: string
    numeroId: string
    clienteId: string
    destinatarioHash: string
    texto: string
    mensagemId: string
  },
): Promise<string> {
  const payload = JSON.stringify({ tipo: 'texto', texto: c.texto })
  const [linha] = await consultar<{ id: string }>(
    exec,
    sql`insert into public.envios (loja_id, numero_whatsapp_id, cliente_id, destinatario_hash, template_chave,
                                   payload, conversa_id, dedupe_chave)
        values (${c.lojaId}, ${c.numeroId}, ${c.clienteId}, ${c.destinatarioHash}, null,
                ${payload}::jsonb, ${c.conversaId}, ${'conversa_msg:' + c.mensagemId})
        returning id`,
  )
  return linha!.id
}

/** Dispara o trigger de atualizado_em para a conversa subir na lista. */
export async function tocarConversa(exec: Executor, lojaId: string, conversaId: string): Promise<void> {
  await consultar(
    exec,
    sql`update public.conversas set status = status where loja_id = ${lojaId} and id = ${conversaId}`,
  )
}

/** Handoff manual ia->humano: marca quem assumiu e desde quando (dispara atualizado_em). */
export async function assumirConversa(
  exec: Executor,
  lojaId: string,
  conversaId: string,
  membroId: string | null,
): Promise<void> {
  await consultar(
    exec,
    sql`update public.conversas
           set status = 'humano', atendido_por_membro_id = ${membroId}, humano_desde = now()
         where loja_id = ${lojaId} and id = ${conversaId}`,
  )
}

/** Handoff manual humano->ia: devolve para a automacao e limpa quem atendia. */
export async function devolverConversa(exec: Executor, lojaId: string, conversaId: string): Promise<void> {
  await consultar(
    exec,
    sql`update public.conversas
           set status = 'ia', atendido_por_membro_id = null, humano_desde = null
         where loja_id = ${lojaId} and id = ${conversaId}`,
  )
}

export async function encerrarConversa(exec: Executor, lojaId: string, conversaId: string): Promise<void> {
  await consultar(
    exec,
    sql`update public.conversas set status = 'encerrada' where loja_id = ${lojaId} and id = ${conversaId}`,
  )
}

/** Auditoria append-only sem PII (so ids e codigos). */
export async function registrarEvento(
  exec: Executor,
  e: { lojaId: string; tipo: string; conversaId: string; detalhes: Record<string, string> },
): Promise<void> {
  const detalhes = JSON.stringify(e.detalhes)
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, ${e.tipo}, 'conversa', ${e.conversaId}, 'loja', ${detalhes}::jsonb)`,
  )
}
