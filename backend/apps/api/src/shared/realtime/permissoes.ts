// Quem pode ver cada tipo de evento (F5, etapa 5). Reusa a tabela de papeis do tenant (F3):
// o evento exige a mesma permissao do recurso que ele referencia. Tipo desconhecido = negado.
import type { EscopoLoja, TipoEvento } from '@whaviso/shared/contracts'
import { papelPermite, type Permissao } from '../tenant'

export const PERMISSAO_POR_TIPO: Record<TipoEvento, Permissao> = {
  'pedido.atualizado': 'pedidos:gerir',
  'conversa.mensagem': 'conversas:atender',
  'conversa.handoff': 'conversas:atender',
}

/** true se o papel do usuario NA LOJA do evento permite ver aquele tipo. Fail closed. */
export function podeVerEvento(
  escopo: Pick<EscopoLoja, 'loja_ids' | 'papel_por_loja'>,
  lojaId: string,
  tipo: string,
): boolean {
  if (!escopo.loja_ids.includes(lojaId)) return false
  const permissao = (PERMISSAO_POR_TIPO as Record<string, Permissao | undefined>)[tipo]
  const papel = escopo.papel_por_loja[lojaId]
  if (!permissao || !papel) return false
  return papelPermite(papel, permissao)
}
