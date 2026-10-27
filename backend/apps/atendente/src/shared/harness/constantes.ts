// Constantes do harness: limites, textos fixos ao cliente e a versao do prompt. Textos em linguagem
// neutra de genero e sem palavras proibidas (historias/13); sem acento, como os demais textos do motor.
import type { LimitesHarness } from './tipos'

export const ORIGEM_LLM = 'harness'
export const VERSAO_PROMPT = 'harness-v1'

export const LIMITES_PADRAO: LimitesHarness = {
  maxPassos: 5,
  maxToolsPorPasso: 3,
  tetoCustoTurnoCentavos: 30,
  tetoTokensTurno: 24_000,
  timeoutTurnoMs: 30_000,
  limiarConfianca: 0.5,
  limiarInsistencia: 3,
}

/** 1a e 2a mensagem fora de escopo: redireciona com educacao. */
export const TEXTO_REDIRECIONA =
  'Aqui eu ajudo so com os pedidos e o cardapio da loja. Quer ver o cardapio ou fazer um pedido?'
/** Ultima mensagem antes do silencio: fecha com educacao, sem ser seca nem rude. */
export const TEXTO_AVISO_FINAL = 'Posso ajudar so com pedidos da loja. Se precisar de um pedido, e so me chamar.'
/** Aviso de handoff (nao promete prazo, nao admite erro tecnico). */
export const TEXTO_HANDOFF = 'Vou chamar uma pessoa da loja para te ajudar com isso. So um momento.'

/**
 * Textos de recusa de escopo. O contador de insistencia e DERIVADO de quantas saidas consecutivas da
 * IA sao exatamente estes textos (sem coluna nova): o motor persiste a saida em `mensagens`.
 */
export const TEXTOS_RECUSA_ESCOPO: readonly string[] = [TEXTO_REDIRECIONA, TEXTO_AVISO_FINAL]

/** Janela do historico enviado ao modelo (mensagens, nao a conversa toda). */
export const JANELA_HISTORICO = 8
export const MAX_CHARS_MENSAGEM = 1000
export const MAX_CHARS_PERSONA = 600
export const MAX_ITENS_CARDAPIO = 200
export const MAX_CHARS_RESULTADO_TOOL = 4000
export const MAX_CHARS_RESPOSTA = 900

/** Marca-d'agua dentro do system prompt: se aparecer na saida, o prompt vazou e a saida e descartada. */
export const CANARIO_PROMPT = 'cnr-7f3a91d2-hx'
