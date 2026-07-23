// Conjuntos de estados de aviso usados pelo painel (E9) e pelos gates de plano.
// FONTE ÚNICA: resumo, listagem por faixa e "precisa de você" derivam daqui, para
// que "ativo não pago" signifique o mesmo em todo lugar (H9.2/H9.3, sem divergência).
import type { StatusAviso } from '@whaviso/shared/contracts'

/**
 * ATIVOS NÃO PAGOS (H9.2): contam nos totais "a receber"/"a pagar". Inclui todos os
 * estados vivos que ainda não viraram `pago` nem terminal não-pago. `aguardando_aceite`
 * entra (combinado vivo aguardando confirmação); os de suspensão (pausado/edição/
 * desregistrado) também (o combinado existe, só não envia agora). Terminais NÃO entram.
 */
export const ATIVOS_NAO_PAGOS: readonly StatusAviso[] = [
  'aguardando_aceite',
  'programado',
  'informado_pago',
  'pausado',
  'aguardando_aprovacao_aviso_editado',
  // Item 7 (migration 0092): mesma disciplina de suspensão de aguardando_aprovacao_aviso_editado;
  // o valor ainda é devido, só pausado até o cobrador aprovar/recusar o reporte.
  'aguardando_aprovacao_dado_incorreto',
  'desregistrado',
]

/**
 * TERMINAIS NÃO PAGOS (H9.2/H9.3): nunca entram nos totais "a receber"/"a pagar";
 * vivem só no histórico. `pago` é terminal mas é contado à parte (recebido/pago).
 */
export const TERMINAIS_NAO_PAGOS: readonly StatusAviso[] = ['cancelado', 'recusado', 'expirado']

/** Estados do HISTÓRICO (terminais, incluindo pago). Fora da lista de "ativos". */
export const HISTORICO: readonly StatusAviso[] = [...TERMINAIS_NAO_PAGOS, 'pago']

/** Faixa "Sem aviso" (agenda): separada dos ativos (H9.3, E4 H4.2). */
export const AGENDA: readonly StatusAviso[] = ['sem_aviso']

/** Faixa de combinados ATIVOS na lista do painel (ativos não pagos; exclui agenda). */
export const ATIVOS_LISTA: readonly StatusAviso[] = ATIVOS_NAO_PAGOS

/** Grupos de faixa que o servidor decide (H9.8: a regra de quais estados vivem no front). */
export type GrupoFaixa = 'ativos' | 'agenda' | 'historico'

export function estadosDoGrupo(grupo: GrupoFaixa): readonly StatusAviso[] {
  switch (grupo) {
    case 'ativos':
      return ATIVOS_LISTA
    case 'agenda':
      return AGENDA
    case 'historico':
      return HISTORICO
  }
}
