// AT-harness: laco agentico do atendente (shared/, para o motor chamar sem import modulo->modulo).
// O harness ENTENDE e PROPOE; o motor deterministico EFETIVA. Ver MODULE.md.
export { rodarTurno, chaveHandoff } from './harness'
export { criarRepoHarness } from './repo'
export {
  LIMITES_PADRAO,
  ORIGEM_LLM,
  VERSAO_PROMPT,
  CANARIO_PROMPT,
  TEXTO_REDIRECIONA,
  TEXTO_AVISO_FINAL,
  TEXTO_HANDOFF,
  TEXTOS_RECUSA_ESCOPO,
} from './constantes'
export { contarRecusasConsecutivas, decidirEscopo, pareceTemaDaLoja, type AcaoEscopo } from './escopo'
export { montarSystemPrompt, montarMensagensIniciais, mensagemResultadoTool, sanear } from './prompt'
export { interpretarSaida, vazaSegredoOuPrompt, SaidaHarness } from './saida'
export type {
  DepsHarness,
  EntradaHarness,
  ResultadoHarness,
  LimitesHarness,
  MetricasTurno,
  MotivoSemLlm,
  DesfechoResposta,
  EntendimentoResumo,
  RegistroDeTools,
  RepoHarness,
  LojaEstado,
  MensagemRecente,
} from './tipos'
