// Sincroniza os templates do whaviso com a Meta Cloud API:
//  - submeterPendentes: a api enfileira (meta_acao='criar'); aqui drenamos, criamos/editamos
//    o template na WABA (Graph) e gravamos meta_template_id + status. O painel nunca liga
//    status_meta na mão: a Meta é quem decide.
//  - reconciliarTemplates: GET na lista da WABA e reflete o status REAL (rede de segurança
//    para webhooks perdidos; corrige 'aprovado' fantasma de seeds que a Meta não tem).
//  - processarStatusTemplate: aplica o webhook message_template_status_update (tempo real).
//
// Integra com a api só pelo banco (coluna meta_acao), nunca por import. As credenciais
// META_* chegam por deps (OpcoesMeta), montadas no server.ts. Nunca loga token.
import type { Pool } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import type { EventoTemplateStatus } from '../../shared/whats'
import { ErroEnvio } from '../../shared/whats'
import type { OpcoesMeta } from '../../shared/meta_client'
import { criarTemplateGraph, editarTemplateGraph, listarTemplatesGraph } from '../../shared/meta_client/graph'
import { montarDefTemplate } from '../../shared/meta_client/template_payload'
import { traduzirStatusTemplateMeta } from '../../shared/meta_client/inbound'
import * as repo from './repo'

export interface DepsSincronizarTemplates {
  pool: Pool
  logger: Logger
  metaOpcoes: OpcoesMeta
}

/** Drena as versões marcadas para submissão e cria/edita cada uma na Meta. */
export async function submeterPendentes(deps: DepsSincronizarTemplates): Promise<number> {
  const { pool, logger, metaOpcoes } = deps
  const lote = await repo.reivindicar(pool)
  let submetidos = 0

  for (const t of lote) {
    try {
      const def = montarDefTemplate({
        nomeMeta: t.nome_meta,
        idioma: t.idioma,
        categoria: t.categoria,
        conteudo: t.conteudo,
        variaveis: t.variaveis,
        exemplos: t.exemplos,
      })
      // Já existe na Meta (versão anterior do mesmo nome) -> EDIT; senão CREATE.
      const r = t.meta_template_id
        ? await editarTemplateGraph(metaOpcoes, t.meta_template_id, def)
        : await criarTemplateGraph(metaOpcoes, def)
      // A Meta devolve PENDING na maioria dos casos; traduz (default pendente = em análise).
      const status = traduzirStatusTemplateMeta(r.status) ?? 'pendente'
      await repo.marcarSubmetido(pool, t.id, r.id, status)
      submetidos++
    } catch (erro) {
      if (erro instanceof ErroEnvio && erro.permanente) {
        // Recusa de formato/categoria: marca rejeitado com o motivo (sem reenfileirar).
        await repo.marcarRejeitado(pool, t.id, `meta_${erro.codigo}: ${erro.message}`)
        logger.warn({ templateId: t.id, codigo: erro.codigo }, 'template recusado pela Meta')
      } else {
        await repo.devolverParaSubmeter(pool, t.id)
        const msg = erro instanceof Error ? erro.message : String(erro)
        logger.warn({ templateId: t.id, msg }, 'falha transitória ao submeter template; reenfileirado')
      }
    }
  }

  return submetidos
}

/**
 * Reconcilia o status_meta com a lista real da WABA, casando por (nome_meta, idioma). Só
 * reflete o que a lista CONTÉM (não rebaixa por ausência: a lista pode vir paginada/parcial,
 * e rebaixar em massa seria destrutivo). Idempotente; cadência baixa (rede de segurança do
 * webhook, que é o caminho principal).
 */
export async function reconciliarTemplates(deps: DepsSincronizarTemplates): Promise<number> {
  const { pool, metaOpcoes } = deps
  const lista = await listarTemplatesGraph(metaOpcoes)
  let atualizados = 0

  for (const item of lista) {
    if (!item.name || !item.language) continue
    const status = traduzirStatusTemplateMeta(item.status)
    if (!status) continue
    atualizados += await repo.atualizarStatusPorNome(pool, item.name, item.language, status, null)
  }
  return atualizados
}

export interface DepsStatusTemplate {
  pool: Pool
  logger: Logger
}

/** Aplica um evento de mudança de status de template (webhook), por (nome_meta, idioma). */
export async function processarStatusTemplate(
  deps: DepsStatusTemplate,
  evento: EventoTemplateStatus,
): Promise<void> {
  const n = await repo.atualizarStatusPorNome(
    deps.pool,
    evento.nomeMeta,
    evento.idioma,
    evento.status,
    evento.motivo ?? null,
  )
  deps.logger.info({ nomeMeta: evento.nomeMeta, status: evento.status, linhas: n }, 'status de template atualizado pela Meta')
}
