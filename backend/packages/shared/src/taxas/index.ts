// Resolucao da taxa de intermediacao de pagamento (whaviso, por transacao intermediada).
//
// A taxa vive no banco, nunca hardcoded: `config_plataforma` guarda o PADRAO da plataforma e
// `planos.taxa_intermediacao_centavos` um override por plano (NULL = herda o padrao; 0 = taxa zero
// explicita). A taxa aplicavel a uma conta e resolvida AO VIVO (assinatura ativa -> plano -> taxa,
// senao o padrao), com cache em processo do catalogo (padrao + taxas por plano), que muda com pouca
// frequencia, para nao reler config/planos a cada cobranca. Dinheiro sempre em centavos (int).
//
// Nao e segredo (e preco, exibido ao restaurante): sem cifra. Integridade vem de so operador alterar
// (rota de operador + 'planos:gerir', auditado); aqui so lemos.
import { consultar, consultarUm, sql, type Executor } from '../db'

/**
 * Escolha pura da taxa: o override do plano vence quando presente (inclusive 0 = taxa zero);
 * NULL ou ausente herda o padrao da plataforma.
 */
export function escolherTaxa(padraoCentavos: number, overridePlano: number | null | undefined): number {
  return overridePlano === null || overridePlano === undefined ? padraoCentavos : overridePlano
}

interface CatalogoTaxas {
  padrao: number
  porPlano: Map<string, number | null>
}

const TTL_MS = 60_000
let cache: { cat: CatalogoTaxas; expira: number } | null = null

/** Invalida o cache do catalogo (chamar apos editar o padrao da plataforma ou a taxa de um plano). */
export function invalidarCacheTaxas(): void {
  cache = null
}

async function carregarCatalogo(exec: Executor): Promise<CatalogoTaxas> {
  const conf = await consultarUm<{ padrao: number }>(
    exec,
    sql`select taxa_intermediacao_padrao_centavos as padrao from public.config_plataforma where id = 1`,
  )
  const planos = await consultar<{ id: string; taxa: number | null }>(
    exec,
    sql`select id, taxa_intermediacao_centavos as taxa from public.planos`,
  )
  const porPlano = new Map<string, number | null>()
  for (const p of planos) porPlano.set(p.id, p.taxa)
  // config_plataforma e semeada na migration 0084; na ausencia (nunca, em teoria) cai em 0 defensivo.
  return { padrao: conf?.padrao ?? 0, porPlano }
}

async function catalogo(exec: Executor): Promise<CatalogoTaxas> {
  const agora = Date.now()
  if (cache && cache.expira > agora) return cache.cat
  const cat = await carregarCatalogo(exec)
  cache = { cat, expira: agora + TTL_MS }
  return cat
}

/**
 * Taxa de intermediacao (centavos) aplicavel a uma conta: override do plano da assinatura ATIVA da
 * conta, senao o padrao da plataforma. O catalogo (padrao + taxas por plano) vem do cache; so o
 * vinculo conta -> plano ativo e lido ao vivo (indice em assinaturas).
 */
export async function resolverTaxaIntermediacao(exec: Executor, contaId: string): Promise<number> {
  const cat = await catalogo(exec)
  const assinatura = await consultarUm<{ plano_id: string | null }>(
    exec,
    sql`select plano_id from public.assinaturas
         where conta_id = ${contaId} and status = 'ativa'
         order by criado_em desc, id limit 1`,
  )
  const override = assinatura?.plano_id ? cat.porPlano.get(assinatura.plano_id) : undefined
  return escolherTaxa(cat.padrao, override)
}
