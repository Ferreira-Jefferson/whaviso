// Apresentacao do cardapio: rotulos e helpers de texto. Nenhuma regra de negocio aqui;
// disponibilidade e pedivel vem resolvidos do servidor (flags na arvore).
import type { TipoGrupo } from '@/shared/contracts/_generated/enums'
import type { GrupoResolvido, GrupoSaida } from '@/shared/contracts/_generated/cardapio'

export const ROTULO_TIPO_GRUPO: Record<TipoGrupo, string> = {
  tamanho: 'Tamanho',
  adicional: 'Adicional',
  customizado: 'Personalizado',
}

export const OPCOES_TIPO_GRUPO = (Object.keys(ROTULO_TIPO_GRUPO) as TipoGrupo[]).map((value) => ({
  value,
  label: ROTULO_TIPO_GRUPO[value],
}))

/** Texto curto de quantas escolhas o grupo pede (ex.: "Escolha 1", "De 1 a 3", "Ate 2"). */
export function regraEscolhas(g: Pick<GrupoSaida, 'obrigatorio' | 'min_escolhas' | 'max_escolhas'>): string {
  const min = g.obrigatorio ? Math.max(1, g.min_escolhas) : g.min_escolhas
  const max = g.max_escolhas
  if (max === null) return min > 0 ? `Escolha ${min} ou mais` : 'Escolha livre'
  if (max === min && max > 0) return `Escolha ${max}`
  if (min <= 0) return `Ate ${max}`
  return `De ${min} a ${max}`
}

/** Origem de um grupo resolvido no contexto de um item: herdado da categoria ou extra do item. */
export function rotuloOrigemGrupo(origem: GrupoResolvido['origem']): string {
  return origem === 'item' ? 'Só deste item' : 'Da categoria'
}
