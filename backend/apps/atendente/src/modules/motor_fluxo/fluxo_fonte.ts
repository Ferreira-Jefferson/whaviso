// Fonte do grafo do fluxo: o motor DIRIGE a conversa pela versao PUBLICADA do fluxo da loja (builder
// visual, API-fluxo onda 5), lida ao vivo do banco (read-only, grant SELECT de whaviso_atendente em
// `fluxos`/`fluxo_versoes`, migration 0049). Sem fluxo publicado, cai no FLUXO_PADRAO embutido no
// kernel (o mesmo grafo fixo do motor): loja que nunca personalizou segue funcionando.
//
// Fronteira: a api e o atendente NUNCA se importam; a integracao e so pelo banco. Aqui lemos a tabela
// direto pelo @whaviso/shared/db, sem tocar no modulo `fluxo` da api.
//
// Versao FIXADA por conversa (contrato de API-fluxo): ao iniciar, a conversa fixa a versao vigente em
// `conversas.contexto.fluxo_versao_id` e so adota uma nova publicada em conversa NOVA (versao publicada
// e imutavel, entao reler por id e estavel). Uma nova publicacao passa a valer no proximo turno das
// conversas ainda nao fixadas (cache invalida por id de versao).
import { FLUXO_PADRAO, FluxoGrafo } from '@whaviso/shared/contracts'
import { consultarUm, sql, type Executor } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'

/** Sentinela de "fixado no fluxo padrao do kernel" (distinto de null = ainda nao fixado). */
export const VERSAO_PADRAO = 'padrao'

export interface FonteFluxo {
  /** id da versao a FIXAR na conversa: uuid de uma versao publicada ou `VERSAO_PADRAO`. */
  readonly versaoId: string
  readonly grafo: FluxoGrafo
}

/**
 * Cache do grafo PARSEADO por id de versao. Versao publicada e imutavel (trigger no banco), entao o
 * parse pode ser memoizado com seguranca; `VERSAO_PADRAO` guarda o padrao do kernel. A invalidacao e
 * natural: uma nova publicacao gera um id novo, logo uma chave de cache nova.
 */
const cachePorVersao = new Map<string, FluxoGrafo>()
cachePorVersao.set(VERSAO_PADRAO, FLUXO_PADRAO)

/** So para os testes: zera o cache entre cenarios. */
export function limparCacheFluxo(): void {
  cachePorVersao.clear()
  cachePorVersao.set(VERSAO_PADRAO, FLUXO_PADRAO)
}

interface VersaoRow {
  versao_id: string
  grafo: unknown
}

/** Versao PUBLICADA vigente do fluxo ativo da loja (uma por loja; join por loja_id, SEC-001/002). */
async function lerPublicadaAtual(tx: Executor, lojaId: string): Promise<VersaoRow | null> {
  return consultarUm<VersaoRow>(
    tx,
    sql`select v.id as versao_id, v.grafo
          from public.fluxos f
          join public.fluxo_versoes v on v.fluxo_id = f.id and v.loja_id = f.loja_id
         where f.loja_id = ${lojaId} and f.ativo and v.status = 'publicada'
         limit 1`,
  )
}

/** Uma versao especifica (fixada na conversa), por id, sempre filtrando pela loja (SEC-002). */
async function lerPorVersao(tx: Executor, lojaId: string, versaoId: string): Promise<VersaoRow | null> {
  return consultarUm<VersaoRow>(
    tx,
    sql`select id as versao_id, grafo from public.fluxo_versoes
         where id = ${versaoId} and loja_id = ${lojaId} limit 1`,
  )
}

/** Parse defensivo: grafo malformado nunca derruba o turno (o builder ja valida na publicacao). */
function parseSeguro(raw: unknown, logger: Logger, lojaId: string, versaoId: string): FluxoGrafo | null {
  const r = FluxoGrafo.safeParse(raw)
  if (r.success) return r.data
  logger.warn({ loja_id: lojaId, versao_id: versaoId }, 'grafo de fluxo invalido: usando o padrao')
  return null
}

/**
 * Resolve o grafo que DIRIGE o turno e o id de versao a fixar na conversa.
 *  - conversa ainda nao fixada (`fixado` null): adota a publicada vigente (ou o padrao) e devolve o id
 *    para o motor fixar; e o momento em que uma nova publicacao passa a valer.
 *  - conversa ja fixada: le exatamente aquela versao (imutavel); some do banco => cai no padrao.
 */
export async function resolverFonte(
  tx: Executor,
  lojaId: string,
  fixado: string | null,
  logger: Logger,
): Promise<FonteFluxo> {
  if (fixado && fixado !== VERSAO_PADRAO) {
    const cacheado = cachePorVersao.get(fixado)
    if (cacheado) return { versaoId: fixado, grafo: cacheado }
    const row = await lerPorVersao(tx, lojaId, fixado)
    const grafo = row ? parseSeguro(row.grafo, logger, lojaId, fixado) : null
    if (grafo) {
      cachePorVersao.set(fixado, grafo)
      return { versaoId: fixado, grafo }
    }
    return { versaoId: VERSAO_PADRAO, grafo: FLUXO_PADRAO }
  }

  if (fixado === VERSAO_PADRAO) return { versaoId: VERSAO_PADRAO, grafo: FLUXO_PADRAO }

  // Ainda nao fixado: adota a publicada vigente, se houver.
  const row = await lerPublicadaAtual(tx, lojaId)
  if (!row) return { versaoId: VERSAO_PADRAO, grafo: FLUXO_PADRAO }
  const cacheado = cachePorVersao.get(row.versao_id)
  if (cacheado) return { versaoId: row.versao_id, grafo: cacheado }
  const grafo = parseSeguro(row.grafo, logger, lojaId, row.versao_id)
  if (!grafo) return { versaoId: VERSAO_PADRAO, grafo: FLUXO_PADRAO }
  cachePorVersao.set(row.versao_id, grafo)
  return { versaoId: row.versao_id, grafo }
}

/**
 * Config publicada do node da etapa atual (casada por `tipo`; v1: um node por tipo). Vazio quando a
 * etapa nao esta no grafo. O motor passa isso ao node, que valida com o proprio configSchema.
 */
export function configDaEtapa(grafo: FluxoGrafo, tipo: string): Record<string, unknown> {
  const no = grafo.nodes.find((n) => n.tipo === tipo)
  return no?.config ?? {}
}
