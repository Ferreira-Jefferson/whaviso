// Politica de papeis (F3, etapa 8; motor editavel no item 14). Mecanismo central e testavel;
// a politica FINA de cada recurso fica nos modulos.
//
// Quem pode o que NAO e mais tabela fixa no codigo: a grade vive no banco
// (`papel_permissoes`, editavel pela tela Acessos) e e lida via grade.ts com cache. Os PADROES
// semeados (catalogo.ts) reproduzem o comportamento anterior:
//   - dono:      tudo na conta (inclui conta/membros/billing), sempre (nao editavel)
//   - gerente:   tudo na loja, EXCETO conta/membros/billing
//   - atendente: so conversas e pedidos
//   - convidado: so leitura
// Spec: historias/00-fundacao/tenant-auth.md, Notas.
import type { PapelMembro, PapelOperador } from '@whaviso/shared/contracts'
import {
  CATALOGO,
  padraoPermite,
  PAPEIS_LOJA,
  type Permissao,
  type PermissaoLoja,
} from './catalogo'
import { permite } from './grade'

export type { Permissao }

/** Chaves de permissao da loja (catalogo). */
export const PERMISSOES: readonly PermissaoLoja[] = CATALOGO.filter((d) => d.escopo === 'loja').map(
  (d) => d.chave as PermissaoLoja,
)

/**
 * PADROES por papel de loja (seed). NAO e a grade viva: serve de referencia/teste de
 * regressao. A decisao em runtime e `papelPermite` (le a grade do banco).
 */
export const PERMISSOES_POR_PAPEL: Record<PapelMembro, ReadonlySet<PermissaoLoja>> = Object.fromEntries(
  PAPEIS_LOJA.map((p) => [
    p,
    new Set(CATALOGO.filter((d) => d.escopo === 'loja' && padraoPermite('loja', p, d.chave)).map((d) => d.chave as PermissaoLoja)),
  ]),
) as unknown as Record<PapelMembro, ReadonlySet<PermissaoLoja>>

/** Precedencia de privilegio, para desempatar quando ha dois vinculos a mesma loja. */
export const FORCA_PAPEL: Record<PapelMembro, number> = {
  dono: 4,
  gerente: 3,
  atendente: 2,
  convidado: 1,
}

/** Papel mais forte entre dois (usado ao fundir vinculo de loja + vinculo "todas"). */
export function papelMaisForte(a: PapelMembro, b: PapelMembro): PapelMembro {
  return FORCA_PAPEL[a] >= FORCA_PAPEL[b] ? a : b
}

/** true se o papel de loja tem a permissao (le a grade; dono sempre). */
export function papelPermite(papel: PapelMembro, permissao: Permissao): boolean {
  return permite('loja', papel, permissao)
}

/** true se o papel do console tem a permissao (le a grade; admin sempre). */
export function operadorPermite(papel: PapelOperador, permissao: Permissao): boolean {
  return permite('console', papel, permissao)
}
