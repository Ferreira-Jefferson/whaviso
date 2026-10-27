// Porta de provedor de LLM: o ponto de troca entre provedores. Um adaptador implementa a interface
// `ClienteLLM` de F2 (completar/transcrever/descreverImagem/embutir) para UM provedor; trocar para
// Anthropic ou outro = novo adaptador + registro, SEM tocar em quem chama (o orquestrador resolve o
// adaptador pela coluna `provedor` da credencial da loja).
import type { ClienteLLM } from '@whaviso/shared/clientes'
import type { ProvedorLlm } from '../config'

/** Adaptador de um provedor concreto (transporte): implementa `ClienteLLM` para aquele provedor. */
export interface AdaptadorProvedor extends ClienteLLM {
  readonly provedor: ProvedorLlm
}

/** Resolve o adaptador de um provedor, ou `undefined` se nao ha adaptador (=> falha fechada). */
export type ResolverAdaptador = (provedor: ProvedorLlm) => AdaptadorProvedor | undefined

/** Monta um resolvedor a partir de um registro provedor -> adaptador. */
export function resolverPorRegistro(
  registro: Partial<Record<ProvedorLlm, AdaptadorProvedor>>,
): ResolverAdaptador {
  return (provedor) => registro[provedor]
}
