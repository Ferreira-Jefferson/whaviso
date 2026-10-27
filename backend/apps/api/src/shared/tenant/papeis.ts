// Politica de papeis de loja (F3, etapa 8). Mecanismo central e testavel; a politica
// FINA de cada recurso fica nos modulos (API-conta et al.). Decisao de produto minima
// registrada no spec (historias/00-fundacao/tenant-auth.md, Notas):
//   - dono:      tudo na conta (inclui conta/membros/billing)
//   - gerente:   tudo na loja, EXCETO conta/membros/billing
//   - atendente: so conversas e pedidos
import type { PapelMembro } from '@whaviso/shared/contracts'

/**
 * Capacidades do kernel. Chaves estaveis `recurso:acao`. Grao propositalmente grosso:
 * o kernel decide quem opera o que da conta/loja; o refinamento por campo e dos modulos.
 */
export const PERMISSOES = [
  'conta:gerir', // dados da conta, membros, billing/assinatura (so dono)
  'loja:gerir', // cardapio, zonas, motoboys, numeros, templates, credencial de IA, config da loja
  'pedidos:gerir', // kanban de pedidos
  'conversas:atender', // conversas e handoff humano
  'relatorios:ver', // dashboard/metricas da loja
] as const
export type Permissao = (typeof PERMISSOES)[number]

/** Tabela papel -> conjunto de permissoes. Fonte unica, testada em papeis.test.ts. */
export const PERMISSOES_POR_PAPEL: Record<PapelMembro, ReadonlySet<Permissao>> = {
  dono: new Set<Permissao>([
    'conta:gerir',
    'loja:gerir',
    'pedidos:gerir',
    'conversas:atender',
    'relatorios:ver',
  ]),
  gerente: new Set<Permissao>([
    'loja:gerir',
    'pedidos:gerir',
    'conversas:atender',
    'relatorios:ver',
  ]),
  atendente: new Set<Permissao>(['pedidos:gerir', 'conversas:atender']),
}

/** Precedencia de privilegio, para desempatar quando ha dois vinculos a mesma loja. */
export const FORCA_PAPEL: Record<PapelMembro, number> = {
  dono: 3,
  gerente: 2,
  atendente: 1,
}

/** Papel mais forte entre dois (usado ao fundir vinculo de loja + vinculo "todas"). */
export function papelMaisForte(a: PapelMembro, b: PapelMembro): PapelMembro {
  return FORCA_PAPEL[a] >= FORCA_PAPEL[b] ? a : b
}

/** true se o papel tem a permissao. */
export function papelPermite(papel: PapelMembro, permissao: Permissao): boolean {
  return PERMISSOES_POR_PAPEL[papel].has(permissao)
}
