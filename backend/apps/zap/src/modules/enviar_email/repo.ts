// Acesso a dados do dreno de e-mail: SO via @whaviso/shared/db (sql parametrizado, SEC-080).
// Escreve apenas as colunas de transporte que o grant de whaviso_zap permite em `emails_outbox`
// (status, enviado_em, tentativas, proxima_tentativa_em, provider_id, erro). Nunca o payload/para.
import { consultar, sql, type Executor, type Pool } from '@whaviso/shared/db'

/** Linha reivindicada da outbox de e-mail (o que o render/envio precisa). */
export interface EmailReivindicado {
  id: string
  para: string
  template: string
  payload: unknown
  tentativas: number
}

/**
 * Reivindica um lote de e-mails devidos e os marca `processando` na MESMA transacao, com
 * `for update skip locked` (dois workers nunca pegam a mesma linha). So o `status` e escrito no
 * UPDATE (coluna concedida); o RETURNING le colunas que o zap tem SELECT.
 */
export async function reivindicar(pool: Pool, tamanhoLote: number): Promise<EmailReivindicado[]> {
  return consultar<EmailReivindicado>(
    pool,
    sql`
      with devidos as (
        select id from public.emails_outbox
        where status = 'agendado'
          and agendado_para <= now()
          and (proxima_tentativa_em is null or proxima_tentativa_em <= now())
        order by agendado_para
        for update skip locked
        limit ${tamanhoLote}
      )
      update public.emails_outbox e
      set status = 'processando'
      from devidos d
      where e.id = d.id
      returning e.id, e.para, e.template, e.payload, e.tentativas`,
  )
}

/** Recupera e-mails orfaos (`processando` alem do limite): volta a `agendado` sem consumir tentativa. */
export async function recuperarOrfaos(pool: Pool, orfaoAposMs: number): Promise<number> {
  const linhas = await consultar<{ id: string }>(
    pool,
    sql`update public.emails_outbox
        set status = 'agendado'
        where status = 'processando'
          and atualizado_em < now() - make_interval(secs => ${orfaoAposMs / 1000})
        returning id`,
  )
  return linhas.length
}

/** Sucesso: grava provider_id e marca enviado, limpando o erro anterior. */
export async function marcarEnviado(exec: Executor, id: string, providerId: string): Promise<void> {
  await consultar(
    exec,
    sql`update public.emails_outbox
        set status = 'enviado', enviado_em = now(), provider_id = ${providerId}, erro = null
        where id = ${id}`,
  )
}

/** Falha transitoria: reagenda com backoff e consome uma tentativa. */
export async function reagendar(
  exec: Executor,
  id: string,
  tentativas: number,
  proximaEmMs: number,
  erro: string,
): Promise<void> {
  await consultar(
    exec,
    sql`update public.emails_outbox
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
    sql`update public.emails_outbox
        set status = 'falhou', tentativas = ${tentativas}, erro = ${erro}
        where id = ${id}`,
  )
}
