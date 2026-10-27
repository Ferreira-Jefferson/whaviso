// Acesso a dados do inbound: SO via @whaviso/shared/db (sql parametrizado, SEC-080). Escreve
// apenas o que o grant do whaviso_zap permite (0006/0010): insert em webhook_eventos_processados,
// clientes, conversas e mensagens; update de conversas.ultima_entrada_em; e, nos recibos, so as
// colunas de outbox de envios (status, erro, entrega_status, SEC-031). Nunca projeta telefone,
// token nem conteudo em log.
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'
import type { TipoMensagemEntrada } from './parse'

/**
 * Reivindica o wamid na tabela de idempotencia. `on conflict do nothing` + `returning`: a 1a
 * request grava e recebe a linha; uma reentrega (mesmo wamid) recebe vazio. Sob concorrencia o
 * INSERT do 2o chamador bloqueia na PK ate o 1o commitar e entao nao retorna nada (SEC-051).
 * Retorna true se ESTE chamador reivindicou (deve processar).
 */
export async function reivindicarWamid(exec: Executor, wamid: string): Promise<boolean> {
  const linha = await consultarUm<{ wamid: string }>(
    exec,
    sql`insert into public.webhook_eventos_processados (wamid)
        values (${wamid})
        on conflict (wamid) do nothing
        returning wamid`,
  )
  return linha !== null
}

export interface NumeroResolvido {
  id: string
  loja_id: string
  status: 'conectado' | 'pausado' | 'removido'
}

/** Resolve a loja pelo phone_number_id do inbound (SEC-001/002: loja NUNCA vem do payload). */
export async function resolverNumero(exec: Executor, phoneNumberId: string): Promise<NumeroResolvido | null> {
  return consultarUm<NumeroResolvido>(
    exec,
    sql`select id, loja_id, status
          from public.numeros_whatsapp
         where phone_number_id = ${phoneNumberId}`,
  )
}

/**
 * Upsert minimo do cliente por (loja_id, telefone_hash). O zap tem insert (nao update) em
 * clientes: grava se novo, senao le o id existente. Telefone so entra hasheado/cifrado.
 */
export async function upsertCliente(
  exec: Executor,
  lojaId: string,
  telefoneHash: string,
  telefoneCifrado: Buffer,
): Promise<string> {
  const novo = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.clientes (loja_id, telefone_hash, telefone_cifrado)
        values (${lojaId}, ${telefoneHash}, ${telefoneCifrado})
        on conflict (loja_id, telefone_hash) do nothing
        returning id`,
  )
  if (novo) return novo.id
  const existente = await consultarUm<{ id: string }>(
    exec,
    sql`select id from public.clientes where loja_id = ${lojaId} and telefone_hash = ${telefoneHash}`,
  )
  // on conflict do nothing so retorna vazio quando a linha ja existe: o select acha sempre.
  return existente!.id
}

/**
 * Acha a conversa aberta (status <> 'encerrada') do cliente naquele numero ou cria uma nova.
 * Respeita o indice parcial unico conversas_aberta_unica; sob corrida, o perdedor cai no select.
 */
export async function resolverConversa(
  exec: Executor,
  lojaId: string,
  numeroId: string,
  clienteId: string,
): Promise<{ id: string; status: 'ia' | 'humano' | 'encerrada' }> {
  const aberta = await consultarUm<{ id: string; status: 'ia' | 'humano' | 'encerrada' }>(
    exec,
    sql`select id, status from public.conversas
         where numero_whatsapp_id = ${numeroId} and cliente_id = ${clienteId} and status <> 'encerrada'`,
  )
  if (aberta) return aberta
  const nova = await consultarUm<{ id: string; status: 'ia' | 'humano' | 'encerrada' }>(
    exec,
    sql`insert into public.conversas (loja_id, numero_whatsapp_id, cliente_id)
        values (${lojaId}, ${numeroId}, ${clienteId})
        on conflict (numero_whatsapp_id, cliente_id) where status <> 'encerrada' do nothing
        returning id, status`,
  )
  if (nova) return nova
  const existente = await consultarUm<{ id: string; status: 'ia' | 'humano' | 'encerrada' }>(
    exec,
    sql`select id, status from public.conversas
         where numero_whatsapp_id = ${numeroId} and cliente_id = ${clienteId} and status <> 'encerrada'`,
  )
  return existente!
}

export interface MensagemNova {
  lojaId: string
  conversaId: string
  tipo: TipoMensagemEntrada
  conteudo: string | null
  midiaRef: string | null
  wamid: string
}

/** Insere a mensagem de ENTRADA (autor cliente). `on conflict (wamid) do nothing` e rede extra. */
export async function inserirMensagemEntrada(exec: Executor, m: MensagemNova): Promise<string | null> {
  const linha = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.mensagens (loja_id, conversa_id, direcao, autor, tipo, conteudo, midia_ref, wamid)
        values (${m.lojaId}, ${m.conversaId}, 'entrada', 'cliente', ${m.tipo}::tipo_mensagem,
                ${m.conteudo}, ${m.midiaRef}, ${m.wamid})
        on conflict (wamid) where wamid is not null do nothing
        returning id`,
  )
  return linha?.id ?? null
}

/** Marca de ultima mensagem de ENTRADA (base da janela de 24h). Unica coluna que o zap atualiza. */
export async function marcarUltimaEntrada(exec: Executor, conversaId: string): Promise<void> {
  await consultar(
    exec,
    sql`update public.conversas set ultima_entrada_em = now() where id = ${conversaId}`,
  )
}

// Ordem monotonica dos recibos: um 'delivered' atrasado nunca rebaixa um 'read' ja gravado.
const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 }

/**
 * Recibo de entrega: atualiza o envio correspondente por wamid (SEC-031: so colunas de outbox).
 * sent/delivered/read avancam entrega_status monotonicamente; failed marca status e erro.
 * wamid desconhecido: 0 linhas afetadas (ignorado). Retorna quantas linhas casaram.
 */
export async function aplicarRecibo(
  exec: Executor,
  wamid: string,
  status: 'sent' | 'delivered' | 'read' | 'failed',
  erro: string | null,
): Promise<number> {
  if (status === 'failed') {
    const linhas = await consultar<{ id: string }>(
      exec,
      sql`update public.envios
             set status = 'falhou', entrega_status = 'failed', erro = ${erro ?? 'failed'}
           where wamid = ${wamid}
           returning id`,
    )
    return linhas.length
  }
  const linhas = await consultar<{ id: string }>(
    exec,
    sql`update public.envios
           set entrega_status = ${status}::entrega_status
         where wamid = ${wamid}
           and coalesce(
                 case entrega_status
                   when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 4
                   else 0 end, 0) < ${RANK[status]}
           returning id`,
  )
  return linhas.length
}
