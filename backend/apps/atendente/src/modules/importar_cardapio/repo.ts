// SQL do consumidor: so o que o grant do whaviso_atendente permite em `importacoes_cardapio`
// (SELECT sem rascunho/hash; UPDATE de status, rascunho, erro, arquivo_bytes, tentativas,
// processando_desde). SQL parametrizado (SEC-080). Nunca loga bytes nem rascunho.
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'
import type { RascunhoCardapio } from '@whaviso/shared/contracts'
import type { JobImportacao } from './tipos'

interface LinhaJob {
  id: string
  loja_id: string
  tipo_arquivo: 'imagem' | 'pdf'
  mime: string
  arquivo_bytes: Buffer | null
  tentativas: number
}

/**
 * Claim: pega o job mais antigo em `fila` (SKIP LOCKED, indice parcial) e marca `processando`.
 * Deve rodar dentro de uma transacao curta (o lock dura so o claim; o LLM roda fora dela).
 * `excluir` evita re-reivindicar na mesma drenagem um job que acabou de voltar para a fila.
 */
export async function reivindicar(tx: Executor, excluir: readonly string[]): Promise<JobImportacao | null> {
  const l = await consultarUm<LinhaJob>(
    tx,
    sql`select id, loja_id, tipo_arquivo, mime, arquivo_bytes, tentativas
          from public.importacoes_cardapio
         where status = 'fila' and id <> all(${[...excluir]}::uuid[])
         order by criado_em
         limit 1
         for update skip locked`,
  )
  if (!l) return null
  await consultar(
    tx,
    sql`update public.importacoes_cardapio set status = 'processando', processando_desde = now()
         where id = ${l.id}`,
  )
  return {
    id: l.id,
    lojaId: l.loja_id,
    tipoArquivo: l.tipo_arquivo,
    mime: l.mime,
    arquivoBytes: l.arquivo_bytes,
    tentativas: l.tentativas,
  }
}

/** Conclui com sucesso: rascunho validado, binario zerado (retencao minima). Guarda no estado. */
export async function concluirRascunho(exec: Executor, id: string, rascunho: RascunhoCardapio): Promise<boolean> {
  const r = await consultar<{ id: string }>(
    exec,
    sql`update public.importacoes_cardapio
           set status = 'rascunho_pronto', rascunho = ${JSON.stringify(rascunho)}::jsonb, erro = null,
               arquivo_bytes = null, processando_desde = null
         where id = ${id} and status = 'processando'
        returning id`,
  )
  return r.length > 0
}

/** Conclui com erro permanente: CODIGO curto (nunca texto cru), tentativa contada, binario zerado. */
export async function concluirErro(exec: Executor, id: string, codigo: string): Promise<boolean> {
  const r = await consultar<{ id: string }>(
    exec,
    sql`update public.importacoes_cardapio
           set status = 'erro', erro = ${codigo}, tentativas = tentativas + 1,
               arquivo_bytes = null, processando_desde = null
         where id = ${id} and status = 'processando'
        returning id`,
  )
  return r.length > 0
}

/** Falha retentavel: volta para `fila` com +1 tentativa (o arquivo e mantido para a proxima). */
export async function reenfileirar(exec: Executor, id: string): Promise<boolean> {
  const r = await consultar<{ id: string }>(
    exec,
    sql`update public.importacoes_cardapio
           set status = 'fila', tentativas = tentativas + 1, processando_desde = null
         where id = ${id} and status = 'processando'
        returning id`,
  )
  return r.length > 0
}
