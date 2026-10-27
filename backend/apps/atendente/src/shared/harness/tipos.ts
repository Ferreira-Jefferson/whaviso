// Tipos do harness (AT-harness). Tudo aqui e DADO: o harness ENTENDE e PROPOE; o motor
// deterministico EFETIVA (HARNESS-ATENDENTE.md, fronteira sagrada; SEC-061). Estes tipos sao
// estruturais de proposito: o harness vive em shared/ e nao pode importar modules/ (tools,
// entender_mensagem), entao o motor injeta implementacoes que cabem nestas formas.
import type { ConversaCtx, EfeitoTool, RespostaProposta } from '@whaviso/shared/contracts'
import type { FerramentaLlm } from '@whaviso/shared/clientes'
import type { Executor } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import type { ServicoLlm } from '../llm_client'

/** Limites duros do turno. Quem manda no laco e o harness, nao o modelo (sinal de parada nao confiavel). */
export interface LimitesHarness {
  /** Chamadas ao LLM por turno (inclui a de reparo da saida). */
  maxPassos: number
  /** Tool-calls executadas por passo; as demais recebem erro acionavel. */
  maxToolsPorPasso: number
  /** Custo acumulado do turno em centavos (soma de `uso.custoEstimadoCentavos`). */
  tetoCustoTurnoCentavos: number
  /** Tokens (entrada + saida) acumulados no turno: protege quando o custo estimado arredonda a 0. */
  tetoTokensTurno: number
  /** Tempo total do turno. */
  timeoutTurnoMs: number
  /** Abaixo desta confianca da saida final, nao responde: chama humano. */
  limiarConfianca: number
  /** Off-topic consecutivo: 1..limiar-1 redireciona, == limiar avisa que vai parar, > limiar silencio. */
  limiarInsistencia: number
}

/** Resultado minimo do entendimento (compativel com `ResultadoEntendimento` do entender_mensagem). */
export type EntendimentoResumo =
  | {
      readonly estado: 'entendido'
      readonly intencao: { readonly tipo: string }
      readonly confianca: number
      readonly foraDeEscopo: boolean
    }
  | {
      readonly estado: 'baixa_confianca'
      readonly intencao: { readonly tipo: string }
      readonly foraDeEscopo: boolean
    }
  | { readonly estado: 'esclarecer' }
  | { readonly estado: 'sem_llm'; readonly motivo: string }

/** Registry de tools, como o harness o enxerga (cabe em `RegistroTools` de modules/tools). */
export interface RegistroDeTools {
  specs(): FerramentaLlm[]
  efeitoDe(nome: string): EfeitoTool | undefined
  executar(
    chamada: { id: string; nome: string; argumentos: unknown },
    ctx: ConversaCtx,
  ): Promise<
    { ok: true; dados: unknown } | { ok: false; erro: { codigo: string; mensagem: string } }
  >
}

export interface LojaEstado {
  readonly suspensa: boolean
  readonly ativo: boolean
}

export interface MensagemRecente {
  readonly direcao: 'entrada' | 'saida'
  readonly autor: 'cliente' | 'ia' | 'humano' | 'sistema'
  readonly conteudo: string
}

/** Leituras de banco do harness (somente SELECT: lojas, mensagens). */
export interface RepoHarness {
  lerLoja(lojaId: string): Promise<LojaEstado | null>
  /** Ultimas saidas da IA (mais recente primeiro). Base do contador de insistencia (sem migration). */
  ultimasSaidasIa(lojaId: string, conversaId: string, limite: number): Promise<string[]>
  /** Janela do historico (mais antiga primeiro), sem a mensagem atual. */
  historicoRecente(lojaId: string, conversaId: string, limite: number, excluirMensagemId?: string): Promise<MensagemRecente[]>
}

export interface DepsHarness {
  servico: ServicoLlm
  registro: RegistroDeTools
  repo: RepoHarness
  logger: Logger
  /** Executor (role whaviso_atendente) repassado ao ServicoLlm para credencial/uso da loja. */
  exec: Executor
  /** Pre-passo barato de escopo (cabe em `Entendedor.entender` com cardapio/exec ja amarrados). */
  entender?: (texto: string) => Promise<EntendimentoResumo>
  limites?: Partial<LimitesHarness>
}

export interface EntradaHarness {
  /** Selado pelo servidor (selarCtxDaConversa). O modelo nunca o ve. */
  ctx: ConversaCtx
  /** Texto do cliente (ja transcrito, se era audio). Tratado como DADO nao confiavel. */
  texto: string
  /** Id da mensagem atual em `mensagens`, para nao duplicar no historico. */
  mensagemId?: string
  /** Se o motor ja entendeu a mensagem (ex.: audio), evita a segunda classificacao. */
  entendimento?: EntendimentoResumo
  /** Nome e persona da loja (config do dono, menos confiavel que os guardrails). */
  lojaNome?: string
  persona?: string | null
  /** Nomes do cardapio vivo DESTA loja (so nomes; preco/estoque vem das tools). */
  cardapioNomes?: readonly string[]
}

export type MotivoSemLlm =
  | 'loja_suspensa'
  | 'sem_texto'
  | 'indisponivel'
  | 'limite_excedido'
  | 'credencial_recusada'
  | 'erro_provedor'
  | 'teto_passos'
  | 'teto_gasto'
  | 'timeout'

export type DesfechoResposta =
  | 'resposta'
  | 'handoff'
  | 'recusa_escopo'
  | 'aviso_final_escopo'
  | 'vazamento_bloqueado'

export type MotivoParada = 'saida_final' | 'teto_passos' | 'teto_gasto' | 'timeout' | 'erro_llm' | 'saida_invalida'

/** Metricas do turno: SEM PII, SEM chave, SEM texto (vai para log/eventos). */
export interface MetricasTurno {
  passos: number
  ferramentas: string[]
  tokensIn: number
  tokensOut: number
  custoCentavos: number
  paradaPor: MotivoParada | 'pre_check'
  desfecho: DesfechoResposta | 'silencio' | 'sem_llm'
}

/**
 * O que o motor recebe.
 *  - `resposta`: mensagens + eventos PROPOSTOS. O motor valida e efetiva (inclusive o handoff:
 *    evento `escalar_humano` => `conversas.status = 'humano'` + `conversa.handoff`).
 *  - `silencio`: insistencia off-topic acima do limiar; o motor so consome a mensagem (sem envio).
 *  - `sem_llm`: o motor segue o fluxo por botoes (degradacao segura, nunca erro ao cliente).
 */
export type ResultadoHarness =
  | { tipo: 'resposta'; resposta: RespostaProposta; desfecho: DesfechoResposta; metricas: MetricasTurno }
  | { tipo: 'silencio'; motivo: 'insistencia_fora_de_escopo'; metricas: MetricasTurno }
  | { tipo: 'sem_llm'; motivo: MotivoSemLlm; metricas: MetricasTurno }
