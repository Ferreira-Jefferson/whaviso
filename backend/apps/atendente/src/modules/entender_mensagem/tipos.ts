// Tipos do entendimento de mensagem (AT-entender). Tudo aqui e DADO: o modelo PROPOE uma intencao
// e o motor/harness decide o que fazer (SEC-061). Nada neste modulo executa efeito.
import { z } from 'zod'

const Confianca = z.number().min(0).max(1)
const Nome = z.string().trim().min(1).max(120)
const Quantidade = z.number().int().min(1).max(99)

/** Por que uma mensagem caiu em `desconhecida` (alimenta a trava de escopo do harness). */
export const MotivoDesconhecida = z.enum(['fora_de_escopo', 'ambigua', 'injecao'])
export type MotivoDesconhecida = z.infer<typeof MotivoDesconhecida>

export const AssuntoConsulta = z.enum(['preco', 'horario', 'cardapio', 'taxa_entrega', 'pagamento', 'outro'])
export type AssuntoConsulta = z.infer<typeof AssuntoConsulta>

/**
 * Intencao PROPOSTA pelo modelo (schema validado por Zod em `completarEstruturado`). Nomes de item e
 * opcao sao texto livre do cliente: a ancoragem ao cardapio real e feita depois, de forma
 * deterministica (`ancoragem.ts`); o modelo nunca fornece ids.
 */
export const IntencaoModelo = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('adicionar_item'),
    confianca: Confianca,
    item: Nome,
    quantidade: Quantidade.default(1),
    opcoes: z.array(Nome).max(10).default([]),
  }),
  z.object({ tipo: z.literal('remover_item'), confianca: Confianca, item: Nome }),
  z.object({
    tipo: z.literal('alterar_item'),
    confianca: Confianca,
    item: Nome,
    quantidade: Quantidade.optional(),
    opcoes: z.array(Nome).max(10).default([]),
  }),
  z.object({
    tipo: z.literal('consulta'),
    confianca: Confianca,
    assunto: AssuntoConsulta,
    item: Nome.optional(),
  }),
  z.object({ tipo: z.literal('informar_endereco'), confianca: Confianca, endereco: z.string().trim().min(1).max(300) }),
  z.object({ tipo: z.literal('confirmar'), confianca: Confianca }),
  z.object({ tipo: z.literal('cancelar'), confianca: Confianca }),
  z.object({ tipo: z.literal('falar_com_humano'), confianca: Confianca }),
  z.object({ tipo: z.literal('acompanhar'), confianca: Confianca }),
  z.object({ tipo: z.literal('desconhecida'), confianca: Confianca, motivo: MotivoDesconhecida.default('ambigua') }),
])
export type IntencaoModelo = z.infer<typeof IntencaoModelo>

export type TipoIntencao = IntencaoModelo['tipo']

/** Item do cardapio vivo da loja, so o necessario para ancorar nomes (sem preco, sem opcoes). */
export interface ItemCardapio {
  readonly id: string
  readonly nome: string
}

/** Entrada de ancoragem/prompt: somente o cardapio DA LOJA da conversa (SEC-062). */
export interface CardapioEntendimento {
  readonly itens: readonly ItemCardapio[]
}

/** Entidade de item resolvida contra o cardapio real, ou marcada para esclarecimento. */
export type ItemAncorado =
  | { readonly estado: 'ancorado'; readonly itemId: string; readonly nome: string; readonly citado: string }
  | { readonly estado: 'sem_correspondencia'; readonly citado: string }
  | { readonly estado: 'ambiguo'; readonly citado: string; readonly candidatos: readonly ItemCardapio[] }

/** Intencao ja ancorada ao cardapio; `itemAncorado` so existe nas intencoes que citam item. */
export type IntencaoEntendida = IntencaoModelo & { readonly itemAncorado?: ItemAncorado }

export type MotivoEsclarecer =
  | 'item_sem_correspondencia'
  | 'item_ambiguo'
  | 'audio_invalido'
  | 'audio_nao_entendido'

export type MotivoSemLlm = 'indisponivel' | 'limite_excedido' | 'credencial_recusada' | 'erro_provedor'

/**
 * Resultado do entendimento (DADO consumido pelo motor/harness):
 *  - `entendido`: intencao valida acima do limiar; `foraDeEscopo` alimenta a trava de escopo.
 *  - `baixa_confianca`: o motor apresenta botoes/lista em vez de agir.
 *  - `esclarecer`: o motor pergunta de volta (item inexistente/ambiguo, audio ruim). Nunca inventa item.
 *  - `sem_llm`: LLM ausente, sem teto ou com falha; o motor segue o fluxo fixo por botoes.
 * `transcricao` vem preenchida quando a entrada era audio e o chamador a persiste em `mensagens`.
 */
export type ResultadoEntendimento =
  | {
      readonly estado: 'entendido'
      readonly intencao: IntencaoEntendida
      readonly confianca: number
      readonly foraDeEscopo: boolean
      readonly transcricao?: string
    }
  | {
      readonly estado: 'baixa_confianca'
      readonly intencao: IntencaoModelo
      readonly foraDeEscopo: boolean
      readonly transcricao?: string
    }
  | {
      readonly estado: 'esclarecer'
      readonly motivo: MotivoEsclarecer
      readonly citado?: string
      readonly candidatos?: readonly ItemCardapio[]
      readonly transcricao?: string
    }
  | { readonly estado: 'sem_llm'; readonly motivo: MotivoSemLlm }

/** Audio ja baixado pelo chamador (via ClienteWhats); este modulo nunca o persiste. */
export interface AudioEntrada {
  readonly bytes: Uint8Array<ArrayBuffer>
  readonly mimeType: string
}

export type EntradaMensagem =
  | { readonly tipo: 'texto'; readonly texto: string }
  | { readonly tipo: 'audio'; readonly audio: AudioEntrada }
