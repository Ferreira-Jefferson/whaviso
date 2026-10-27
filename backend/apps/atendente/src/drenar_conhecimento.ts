// Consumidor da base de conhecimento (app-root: pode chamar o kernel de RAG em shared/). A api grava
// o evento `conhecimento.documento_aprovado`/`documento_arquivado` e muda `documentos.status`; aqui
// o atendente sincroniza o indice (`chunks`) com o estado dos documentos, sem outbox dedicado:
//   - aprovado sem chunks e sem marca de ingestao  -> ingerirDocumento (idempotente por documento);
//   - arquivado que ainda tem chunks               -> apaga os chunks (so da loja do documento).
// A marca `conhecimento.documento_ingerido` (eventos, sem PII) evita reprocessar para sempre o
// documento que a ingestao pulou de proposito (dado vivo/vazio) e por isso nunca gera chunks.
// Falha fechada: erro num documento e logado (so ids) e nao derruba o tick nem os demais.
import { consultar, sql, type Executor } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import { ingerirDocumento, type DepsIngestor } from './shared/rag'

export const MAX_DOCUMENTOS_POR_DRENAGEM = 10
export const EVENTO_INGERIDO = 'conhecimento.documento_ingerido'

export interface DepsConhecimento {
  /** Executor (role whaviso_atendente) que le documentos e escreve chunks/eventos. */
  exec: Executor
  logger: Logger
  ingestor: DepsIngestor
}

export interface ResumoConhecimento {
  ingeridos: number
  arquivados: number
}

/** Sincroniza o indice com os documentos: ingere os aprovados novos e limpa os arquivados. Nunca lanca. */
export async function drenarConhecimento(
  deps: DepsConhecimento,
  max = MAX_DOCUMENTOS_POR_DRENAGEM,
): Promise<ResumoConhecimento> {
  const resumo: ResumoConhecimento = { ingeridos: 0, arquivados: 0 }

  try {
    const pendentes = await consultar<{ id: string; loja_id: string }>(
      deps.exec,
      sql`select d.id, d.loja_id from public.documentos d
           where d.status = 'aprovado'
             and not exists (select 1 from public.chunks c where c.documento_id = d.id)
             and not exists (select 1 from public.eventos e
                              where e.tipo = ${EVENTO_INGERIDO} and e.entidade_id = d.id)
           order by d.aprovado_em nulls last, d.criado_em
           limit ${max}`,
    )
    for (const doc of pendentes) {
      try {
        const r = await ingerirDocumento(deps.ingestor, doc.id)
        await consultar(
          deps.exec,
          sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
              values (${doc.loja_id}, ${EVENTO_INGERIDO}, 'documento', ${doc.id}, 'ia',
                      ${JSON.stringify({ chunks: r.chunks, pulado: r.pulado ?? null })}::jsonb)`,
        )
        resumo.ingeridos += 1
        deps.logger.info({ loja_id: doc.loja_id, documento_id: doc.id, chunks: r.chunks, pulado: r.pulado }, 'documento ingerido')
      } catch (erro) {
        deps.logger.error({ loja_id: doc.loja_id, documento_id: doc.id, err: erro }, 'ingestao de documento falhou')
      }
    }
  } catch (erro) {
    deps.logger.error({ err: erro }, 'varredura de documentos aprovados falhou')
  }

  try {
    const arquivados = await consultar<{ id: string; loja_id: string }>(
      deps.exec,
      sql`select distinct d.id, d.loja_id from public.documentos d
           join public.chunks c on c.documento_id = d.id
          where d.status = 'arquivado'
          limit ${max}`,
    )
    for (const doc of arquivados) {
      try {
        await consultar(
          deps.exec,
          sql`delete from public.chunks where documento_id = ${doc.id} and loja_id = ${doc.loja_id}`,
        )
        resumo.arquivados += 1
        deps.logger.info({ loja_id: doc.loja_id, documento_id: doc.id }, 'chunks de documento arquivado removidos')
      } catch (erro) {
        deps.logger.error({ loja_id: doc.loja_id, documento_id: doc.id, err: erro }, 'limpeza de documento arquivado falhou')
      }
    }
  } catch (erro) {
    deps.logger.error({ err: erro }, 'varredura de documentos arquivados falhou')
  }

  return resumo
}
