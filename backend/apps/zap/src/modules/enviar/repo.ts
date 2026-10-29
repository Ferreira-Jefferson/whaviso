// Acesso a dados do dreno de envios: SO via @whaviso/shared/db (sql parametrizado, SEC-080).
// Escreve apenas as colunas do outbox/saude que o grant do whaviso_zap permite (SEC-031):
// em `envios` (status, enviado_em, wamid, erro, proxima_tentativa_em, tentativas) e em
// `numeros_whatsapp` (status). Nunca toca loja_id, payload, token nem telefone.
import { consultar, consultarUm, sql, type Executor, type Pool } from '@whaviso/shared/db'
import type { LinhaNumero } from './credencial'

/** Linha reivindicada da outbox (o que o despacho precisa; sem PII em claro). */
export interface EnvioReivindicado {
  id: string
  loja_id: string
  numero_whatsapp_id: string
  cliente_id: string | null
  template_chave: string | null
  payload: unknown
  conversa_id: string | null
  tentativas: number
  wamid: string | null
}

/**
 * Reivindica um lote de envios devidos e os marca `processando` na MESMA transacao, com
 * `for update skip locked` (dois workers nunca pegam a mesma linha). So o `status` e escrito
 * no UPDATE (coluna concedida); o RETURNING le colunas que o zap tem SELECT.
 */
export async function reivindicar(pool: Pool, tamanhoLote: number): Promise<EnvioReivindicado[]> {
  return consultar<EnvioReivindicado>(
    pool,
    sql`
      with devidos as (
        select e.id from public.envios e
        join public.numeros_whatsapp n on n.id = e.numero_whatsapp_id
        left join public.clientes c on c.id = e.cliente_id
        left join public.conversas conv on conv.id = e.conversa_id
        where e.status = 'agendado'
          and e.agendado_para <= now()
          and (e.proxima_tentativa_em is null or e.proxima_tentativa_em <= now())
          and n.status = 'conectado'
          -- Coerencia de tenant (SEC): numero, cliente e conversa tem que ser da MESMA loja do
          -- envio. Uma linha de outbox cruzada (ex.: cliente da loja B com numero da loja A) NAO
          -- e reivindicada, logo nunca e decifrada nem enviada ao destino errado.
          and n.loja_id = e.loja_id
          and (e.cliente_id is null or c.loja_id = e.loja_id)
          and (e.conversa_id is null or conv.loja_id = e.loja_id)
        order by e.agendado_para
        for update of e skip locked
        limit ${tamanhoLote}
      )
      update public.envios e
      set status = 'processando'
      from devidos d
      where e.id = d.id
      returning e.id, e.loja_id, e.numero_whatsapp_id, e.cliente_id,
                e.template_chave, e.payload, e.conversa_id, e.tentativas, e.wamid`,
  )
}

/**
 * Recupera envios orfaos: ficaram `processando` alem do limite (worker morreu). Volta a
 * `agendado` SEM consumir tentativa. Devolve quantos foram recuperados.
 *
 * AT-LEAST-ONCE: se o worker morreu DEPOIS do 200 da Meta mas ANTES de gravar o wamid, esta
 * recuperacao reagenda uma linha que ja foi entregue, o que PODE duplicar a mensagem ao cliente
 * (a Cloud API nao tem idempotency key nativa; ver service.ts). O biz_opaque_callback_data =
 * envio.id enviado em cada mensagem volta no webhook de status e serve de rastro para uma
 * reconciliacao futura identificar esses casos.
 */
export async function recuperarOrfaos(pool: Pool, orfaoAposMs: number): Promise<number> {
  const linhas = await consultar<{ id: string }>(
    pool,
    sql`update public.envios
        set status = 'agendado'
        where status = 'processando'
          and atualizado_em < now() - make_interval(secs => ${orfaoAposMs / 1000})
        returning id`,
  )
  return linhas.length
}

/** Sucesso: grava wamid e marca enviado, limpando o erro anterior. */
export async function marcarEnviado(exec: Executor, id: string, wamid: string): Promise<void> {
  await consultar(
    exec,
    sql`update public.envios
        set status = 'enviado', wamid = ${wamid}, enviado_em = now(), erro = null
        where id = ${id}`,
  )
}

/** Falha transitoria: reagenda com backoff (nao reenvia agora) e consome uma tentativa. */
export async function reagendar(
  exec: Executor,
  id: string,
  tentativas: number,
  proximaEmMs: number,
  erro: string,
): Promise<void> {
  await consultar(
    exec,
    sql`update public.envios
        set status = 'agendado', tentativas = ${tentativas}, erro = ${erro},
            proxima_tentativa_em = now() + make_interval(secs => ${proximaEmMs / 1000})
        where id = ${id}`,
  )
}

/** Falha definitiva: marca falhou com um codigo curto e sem PII. */
export async function marcarFalhou(
  exec: Executor,
  id: string,
  tentativas: number,
  erro: string,
): Promise<void> {
  await consultar(
    exec,
    sql`update public.envios
        set status = 'falhou', tentativas = ${tentativas}, erro = ${erro}
        where id = ${id}`,
  )
}

/** Le a credencial do numero remetente (token cifrado, nunca em log). */
export async function lerNumero(exec: Executor, numeroId: string): Promise<LinhaNumero | null> {
  return consultarUm<LinhaNumero>(
    exec,
    sql`select phone_number_id, token_cifrado, status
        from public.numeros_whatsapp where id = ${numeroId}`,
  )
}

/** Le o telefone cifrado do destinatario (decifrado so no uso). */
export async function lerTelefoneCliente(exec: Executor, clienteId: string): Promise<Buffer | null> {
  const linha = await consultarUm<{ telefone_cifrado: Buffer | null }>(
    exec,
    sql`select telefone_cifrado from public.clientes where id = ${clienteId}`,
  )
  return linha?.telefone_cifrado ?? null
}

/** Marca de ultima mensagem de ENTRADA da conversa (base da janela de 24h; so leitura). */
export async function lerUltimaEntrada(exec: Executor, conversaId: string): Promise<Date | null> {
  const linha = await consultarUm<{ ultima_entrada_em: Date | null }>(
    exec,
    sql`select ultima_entrada_em from public.conversas where id = ${conversaId}`,
  )
  return linha?.ultima_entrada_em ?? null
}

/** Template ativo por chave: prefere a sobrescrita da loja; cai no padrao da plataforma. */
export interface LinhaTemplate {
  nome_meta: string
  idioma: string
  variaveis: unknown
}
export async function lerTemplateAtivo(
  exec: Executor,
  lojaId: string,
  chave: string,
): Promise<LinhaTemplate | null> {
  return consultarUm<LinhaTemplate>(
    exec,
    sql`select nome_meta, idioma, variaveis
        from public.templates
        where chave = ${chave} and ativo and (loja_id = ${lojaId} or loja_id is null)
        order by loja_id nulls last
        limit 1`,
  )
}

/** Sinaliza a saude do numero (so a coluna `status`, concedida ao zap): pausa token morto. */
export async function pausarNumero(exec: Executor, numeroId: string): Promise<void> {
  await consultar(
    exec,
    sql`update public.numeros_whatsapp set status = 'pausado' where id = ${numeroId}`,
  )
}
